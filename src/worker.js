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
earlyLog(`CG_IMAGE_QUALITY_TIER: ${process.env.CG_IMAGE_QUALITY_TIER || 'NOT SET'}`);
earlyLog(`CG_IMAGE_BENCHMARK_MS: ${process.env.CG_IMAGE_BENCHMARK_MS || 'NOT SET'}`);
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
const MAX_PRIVACY_MODE = process.env.CG_MAX_PRIVACY_MODE === '1';

// CRITICAL: Exit immediately if Maximum Privacy Mode is enabled
// This is a safety check - the worker should never be spawned in privacy mode
if (MAX_PRIVACY_MODE) {
  earlyLog('[Privacy] WORKER BLOCKED - Maximum Privacy Mode is enabled');
  earlyLog('Exiting worker process to ensure zero server connections');
  process.exit(0);
}

// Settings
const POLL_INTERVAL_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 30000;
const RECONNECT_DELAY_MS = 10000;
const OLLAMA_HOST = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'mistral';
const FALLBACK_MODEL = 'tinyllama';
const IMAGE_MODEL = 'stable-diffusion';

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

// GPU capabilities
let gpuInfo = {
  hasGpu: false,
  gpuModel: null,
  gpuVramGb: 0,
  canGenerateImages: false
};

// Region detection
let workerRegion = null;
let workerCountryCode = null;
let internetSpeedMbps = 0;

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

