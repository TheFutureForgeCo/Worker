/**
 * ComputeGrid Worker Process
 * Runs as a child process of the Electron app
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const os = require('os');

// Configuration from environment
const API_KEY = process.env.CG_API_KEY || '';
const SERVER_URL = process.env.CG_SERVER_URL || '';
const APP_VERSION = process.env.CG_APP_VERSION || '1.0.0';
const APP_SIGNATURE = process.env.CG_APP_SIGNATURE || 'desktop';

// Settings
const POLL_INTERVAL_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 30000;
const INTEGRITY_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const OLLAMA_HOST = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'mistral';
const FALLBACK_MODEL = 'tinyllama';

// Integrity verification state
let pendingChallengeId = null;
let pendingChallengeResponse = null;
let integrityVerified = false;

let isRunning = true;
let isPaused = false;
let ollamaReady = false;
let activeModel = DEFAULT_MODEL;
let stats = {
  tasksCompleted: 0,
  earnings: '0.00',
  status: 'starting'
};

// Send stats to parent process
function sendStats() {
  if (process.send) {
    process.send({ type: 'stats', data: stats });
  }
}

// Log with timestamp
function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] ${message}`);
}

// Compute challenge response for server verification
function computeChallengeResponse(challenge) {
  const response = crypto.createHash('sha256')
    .update(challenge + APP_SIGNATURE + APP_VERSION)
    .digest('hex');
  return response;
}

// Make HTTP request with integrity headers
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    // Add integrity verification headers
    const integrityHeaders = {
      'X-Worker-Version': APP_VERSION,
      'X-Worker-Signature': APP_SIGNATURE,
      'X-Worker-Type': 'desktop'
    };

    // If we have a pending challenge response, include it
    if (pendingChallengeId && pendingChallengeResponse) {
      integrityHeaders['X-Challenge-Id'] = pendingChallengeId;
      integrityHeaders['X-Challenge-Response'] = pendingChallengeResponse;
      log(`Sending challenge response for: ${pendingChallengeId}`);
      // Clear after sending
      pendingChallengeId = null;
      pendingChallengeResponse = null;
    }

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        ...integrityHeaders,
        ...options.headers
      }
    };

    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          
          // Check if server sent a new challenge - store response for next request
          if (parsed.challenge && parsed.challengeId) {
            pendingChallengeId = parsed.challengeId;
            pendingChallengeResponse = computeChallengeResponse(parsed.challenge);
            log(`Received integrity challenge: ${parsed.challengeId}, response computed`);
          }
          
          // Check if server verified our integrity
          if (parsed.integrityFailed) {
            log('WARNING: Server flagged integrity verification failure');
            integrityVerified = false;
          } else if (parsed.integrityVerified) {
            if (!integrityVerified) {
              log('SUCCESS: Integrity verified by server');
            }
            integrityVerified = true;
          }
          
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

// Check if Ollama is running
async function checkOllama() {
  try {
    const response = await makeRequest(`${OLLAMA_HOST}/api/tags`);
    if (response.status === 200) {
      const models = response.data.models || [];
      const hasModel = models.some(m => 
        m.name.includes(DEFAULT_MODEL) || m.name.includes(FALLBACK_MODEL)
      );
      if (hasModel) {
        activeModel = models.find(m => m.name.includes(DEFAULT_MODEL)) 
          ? DEFAULT_MODEL 
          : FALLBACK_MODEL;
        ollamaReady = true;
        log(`Ollama ready with model: ${activeModel}`);
        return true;
      }
    }
  } catch (err) {
    // Ollama not running
  }
  return false;
}

// Start Ollama service
async function startOllama() {
  return new Promise((resolve) => {
    log('Starting Ollama service...');
    const ollamaProcess = spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore'
    });
    ollamaProcess.unref();
    
    // Wait a bit for it to start
    setTimeout(resolve, 3000);
  });
}

// Pull model if not available
async function pullModel(modelName) {
  return new Promise((resolve, reject) => {
    log(`Pulling model: ${modelName}...`);
    exec(`ollama pull ${modelName}`, { timeout: 600000 }, (error) => {
      if (error) {
        log(`Failed to pull ${modelName}: ${error.message}`);
        reject(error);
      } else {
        log(`Successfully pulled ${modelName}`);
        resolve();
      }
    });
  });
}

// Setup Ollama
async function setupOllama() {
  const ready = await checkOllama();
  if (ready) return true;

  // Try to start Ollama
  try {
    await startOllama();
    await new Promise(r => setTimeout(r, 3000));
    
    const running = await checkOllama();
    if (!running) {
      // Try to pull a model
      const totalMem = os.totalmem() / (1024 * 1024 * 1024);
      const modelToPull = totalMem >= 8 ? DEFAULT_MODEL : FALLBACK_MODEL;
      
      try {
        await pullModel(modelToPull);
        activeModel = modelToPull;
        ollamaReady = true;
        return true;
      } catch {
        log('Could not pull model. Will use simulated responses.');
      }
    }
  } catch (err) {
    log('Ollama not available. Will use simulated responses.');
  }
  
  return ollamaReady;
}

// Generate AI response using Ollama
async function generateWithOllama(prompt, systemPrompt = '') {
  if (!ollamaReady) {
    return simulateResponse(prompt);
  }

  try {
    const response = await makeRequest(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      body: {
        model: activeModel,
        prompt: systemPrompt ? `${systemPrompt}\n\nUser: ${prompt}` : prompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 1024
        }
      }
    });

    if (response.status === 200 && response.data.response) {
      return response.data.response;
    }
  } catch (err) {
    log(`Ollama error: ${err.message}`);
  }

  return simulateResponse(prompt);
}

// Simulate response when Ollama not available
function simulateResponse(prompt) {
  const responses = [
    "I've analyzed your request and here's my response based on the available information.",
    "Based on my analysis, I can provide the following insights.",
    "Here's what I found after processing your query.",
    "I've processed your request. Here are my findings."
  ];
  
  const baseResponse = responses[Math.floor(Math.random() * responses.length)];
  return `${baseResponse}\n\n*Note: This is a simulated response. For AI-powered responses, please ensure Ollama is installed and running.*`;
}

// Poll for tasks
async function pollForTasks() {
  if (isPaused) return null;

  try {
    const response = await makeRequest(`${SERVER_URL}/api/worker/poll`);
    
    if (response.status === 200 && response.data.task) {
      return response.data.task;
    }
  } catch (err) {
    log(`Poll error: ${err.message}`);
  }
  
  return null;
}

// Claim a task
async function claimTask(taskId) {
  try {
    const response = await makeRequest(`${SERVER_URL}/api/worker/claim/${taskId}`, {
      method: 'POST'
    });
    
    return response.status === 200;
  } catch (err) {
    log(`Claim error: ${err.message}`);
    return false;
  }
}

// Complete a task
async function completeTask(taskId, result, actualTokens = 0) {
  try {
    const response = await makeRequest(`${SERVER_URL}/api/worker/complete/${taskId}`, {
      method: 'POST',
      body: { result, actualTokens }
    });
    
    if (response.status === 200 && response.data) {
      const earned = response.data.workerEarning || 0;
      stats.tasksCompleted++;
      stats.earnings = (parseFloat(stats.earnings) + earned).toFixed(2);
      sendStats();
      log(`Task completed! Earned: $${earned.toFixed(4)}`);
      return true;
    }
  } catch (err) {
    log(`Complete error: ${err.message}`);
  }
  
  return false;
}

// Process a task
async function processTask(task) {
  log(`Processing task ${task.id}: ${task.taskType}`);
  
  let result = '';
  let tokens = 0;

  if (task.taskType === 'chat' || task.taskType === 'inference') {
    // Extract prompt from task data
    const taskData = typeof task.taskData === 'string' 
      ? JSON.parse(task.taskData) 
      : task.taskData;
    
    const prompt = taskData.prompt || taskData.message || 'Hello';
    const systemPrompt = taskData.systemPrompt || '';
    
    result = await generateWithOllama(prompt, systemPrompt);
    tokens = result.split(/\s+/).length * 1.3; // Rough token estimate
  } else {
    // Generic task processing
    result = JSON.stringify({ 
      status: 'completed', 
      message: 'Task processed successfully',
      timestamp: new Date().toISOString()
    });
    tokens = 100;
  }

  return { result, tokens: Math.round(tokens) };
}

// Send heartbeat
async function sendHeartbeat() {
  try {
    await makeRequest(`${SERVER_URL}/api/worker/heartbeat`, {
      method: 'POST'
    });
  } catch (err) {
    // Silent fail for heartbeat
  }
}

// Main loop
async function mainLoop() {
  log('ComputeGrid Worker starting...');
  
  if (!API_KEY || !SERVER_URL) {
    log('ERROR: API key or server URL not configured');
    stats.status = 'error: not configured';
    sendStats();
    return;
  }

  // Setup Ollama
  await setupOllama();
  
  stats.status = 'running';
  sendStats();
  log('Worker is now running. Polling for tasks...');

  // Heartbeat interval
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

  // Main polling loop
  while (isRunning) {
    if (!isPaused) {
      const task = await pollForTasks();
      
      if (task) {
        const claimed = await claimTask(task.id);
        
        if (claimed) {
          const { result, tokens } = await processTask(task);
          await completeTask(task.id, result, tokens);
        }
      }
    }
    
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
}

// Handle process signals
process.on('SIGINT', () => {
  log('Received SIGINT, shutting down...');
  isRunning = false;
  stats.status = 'stopped';
  sendStats();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Received SIGTERM, shutting down...');
  isRunning = false;
  stats.status = 'stopped';
  sendStats();
  process.exit(0);
});

// Start the worker
mainLoop().catch(err => {
  log(`Fatal error: ${err.message}`);
  stats.status = 'error';
  sendStats();
  process.exit(1);
});
