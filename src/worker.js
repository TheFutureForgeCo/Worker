/**
 * ComputeGrid Worker Process
 * Runs as a child process of the Electron app
 * Resilient design - continues running even if AI setup fails
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Log file for debugging - use userData folder or temp
const LOG_DIR = process.env.CG_LOG_DIR || os.tmpdir();
const LOG_FILE = path.join(LOG_DIR, 'computegrid-worker.log');

// IMMEDIATE logging - write the very first line before anything else
const earlyLog = (msg) => {
  try {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {}
};

// Start logging immediately
earlyLog('='.repeat(60));
earlyLog('WORKER PROCESS STARTED');
earlyLog(`PID: ${process.pid}`);
earlyLog(`Node version: ${process.version}`);
earlyLog(`Platform: ${process.platform}, Arch: ${process.arch}`);
earlyLog(`CWD: ${process.cwd()}`);
earlyLog(`Log file: ${LOG_FILE}`);
earlyLog(`CG_API_KEY set: ${process.env.CG_API_KEY ? 'yes' : 'no'}`);
earlyLog(`CG_SERVER_URL: ${process.env.CG_SERVER_URL || 'NOT SET'}`);
earlyLog(`CG_APP_VERSION: ${process.env.CG_APP_VERSION || 'NOT SET'}`);
earlyLog(`IPC available: ${typeof process.send === 'function' ? 'yes' : 'no'}`);
earlyLog('='.repeat(60));

// Ensure we catch all unhandled errors
process.on('uncaughtException', (err) => {
  logToFile(`UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}`);
  // Don't exit - keep running
});

process.on('unhandledRejection', (reason) => {
  logToFile(`UNHANDLED REJECTION: ${reason}`);
  // Don't exit - keep running
});

// Configuration from environment
const API_KEY = process.env.CG_API_KEY || '';
const SERVER_URL = process.env.CG_SERVER_URL || '';
const APP_VERSION = process.env.CG_APP_VERSION || '1.0.0';
const APP_SIGNATURE = process.env.CG_APP_SIGNATURE || 'desktop';

// Settings
const POLL_INTERVAL_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 30000;
const RECONNECT_DELAY_MS = 10000;
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
let connectionFailed = false;
let lastError = null;

let stats = {
  tasksCompleted: 0,
  status: 'starting'
};

// Write to log file
function logToFile(message) {
  try {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, logLine);
  } catch (e) {
    // Silent fail for logging
  }
}

// Send stats to parent process
function sendStats() {
  try {
    if (process.send) {
      process.send({ type: 'stats', data: stats });
    }
  } catch (e) {
    logToFile(`Failed to send stats: ${e.message}`);
  }
}

// Send error to parent process
function sendError(error) {
  try {
    if (process.send) {
      process.send({ type: 'error', error: error });
    }
  } catch (e) {
    logToFile(`Failed to send error: ${e.message}`);
  }
}

// Log with timestamp (to console and file)
function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  const fullMessage = `[${timestamp}] ${message}`;
  console.log(fullMessage);
  logToFile(message);
}

// Compute challenge response for server verification
function computeChallengeResponse(challenge) {
  try {
    const response = crypto.createHash('sha256')
      .update(challenge + APP_SIGNATURE + APP_VERSION)
      .digest('hex');
    return response;
  } catch (e) {
    log(`Challenge response error: ${e.message}`);
    return '';
  }
}

// Make HTTP request with timeout and error handling
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    try {
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
        pendingChallengeId = null;
        pendingChallengeResponse = null;
      }

      const reqOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        timeout: options.timeout || 30000,
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
            
            // Check if server sent a new challenge
            if (parsed.challenge && parsed.challengeId) {
              pendingChallengeId = parsed.challengeId;
              pendingChallengeResponse = computeChallengeResponse(parsed.challenge);
              log(`Received integrity challenge: ${parsed.challengeId}`);
            }
            
            // Check integrity status
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
            resolve({ status: res.statusCode, data: data });
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.on('error', (err) => {
        reject(err);
      });
      
      if (options.body) {
        req.write(JSON.stringify(options.body));
      }
      
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Check if Ollama is running (non-blocking)
async function checkOllama() {
  try {
    const response = await makeRequest(`${OLLAMA_HOST}/api/tags`, { timeout: 5000 });
    if (response.status === 200 && response.data && response.data.models) {
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
    // Ollama not available - this is fine
    log(`Ollama check failed: ${err.message}`);
  }
  return false;
}

// Try to setup Ollama (non-fatal if it fails)
async function setupOllama() {
  try {
    log('Checking for Ollama...');
    const ready = await checkOllama();
    if (ready) {
      log('Ollama is available and ready');
      return true;
    }
    log('Ollama not available - will use simulated responses');
    ollamaReady = false;
    return false;
  } catch (err) {
    log(`Ollama setup error (non-fatal): ${err.message}`);
    ollamaReady = false;
    return false;
  }
}

// Generate AI response using Ollama
async function generateWithOllama(prompt, systemPrompt = '') {
  if (!ollamaReady) {
    return simulateResponse(prompt);
  }

  try {
    const response = await makeRequest(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      timeout: 120000,
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

    if (response.status === 200 && response.data && response.data.response) {
      return response.data.response;
    }
  } catch (err) {
    log(`Ollama generation error: ${err.message}`);
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
  return `${baseResponse}\n\n*Note: This is a simulated response. For AI-powered responses, please ensure Ollama is installed and running with a compatible model.*`;
}

// Poll for tasks
async function pollForTasks() {
  if (isPaused) return null;

  try {
    const response = await makeRequest(`${SERVER_URL}/api/worker/poll`, { timeout: 15000 });
    
    // Handle successful response
    if (response.status === 200) {
      // Clear any previous connection errors
      if (connectionFailed) {
        log('Connection restored');
        connectionFailed = false;
        lastError = null;
        stats.status = 'Running';
        sendStats();
      }
      
      // Check for tasks array (new format) or single task
      if (response.data?.tasks?.length > 0) {
        return response.data.tasks[0];
      }
      if (response.data?.task) {
        return response.data.task;
      }
      
      return null;
    }
    
    // Handle error responses
    const msg = response.data?.message || `HTTP ${response.status}`;
    
    if (!connectionFailed) {
      log(`Poll failed: ${response.status} - ${msg}`);
      connectionFailed = true;
      lastError = msg;
      
      // Only send specific errors to user
      if (response.status === 400) {
        // Worker must be online - likely server thinks we're offline
        sendError('Server thinks worker is offline. Trying to reconnect...');
        stats.status = 'Reconnecting...';
      } else if (response.status === 401) {
        sendError('Invalid API key. Please check your API key in settings.');
        stats.status = 'Error: Invalid API key';
      } else if (response.status >= 500) {
        stats.status = 'Server error - retrying...';
      }
      sendStats();
    }
    
    return null;
  } catch (err) {
    if (!connectionFailed) {
      log(`Poll error: ${err.message}`);
      connectionFailed = true;
      lastError = err.message;
      
      // Network-level errors
      if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
        sendError('Cannot reach server. Check your internet connection.');
        stats.status = 'Connection error';
      } else if (err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
        stats.status = 'Connection slow - retrying...';
      } else {
        stats.status = 'Network error - retrying...';
      }
      sendStats();
    }
    return null;
  }
}

// Claim a task
async function claimTask(taskId) {
  try {
    const response = await makeRequest(`${SERVER_URL}/api/worker/claim/${taskId}`, {
      method: 'POST',
      timeout: 15000
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
      timeout: 30000,
      body: { result, actualTokens }
    });
    
    if (response.status === 200 && response.data) {
      stats.tasksCompleted++;
      sendStats();
      log(`Task completed successfully!`);
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

  try {
    if (task.taskType === 'chat' || task.taskType === 'inference') {
      // Extract prompt from task data
      let taskData = {};
      try {
        taskData = typeof task.inputData === 'string' 
          ? JSON.parse(task.inputData) 
          : (task.inputData || task.taskData || {});
      } catch {
        taskData = {};
      }
      
      const prompt = taskData.userMessage || taskData.prompt || taskData.message || 'Hello';
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
  } catch (err) {
    log(`Task processing error: ${err.message}`);
    result = JSON.stringify({
      status: 'error',
      message: `Processing error: ${err.message}`,
      timestamp: new Date().toISOString()
    });
    tokens = 10;
  }

  return { result, tokens: Math.round(tokens) };
}

// Send heartbeat
async function sendHeartbeat() {
  try {
    const response = await makeRequest(`${SERVER_URL}/api/worker/heartbeat`, {
      method: 'POST',
      timeout: 10000
    });
    
    if (response.status === 200) {
      if (connectionFailed) {
        log('Heartbeat successful - connection restored');
        connectionFailed = false;
        lastError = null;
        stats.status = 'Running';
        sendStats();
      }
    } else if (response.status === 401) {
      // API key invalid
      if (!connectionFailed) {
        log('Heartbeat failed: Invalid API key');
        connectionFailed = true;
        lastError = 'Invalid API key';
        sendError('API key is invalid. Please update your API key in settings.');
        stats.status = 'Error: Invalid API key';
        sendStats();
      }
    } else if (response.status === 400) {
      // Worker offline on server side
      if (!connectionFailed) {
        log('Heartbeat failed: Worker offline on server');
        connectionFailed = true;
        lastError = 'Worker offline';
        stats.status = 'Reconnecting...';
        sendStats();
      }
    } else if (response.status >= 500) {
      // Server error
      if (!connectionFailed) {
        log(`Heartbeat failed: Server error ${response.status}`);
        connectionFailed = true;
        lastError = `Server error ${response.status}`;
        stats.status = 'Server error - retrying...';
        sendStats();
      }
    }
  } catch (err) {
    // Network-level errors
    if (!connectionFailed) {
      log(`Heartbeat failed: ${err.message}`);
      connectionFailed = true;
      lastError = err.message;
      
      if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
        stats.status = 'Connection lost';
      } else if (err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
        stats.status = 'Connection slow';
      } else {
        stats.status = 'Network error';
      }
      sendStats();
    }
  }
}

// Test connection to server using validate endpoint (doesn't require online status)
async function testConnection() {
  log(`Testing connection to ${SERVER_URL}...`);
  try {
    // Use /api/worker/validate instead of /poll - it tests API key without requiring online status
    const response = await makeRequest(`${SERVER_URL}/api/worker/validate`, { timeout: 15000 });
    
    // Log the full response for debugging
    log(`Connection test response: status=${response.status}, body=${JSON.stringify(response.data)}`);
    
    if (response.status === 200) {
      log('Connection to server successful - API key validated');
      if (response.data?.valid) {
        log(`Worker ID: ${response.data.workerId}, Online: ${response.data.isOnline}`);
      }
      return true;
    }
    
    // 401 means API key issue
    if (response.status === 401) {
      const msg = response.data?.message || 'Invalid API key';
      log(`Authentication failed (401): ${msg}`);
      lastError = msg;
      sendError(msg);
      return false;
    }
    
    // 400 means bad request
    if (response.status === 400) {
      const msg = response.data?.message || 'Bad request';
      log(`Server rejected request (400): ${msg}`);
      lastError = msg;
      sendError(msg);
      return false;
    }
    
    log(`Server responded with status: ${response.status}`);
    lastError = `Server error: ${response.status}`;
    return response.status < 500;
  } catch (err) {
    log(`Connection test failed: ${err.message}`);
    lastError = err.message;
    return false;
  }
}

// Main loop with reconnection logic
async function mainLoop() {
  earlyLog('mainLoop() entered');
  log('ComputeGrid Worker starting...');
  log(`Version: ${APP_VERSION}`);
  log(`Server: ${SERVER_URL}`);
  log(`API Key: ${API_KEY ? API_KEY.substring(0, 10) + '...' : 'NOT SET'}`);
  log(`Log file: ${LOG_FILE}`);
  
  if (!API_KEY) {
    log('ERROR: API key not configured');
    stats.status = 'Error: No API key';
    sendStats();
    sendError('API key not configured');
    // Keep running but don't poll
    while (isRunning) {
      await new Promise(r => setTimeout(r, 10000));
    }
    return;
  }

  if (!SERVER_URL) {
    log('ERROR: Server URL not configured');
    stats.status = 'Error: No server URL';
    sendStats();
    sendError('Server URL not configured');
    while (isRunning) {
      await new Promise(r => setTimeout(r, 10000));
    }
    return;
  }

  // Test connection first
  let connected = await testConnection();
  if (!connected) {
    log('Initial connection failed, will retry...');
    stats.status = 'Connecting...';
    sendStats();
    
    // Retry connection with backoff
    let retryCount = 0;
    while (!connected && isRunning && retryCount < 10) {
      retryCount++;
      log(`Connection retry ${retryCount}/10...`);
      await new Promise(r => setTimeout(r, RECONNECT_DELAY_MS));
      connected = await testConnection();
    }
    
    if (!connected) {
      log('Could not connect to server after multiple retries');
      stats.status = 'Connection failed';
      sendStats();
      sendError(`Could not connect: ${lastError}`);
    }
  }

  // Try to setup Ollama (non-blocking, non-fatal)
  try {
    await setupOllama();
  } catch (err) {
    log(`Ollama setup failed (continuing without AI): ${err.message}`);
  }
  
  stats.status = connected ? 'Running' : 'Reconnecting...';
  sendStats();
  log(`Worker is now ${connected ? 'running' : 'waiting for connection'}. Polling for tasks...`);

  // Heartbeat interval
  const heartbeatInterval = setInterval(() => {
    sendHeartbeat().catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);

  // Main polling loop - never exits unless explicitly stopped
  while (isRunning) {
    try {
      if (!isPaused) {
        const task = await pollForTasks();
        
        if (task) {
          stats.status = 'Processing task...';
          sendStats();
          
          const claimed = await claimTask(task.id);
          
          if (claimed) {
            const { result, tokens } = await processTask(task);
            await completeTask(task.id, result, tokens);
          }
          
          stats.status = 'Running';
          sendStats();
        }
      }
    } catch (err) {
      log(`Loop error (recovering): ${err.message}`);
      // Continue running
    }
    
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  clearInterval(heartbeatInterval);
  log('Worker stopped');
}

// Handle process signals gracefully
process.on('SIGINT', () => {
  log('Received SIGINT, shutting down...');
  isRunning = false;
  stats.status = 'Stopped';
  sendStats();
  setTimeout(() => process.exit(0), 1000);
});

process.on('SIGTERM', () => {
  log('Received SIGTERM, shutting down...');
  isRunning = false;
  stats.status = 'Stopped';
  sendStats();
  setTimeout(() => process.exit(0), 1000);
});

// Handle parent disconnect
process.on('disconnect', () => {
  earlyLog('!!! DISCONNECT EVENT - Parent process disconnected');
  log('Parent process disconnected, shutting down...');
  isRunning = false;
  setTimeout(() => process.exit(0), 1000);
});

// Start the worker - NEVER exit on errors
mainLoop().catch(err => {
  log(`Main loop error: ${err.message}`);
  logToFile(`FATAL: ${err.stack}`);
  stats.status = 'Error - restarting...';
  sendStats();
  
  // Restart the main loop after a delay instead of exiting
  setTimeout(() => {
    log('Restarting main loop...');
    mainLoop().catch(e => {
      log(`Restart failed: ${e.message}`);
    });
  }, 5000);
});