// Detect GPU capabilities
async function detectGpuCapabilities() {
  log('Detecting GPU capabilities...');
  
  try {
    // On Windows, try multiple methods for GPU detection
    if (process.platform === 'win32') {
      const { execSync } = require('child_process');
      let detected = false;
      
      // Method 1: Try nvidia-smi first (most reliable for NVIDIA)
      try {
        const nvidiaOutput = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits', { 
          encoding: 'utf8',
          timeout: 10000,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        const parts = nvidiaOutput.trim().split(',').map(s => s.trim());
        if (parts.length >= 2) {
          const gpuName = parts[0];
          const memMb = parseInt(parts[1], 10);
          const vramGb = Math.round(memMb / 1024);
          
          gpuInfo.hasGpu = true;
          gpuInfo.gpuModel = gpuName;
          gpuInfo.gpuVramGb = vramGb;
          gpuInfo.canGenerateImages = vramGb >= 6;
          log(`GPU detected (nvidia-smi): ${gpuName} with ${vramGb}GB VRAM, can generate images: ${gpuInfo.canGenerateImages}`);
          detected = true;
        }
      } catch (e) {
        log(`nvidia-smi not available: ${e.message}`);
      }
      
      // Method 2: Use PowerShell with proper JSON output (fallback)
      if (!detected) {
        try {
          const psCommand = `powershell -NoProfile -Command "Get-CimInstance -ClassName Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Json -Compress"`;
          const psOutput = execSync(psCommand, { 
            encoding: 'utf8',
            timeout: 15000,
            stdio: ['pipe', 'pipe', 'pipe']
          });
          
          let gpuList = JSON.parse(psOutput.trim());
          // PowerShell returns single object if only one GPU, array if multiple
          if (!Array.isArray(gpuList)) {
            gpuList = [gpuList];
          }
          
          for (const gpu of gpuList) {
            const gpuName = gpu.Name || '';
            const vramBytes = parseInt(gpu.AdapterRAM, 10) || 0;
            const vramGb = Math.round(vramBytes / (1024 * 1024 * 1024));
            
            log(`Found GPU: ${gpuName}, VRAM bytes: ${vramBytes}, VRAM GB: ${vramGb}`);
            
            // Check if it's a discrete GPU (NVIDIA or AMD)
            if (gpuName.toLowerCase().includes('nvidia') || 
                gpuName.toLowerCase().includes('radeon') || 
                gpuName.toLowerCase().includes('geforce') ||
                gpuName.toLowerCase().includes('rtx') ||
                gpuName.toLowerCase().includes('gtx')) {
              gpuInfo.hasGpu = true;
              gpuInfo.gpuModel = gpuName;
              gpuInfo.gpuVramGb = vramGb;
              gpuInfo.canGenerateImages = vramGb >= 6;
              log(`GPU detected (PowerShell): ${gpuName} with ${vramGb}GB VRAM, can generate images: ${gpuInfo.canGenerateImages}`);
              detected = true;
              break;
            }
          }
        } catch (e) {
          log(`PowerShell GPU detection failed: ${e.message}`);
        }
      }
      
      // Method 3: Fallback to wmic with better parsing
      if (!detected) {
        try {
          const wmicOutput = execSync('wmic path win32_videocontroller get name,adapterram /format:csv', { 
            encoding: 'utf8',
            timeout: 10000 
          });
          const lines = wmicOutput.trim().split('\n').filter(l => l.trim() && !l.startsWith('Node'));
          
          for (const line of lines) {
            const parts = line.split(',');
            if (parts.length >= 3) {
              // CSV format: Node,AdapterRAM,Name
              const vramBytes = parseInt(parts[1], 10) || 0;
              const gpuName = parts.slice(2).join(',').trim();
              const vramGb = Math.round(vramBytes / (1024 * 1024 * 1024));
              
              if (gpuName.toLowerCase().includes('nvidia') || 
                  gpuName.toLowerCase().includes('radeon') || 
                  gpuName.toLowerCase().includes('geforce') ||
                  gpuName.toLowerCase().includes('rtx') ||
                  gpuName.toLowerCase().includes('gtx')) {
                gpuInfo.hasGpu = true;
                gpuInfo.gpuModel = gpuName;
                gpuInfo.gpuVramGb = vramGb;
                gpuInfo.canGenerateImages = vramGb >= 6;
                log(`GPU detected (wmic): ${gpuName} with ${vramGb}GB VRAM, can generate images: ${gpuInfo.canGenerateImages}`);
                detected = true;
                break;
              }
            }
          }
        } catch (e) {
          log(`wmic GPU detection failed: ${e.message}`);
        }
      }
    }
    // On Linux, use nvidia-smi if available
    else if (process.platform === 'linux') {
      const { execSync } = require('child_process');
      
      try {
        const nvidiaOutput = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits', { encoding: 'utf8' });
        const [gpuName, memMb] = nvidiaOutput.trim().split(',').map(s => s.trim());
        const vramGb = Math.round(parseInt(memMb, 10) / 1024);
        
        gpuInfo.hasGpu = true;
        gpuInfo.gpuModel = gpuName;
        gpuInfo.gpuVramGb = vramGb;
        gpuInfo.canGenerateImages = vramGb >= 6;
        log(`GPU detected: ${gpuName} with ${vramGb}GB VRAM, can generate images: ${gpuInfo.canGenerateImages}`);
      } catch {
        // nvidia-smi not available, check for AMD
        try {
          const lspciOutput = execSync('lspci | grep -i vga', { encoding: 'utf8' });
          if (lspciOutput.toLowerCase().includes('amd') || lspciOutput.toLowerCase().includes('radeon')) {
            gpuInfo.hasGpu = true;
            gpuInfo.gpuModel = lspciOutput.split(':').pop()?.trim() || 'AMD GPU';
            // Can't reliably detect VRAM on AMD without specific tools
            gpuInfo.gpuVramGb = 0;
            gpuInfo.canGenerateImages = false;
            log(`AMD GPU detected: ${gpuInfo.gpuModel} (VRAM detection not supported)`);
          }
        } catch {
          log('No discrete GPU detected');
        }
      }
    }
  } catch (err) {
    log(`GPU detection error: ${err.message}`);
  }
  
  if (!gpuInfo.hasGpu) {
    log('No suitable GPU found - image generation will not be available');
  }
  
  return gpuInfo;
}

// Detect region using IP geolocation
async function detectRegion() {
  log('Detecting region...');
  
  try {
    const response = await makeRequest('https://ipapi.co/json/', { timeout: 10000 });
    
    if (response.status === 200 && response.data) {
      workerRegion = response.data.region || response.data.continent_code || 'unknown';
      workerCountryCode = response.data.country_code || '';
      log(`Region detected: ${workerRegion}, Country: ${workerCountryCode}`);
    }
  } catch (err) {
    log(`Region detection error (non-fatal): ${err.message}`);
  }
}

// Test internet speed (simple download test)
async function testInternetSpeed() {
  log('Testing internet speed...');
  
  try {
    const startTime = Date.now();
    // Download a small file to estimate speed
    const response = await makeRequest('https://www.cloudflare.com/cdn-cgi/trace', { timeout: 10000 });
    const endTime = Date.now();
    
    if (response.status === 200) {
      const durationMs = endTime - startTime;
      // Rough estimate based on typical response size (~500 bytes) and round trip
      internetSpeedMbps = Math.min(100, Math.round(500 * 8 / durationMs)); // Very rough estimate
      log(`Internet speed estimate: ~${internetSpeedMbps} Mbps`);
    }
  } catch (err) {
    log(`Speed test error (non-fatal): ${err.message}`);
    internetSpeedMbps = 10; // Default fallback
  }
}

// Report capabilities to server
async function reportCapabilities() {
  log('Reporting capabilities to server...');
  
  try {
    // Check if embedded SD (image AI) is ready
    const imageAiReady = isEmbeddedSdReady();
    const canDoImages = gpuInfo.canGenerateImages && imageAiReady;
    
    // Get image quality tier and benchmark time from environment (set by main.js)
    const imageQualityTier = process.env.CG_IMAGE_QUALITY_TIER || 'none';
    const imageBenchmarkTimeMs = parseInt(process.env.CG_IMAGE_BENCHMARK_MS, 10) || 0;
    
    const systemInfo = {
      hasGpu: gpuInfo.hasGpu,
      canGenerateImages: canDoImages,
      gpuModel: gpuInfo.gpuModel,
      gpuVramGb: gpuInfo.gpuVramGb,
      region: workerRegion,
      countryCode: workerCountryCode,
      internetSpeedMbps,
      cpuCores: os.cpus().length,
      memoryGb: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
      imageQualityTier: canDoImages ? imageQualityTier : 'none',
      imageBenchmarkTimeMs: canDoImages ? imageBenchmarkTimeMs : 0
    };
    
    log(`Image AI status: ready=${imageAiReady}, canGenerate=${canDoImages}, tier=${imageQualityTier}, benchmarkMs=${imageBenchmarkTimeMs}`);
    
    const response = await makeRequest(`${SERVER_URL}/api/worker/capabilities`, {
      method: 'POST',
      timeout: 15000,
      body: systemInfo
    });
    
    if (response.status === 200) {
      log('Capabilities reported successfully');
      log(`Server response: ${JSON.stringify(response.data)}`);
    } else {
      log(`Capabilities report failed: ${response.status}`);
    }
  } catch (err) {
    log(`Capabilities report error: ${err.message}`);
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

// Try to pull a model via Ollama
async function pullOllamaModel(modelName) {
  try {
    log(`Pulling Ollama model: ${modelName}...`);
    const response = await makeRequest(`${OLLAMA_HOST}/api/pull`, {
      method: 'POST',
      timeout: 600000, // 10 minute timeout for large model downloads
      body: { name: modelName, stream: false }
    });
    
    if (response.status === 200) {
      log(`Successfully pulled model: ${modelName}`);
      return true;
    } else {
      log(`Failed to pull model ${modelName}: ${response.status}`);
      return false;
    }
  } catch (err) {
    log(`Error pulling model ${modelName}: ${err.message}`);
    return false;
  }
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
    
    // Try to pull a model if Ollama is running but no models are available
    try {
      const tagsResponse = await makeRequest(`${OLLAMA_HOST}/api/tags`, { timeout: 5000 });
      if (tagsResponse.status === 200) {
        // Ollama is running but may not have models - try to pull one
        log('Ollama running but no compatible models found. Attempting to pull...');
        
        // Try the smaller model first (faster download)
        const pulled = await pullOllamaModel(FALLBACK_MODEL);
        if (pulled) {
          // Verify model was actually pulled by checking again
          const verifyReady = await checkOllama();
          if (verifyReady) {
            log(`Ollama ready with verified model: ${activeModel}`);
            return true;
          }
          log('Model pull reported success but verification failed');
        }
      }
    } catch (err) {
      // Ollama not running at all
      log(`Ollama not running: ${err.message}`);
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

// Generate AI response using Ollama with conversation history
async function generateWithOllama(prompt, systemPrompt = '', conversationHistory = []) {
  if (!ollamaReady) {
    return simulateResponse(prompt);
  }

  try {
    // Build messages array for chat endpoint
    const messages = [];
    
    // Add system prompt if provided
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    
    // Add conversation history (already in {role, content} format)
    if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      messages.push(...conversationHistory);
    }
    
    // Add current user message
    messages.push({ role: 'user', content: prompt });
    
    log(`Sending chat request with ${messages.length} messages (${conversationHistory.length} history)`);
    
    // Use /api/chat endpoint for conversation context
    const response = await makeRequest(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      timeout: 120000,
      body: {
        model: activeModel,
        messages: messages,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 1024
        }
      }
    });

    // /api/chat returns response in message.content
    if (response.status === 200 && response.data && response.data.message && response.data.message.content) {
      return response.data.message.content;
    }
  } catch (err) {
    log(`Ollama chat error: ${err.message}`);
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
        const task = response.data.tasks[0];
        log(`Task available: id=${task.id}, type=${task.taskType}`);
        return task;
      }
      if (response.data?.task) {
        const task = response.data.task;
        log(`Task available: id=${task.id}, type=${task.taskType}`);
        return task;
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

// Stable Diffusion API configuration
const SD_API_HOST = 'http://127.0.0.1:7860'; // Default automatic1111 webui port
let sdServerReady = false;

// Paths for embedded Python + SD - use userData from env or fallback
const USER_DATA_DIR = process.env.CG_USER_DATA || path.join(os.homedir(), '.computegrid');
const IMAGE_AI_DIR = path.join(USER_DATA_DIR, 'image-ai');
const PYTHON_DIR = path.join(IMAGE_AI_DIR, 'python');
const SD_ONNX_MODEL_DIR = path.join(IMAGE_AI_DIR, 'sd-onnx');
const SD_ONNX_MODEL_INDEX = path.join(SD_ONNX_MODEL_DIR, 'model_index.json');
// python-build-standalone extracts to a 'python/' subfolder
const PYTHON_EXE = process.platform === 'win32'
  ? path.join(PYTHON_DIR, 'python', 'python.exe')
  : path.join(PYTHON_DIR, 'python', 'bin', 'python3');

// Cache the SD inference script path to avoid repeated lookups
let cachedSdScriptPath = null;

// Check if embedded SD is ready (Python + ONNX model installed)
// Only logs on first check or state change to reduce noise
let lastSdReadyState = null;
function isEmbeddedSdReady() {
  const pythonExists = fs.existsSync(PYTHON_EXE);
  const modelIndexExists = fs.existsSync(SD_ONNX_MODEL_INDEX);
  const isReady = pythonExists && modelIndexExists;
  
  // Only log on state change to reduce noise
  if (isReady !== lastSdReadyState) {
    lastSdReadyState = isReady;
    if (!pythonExists) {
      log(`Embedded SD not ready: Python not installed at ${PYTHON_EXE}`);
    } else if (!modelIndexExists) {
      log(`Embedded SD not ready: ONNX model not installed at ${SD_ONNX_MODEL_DIR}`);
    } else {
      log(`Embedded SD ready: ONNX model found at ${SD_ONNX_MODEL_DIR}`);
    }
  }
  
  return isReady;
}

// Find the SD inference script path (with caching and cache invalidation)
function getSdInferenceScriptPath(forceRefresh = false) {
  // Return cached path if available and still exists (unless refresh forced)
  if (!forceRefresh && cachedSdScriptPath && fs.existsSync(cachedSdScriptPath)) {
    return cachedSdScriptPath;
  }
  
  // Clear cache if forced refresh or cached path no longer exists
  if (cachedSdScriptPath && !fs.existsSync(cachedSdScriptPath)) {
    log(`Cached SD script path no longer exists, re-scanning...`);
    cachedSdScriptPath = null;
  }
  
  // Build list of possible paths - prioritize packaged app locations
  const possiblePaths = [];
  
  // Image-AI bundle directory (most reliable in packaged app)
  const imageAiDir = path.join(USER_DATA_DIR, 'image-ai');
  possiblePaths.push(path.join(imageAiDir, 'sd_inference.py'));
  possiblePaths.push(path.join(imageAiDir, 'scripts', 'sd_inference.py'));
  
  // In packaged app, check resources
  if (process.resourcesPath) {
    possiblePaths.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'sd_inference.py'));
    possiblePaths.push(path.join(process.resourcesPath, 'sd_inference.py'));
  }
  
  // Current directory and source locations
  possiblePaths.push(path.join(__dirname, 'sd_inference.py'));
  possiblePaths.push(path.join(process.cwd(), 'src', 'sd_inference.py'));
  
  // User data directory fallback
  possiblePaths.push(path.join(USER_DATA_DIR, 'sd_inference.py'));
  possiblePaths.push(path.join(os.homedir(), '.computegrid', 'sd_inference.py'));
  
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        log(`Found SD inference script at: ${p}`);
        cachedSdScriptPath = p; // Cache for future calls
        return p;
      }
    } catch (err) {
      // Skip paths that cause errors (e.g., permission issues)
      log(`Error checking path ${p}: ${err.message}`);
    }
  }
  
  // Last resort: try to copy from resources to image-ai directory
  if (process.resourcesPath) {
    const sourcePaths = [
      path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'sd_inference.py'),
      path.join(process.resourcesPath, 'sd_inference.py'),
      path.join(__dirname, 'sd_inference.py')
    ];
    
    for (const src of sourcePaths) {
      try {
        if (fs.existsSync(src)) {
          const destPath = path.join(imageAiDir, 'sd_inference.py');
          fs.mkdirSync(imageAiDir, { recursive: true });
          fs.copyFileSync(src, destPath);
          log(`Copied SD inference script from ${src} to ${destPath}`);
          cachedSdScriptPath = destPath;
          return destPath;
        }
      } catch (err) {
        log(`Failed to copy from ${src}: ${err.message}`);
      }
    }
  }
  
  log(`SD inference script not found in: ${possiblePaths.join(', ')}`);
  return null;
}

// Invalidate SD script cache (called when bundle is installed)
function invalidateSdScriptCache() {
  cachedSdScriptPath = null;
  log('SD script cache invalidated');
}

// Generate image using embedded Python + diffusers
async function callEmbeddedSdGenerate(prompt, width, height, seed, tileX, tileY, totalTilesX, totalTilesY, tileOverlap) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    
    // Try to get script path, with retry on failure
    let scriptPath = getSdInferenceScriptPath();
    if (!scriptPath) {
      // Force refresh in case script was installed after initial check
      log('SD script not found, trying force refresh...');
      scriptPath = getSdInferenceScriptPath(true);
      if (!scriptPath) {
        reject(new Error('SD inference script not found'));
        return;
      }
    }
    
    // Adjust the prompt for regional generation (tiling hint)
    const regionHint = totalTilesX > 1 || totalTilesY > 1 
      ? `, seamless tile, region ${tileX + 1}/${totalTilesX} horizontal ${tileY + 1}/${totalTilesY} vertical`
      : '';
    const fullPrompt = prompt + regionHint;
    
    const inputData = JSON.stringify({
      prompt: fullPrompt,
      seed: seed,
      width: width,
      height: height,
      model_dir: SD_ONNX_MODEL_DIR,
      is_benchmark: false,
      tile_x: tileX,
      tile_y: tileY,
      total_tiles_x: totalTilesX,
      total_tiles_y: totalTilesY,
      tile_overlap: tileOverlap || 64
    });
    
    log(`[SD] Starting Python inference: ${width}x${height}, seed=${seed}`);
    
    const proc = spawn(PYTHON_EXE, [scriptPath, inputData], {
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1'
      }
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      const msg = data.toString();
      stderr += msg;
      // Log progress
      const lines = msg.split('\n').filter(l => l.trim());
      for (const line of lines) {
        log(`[SD] ${line}`);
      }
    });
    
    // 5 minute timeout
    const timeout = setTimeout(() => {
      log('[SD] Process timeout - killing');
      proc.kill('SIGKILL');
      reject(new Error('Image generation timed out'));
    }, 5 * 60 * 1000);
    
    proc.on('close', (code) => {
      clearTimeout(timeout);
      log(`[SD] Process exited with code ${code}`);
      
      if (code === 0 && stdout.trim()) {
        try {
          // Parse the last line of stdout as JSON
          const lines = stdout.trim().split('\n');
          const result = JSON.parse(lines[lines.length - 1]);
          
          if (result.success) {
            resolve({
              imageData: result.image_base64,
              seed: result.seed,
              width: result.width,
              height: result.height
            });
          } else {
            reject(new Error(result.error || 'Unknown SD error'));
          }
        } catch (parseErr) {
          log(`[SD] Failed to parse output: ${stdout.slice(-500)}`);
          reject(new Error('Failed to parse SD output'));
        }
      } else {
        reject(new Error(stderr || `SD process exited with code ${code}`));
      }
    });
    
    proc.on('error', (err) => {
      clearTimeout(timeout);
      log(`[SD] Process error: ${err.message}`);
      reject(err);
    });
  });
}

// Round dimension up to nearest multiple of 8 (required for ONNX SD models)
function roundTo8(value) {
  return Math.ceil(value / 8) * 8;
}

// Generate image tile using embedded Stable Diffusion
async function generateImageTile(taskData) {
  log(`Generating image tile [${taskData.tileX},${taskData.tileY}]...`);
  
  if (!gpuInfo.canGenerateImages) {
    return {
      type: 'image_tile',
      tileX: taskData.tileX,
      tileY: taskData.tileY,
      error: 'GPU not capable of image generation (need 6GB+ VRAM)',
      imageData: null
    };
  }
  
  try {
    const prompt = taskData.imagePrompt || 'test image';
    const seed = taskData.imageSeed || Math.floor(Math.random() * 2147483647);
    const tileX = taskData.tileX || 0;
    const tileY = taskData.tileY || 0;
    const totalTilesX = taskData.totalTilesX || 2;
    const totalTilesY = taskData.totalTilesY || 2;
    // ONNX models require dimensions divisible by 8
    const tileWidth = roundTo8(taskData.imageWidth || 512);
    const tileHeight = roundTo8(taskData.imageHeight || 512);
    const tileOverlap = taskData.tileOverlap || 64;
    
    log(`Tile params: prompt="${prompt.substring(0, 50)}...", seed=${seed}, position=[${tileX},${tileY}], size=${tileWidth}x${tileHeight}`);
    
    // Check if embedded SD is ready (Python + model)
    if (!isEmbeddedSdReady()) {
      log('Embedded SD not ready - returning error');
      return {
        type: 'image_tile',
        tileX,
        tileY,
        totalTilesX,
        totalTilesY,
        width: tileWidth,
        height: tileHeight,
        imageData: null,
        prompt,
        seed,
        error: 'Image AI not installed. Please enable Image Generation in settings and download the model.'
      };
    }
    
    // Generate using embedded Python + diffusers
    log(`Calling embedded SD for tile [${tileX},${tileY}]...`);
    const sdResult = await callEmbeddedSdGenerate(
      prompt, tileWidth, tileHeight, seed,
      tileX, tileY, totalTilesX, totalTilesY, tileOverlap
    );
    
    const result = {
      type: 'image_tile',
      tileX,
      tileY,
      totalTilesX,
      totalTilesY,
      width: tileWidth,
      height: tileHeight,
      imageData: sdResult.imageData,
      prompt,
      seed: sdResult.seed,
      error: null
    };
    
    log(`Image tile [${tileX},${tileY}] generation complete, size: ${sdResult.imageData ? sdResult.imageData.length : 0} chars`);
    return result;
  } catch (err) {
    log(`Image generation error: ${err.message}`);
    return {
      type: 'image_tile',
      tileX: taskData.tileX,
      tileY: taskData.tileY,
      error: err.message,
      imageData: null
    };
  }
}

// Process a task
async function processTask(task) {
  log(`Processing task ${task.id}: ${task.taskType}`);
  
  let result = '';
  let tokens = 0;

  try {
    // Extract task data
    let taskData = {};
    try {
      taskData = typeof task.inputData === 'string' 
        ? JSON.parse(task.inputData) 
        : (task.inputData || task.taskData || {});
    } catch {
      taskData = {};
    }
    
    // Handle image generation tasks
    if (task.taskType === 'image_generation') {
      log(`[Image Task] Processing image generation task: ${task.id}`);
      log(`[Image Task] Task data: ${JSON.stringify(taskData).substring(0, 200)}...`);
      
      // Check if image AI is ready
      if (!isEmbeddedSdReady()) {
        log('[Image Task] ERROR: Image AI is not ready!');
        log(`[Image Task] Python exists: ${fs.existsSync(PYTHON_EXE)}`);
        log(`[Image Task] Model exists: ${fs.existsSync(SD_ONNX_MODEL_INDEX)}`);
        throw new Error('Image AI not ready - Python or model not installed');
      }
      
      log('[Image Task] Image AI is ready, generating...');
      const imageResult = await generateImageTile(taskData);
      log(`[Image Task] Generation complete: success=${imageResult.success}`);
      result = JSON.stringify(imageResult);
      tokens = 0; // Images don't have tokens
    }
    // Handle chat/inference tasks
    else if (task.taskType === 'chat' || task.taskType === 'inference') {
      const prompt = taskData.userMessage || taskData.prompt || taskData.message || 'Hello';
      const systemPrompt = taskData.systemPrompt || '';
      const conversationHistory = taskData.conversationHistory || [];
      
      result = await generateWithOllama(prompt, systemPrompt, conversationHistory);
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
      // Always send stats after heartbeat to keep watchdog happy
      sendStats();
      
      if (connectionFailed) {
        log('Heartbeat successful - connection restored');
        connectionFailed = false;
        lastError = null;
        stats.status = 'Running';
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
  log(`Image AI paths: userData=${USER_DATA_DIR}, ai=${IMAGE_AI_DIR}`);
  log(`Image AI ready: Python=${fs.existsSync(PYTHON_EXE)}, Model=${fs.existsSync(SD_ONNX_MODEL_INDEX)}`);
  
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

  // Detect hardware capabilities in parallel (non-blocking)
  try {
    await Promise.all([
      detectGpuCapabilities(),
      detectRegion(),
      testInternetSpeed()
    ]);
    log(`Hardware detection complete: GPU=${gpuInfo.hasGpu}, Region=${workerRegion}, Speed=${internetSpeedMbps}Mbps`);
  } catch (err) {
    log(`Hardware detection error (non-fatal): ${err.message}`);
  }
  
  // Try to setup Ollama (non-blocking, non-fatal)
  try {
    await setupOllama();
  } catch (err) {
    log(`Ollama setup failed (continuing without AI): ${err.message}`);
  }
  
  // Report capabilities to server after detection
  if (connected) {
    try {
      await reportCapabilities();
    } catch (err) {
      log(`Capabilities report error (non-fatal): ${err.message}`);
    }
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
