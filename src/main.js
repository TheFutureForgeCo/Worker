const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, Notification, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, exec, execSync } = require('child_process');
const https = require('https');
const http = require('http');
const os = require('os');
const { autoUpdater } = require('electron-updater');

// ============== EARLY DEBUG LOGGING ==============
// This runs immediately when the app starts, before anything else
const EARLY_LOG_PATH = path.join(app.getPath('userData'), 'startup-debug.log');
function earlyLog(msg) {
  try {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(EARLY_LOG_PATH, line);
  } catch (e) {
    // Can't log the error, just continue
  }
}

// Clear old log and start fresh
try {
  fs.writeFileSync(EARLY_LOG_PATH, `=== ComputeGrid Worker Startup Log ===\n`);
  earlyLog(`App starting...`);
  earlyLog(`Platform: ${process.platform}, Arch: ${process.arch}`);
  earlyLog(`Electron version: ${process.versions.electron}`);
  earlyLog(`Node version: ${process.versions.node}`);
  earlyLog(`User data path: ${app.getPath('userData')}`);
  earlyLog(`Is packaged: ${app.isPackaged}`);
  if (app.isPackaged) {
    earlyLog(`Resources path: ${process.resourcesPath}`);
  }
} catch (e) {
  // Continue even if logging fails
}
// ============== END EARLY DEBUG LOGGING ==============

// Single instance lock - prevent multiple windows
const gotTheLock = app.requestSingleInstanceLock();
earlyLog(`Single instance lock: ${gotTheLock ? 'acquired' : 'failed (another instance running)'}`);

if (!gotTheLock) {
  // Another instance is already running - exit immediately
  earlyLog('Exiting - another instance is running');
  app.exit(0);
}

// App version and integrity
const APP_VERSION = require('../package.json').version;
earlyLog(`App version: ${APP_VERSION}`);
const INTEGRITY_CHECK_INTERVAL = 5 * 60 * 1000;

// Hardcoded server URL - users only need to enter API key
const SERVER_URL = 'https://computegrid.replit.app';

// App configuration
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const OLLAMA_HOST = 'http://127.0.0.1:11434';

// Local Ollama installation paths (stored within app data, deleted on uninstall)
const OLLAMA_DIR = path.join(app.getPath('userData'), 'ollama');
const OLLAMA_MODELS_DIR = path.join(OLLAMA_DIR, 'models');
const OLLAMA_BIN_DIR = path.join(OLLAMA_DIR, 'bin');

// Get the correct path for the worker script (handles packaged app)
function getWorkerScriptPath() {
  if (app.isPackaged) {
    // In packaged app, try the unpacked resources path first
    const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'worker.js');
    if (fs.existsSync(unpackedPath)) {
      return unpackedPath;
    }
    // Log warning but continue - the file should be in unpacked path
    console.error('Worker script not found at unpacked path:', unpackedPath);
    // Try alternative paths
    const altPaths = [
      path.join(process.resourcesPath, 'app.asar', 'src', 'worker.js'),
      path.join(app.getAppPath(), 'src', 'worker.js'),
      path.join(__dirname, 'worker.js')
    ];
    for (const altPath of altPaths) {
      if (fs.existsSync(altPath)) {
        console.log('Found worker script at alternative path:', altPath);
        return altPath;
      }
    }
    // Return the expected path even if not found - will fail with clear error
    return unpackedPath;
  }
  return path.join(__dirname, 'worker.js');
}

// Ollama binary download URLs (direct binary, not installers)
const OLLAMA_BINARY_URLS = {
  win32: {
    x64: 'https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip',
    arm64: 'https://github.com/ollama/ollama/releases/latest/download/ollama-windows-arm64.zip'
  },
  linux: {
    x64: 'https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64.tgz',
    arm64: 'https://github.com/ollama/ollama/releases/latest/download/ollama-linux-arm64.tgz'
  },
  darwin: {
    x64: 'https://github.com/ollama/ollama/releases/latest/download/ollama-darwin',
    arm64: 'https://github.com/ollama/ollama/releases/latest/download/ollama-darwin'
  }
};

// Get local Ollama binary path
function getOllamaBinaryPath() {
  const platform = process.platform;
  if (platform === 'win32') {
    return path.join(OLLAMA_BIN_DIR, 'ollama.exe');
  }
  return path.join(OLLAMA_BIN_DIR, 'ollama');
}

// Get the correct path for source files (handles packaged app)
function getSourcePath(filename) {
  if (app.isPackaged) {
    // In packaged app, try the unpacked resources path first
    const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'src', filename);
    if (fs.existsSync(unpackedPath)) {
      return unpackedPath;
    }
    // Fallback to asar path (file may be inside asar)
    return path.join(process.resourcesPath, 'app.asar', 'src', filename);
  }
  return path.join(__dirname, filename);
}

// Generate app signature for integrity verification
// Uses version-based signature to avoid file access issues in packaged app
function generateAppSignature() {
  // Always use version-based signature for reliability in packaged apps
  // This avoids ENOENT errors when files are inside asar or unpacked incorrectly
  return crypto.createHash('sha256').update(APP_VERSION + 'computegrid-worker').digest('hex').substring(0, 16);
}

// Compute challenge response for server verification
function computeChallengeResponse(challenge) {
  const signature = generateAppSignature();
  const response = crypto.createHash('sha256')
    .update(challenge + signature + APP_VERSION)
    .digest('hex');
  return response;
}

// Global references
let mainWindow = null;
let tray = null;
let workerProcess = null;
let isWorkerRunning = false;
let config = {
  apiKey: '',
  autoStart: false,
  minimizeToTray: true,
  startMinimized: false
};
let stats = {
  tasksCompleted: 0,
  status: 'stopped',
  ollamaStatus: 'checking...',
  ollamaModels: []
};
let ollamaDownloadProgress = 0;
let setupPhase = null; // null, 'downloading-ollama', 'downloading-model', 'starting-service'
let setupProgress = 0;
let lastError = null;
let isOnline = false;
let manualStop = false; // Track if worker was manually stopped (vs crashed)
let lastWorkerActivity = Date.now();
let watchdogInterval = null;
let gpuInfo = { hasGpu: false, gpuVramGb: 0, canGenerateImages: false };
const WATCHDOG_TIMEOUT_MS = 60000; // 60 seconds without activity = unresponsive
const WATCHDOG_CHECK_INTERVAL_MS = 15000; // Check every 15 seconds

// Logging functions
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

function logError(message, error) {
  const timestamp = new Date().toISOString();
  const errorMsg = error ? `${message}: ${error.message || error}` : message;
  console.error(`[${timestamp}] ERROR: ${errorMsg}`);
  lastError = errorMsg;
  sendStatusToRenderer();
}

// Helper: Get estimated VRAM for known GPU models (WMI can't report >4GB correctly)
function getEstimatedVram(gpuName) {
  const name = gpuName.toLowerCase();
  
  // NVIDIA RTX 40 series
  if (name.includes('4090')) return 24;
  if (name.includes('4080')) return 16;
  if (name.includes('4070 ti super')) return 16;
  if (name.includes('4070 ti')) return 12;
  if (name.includes('4070 super')) return 12;
  if (name.includes('4070')) return 12;
  if (name.includes('4060 ti')) return 8;
  if (name.includes('4060')) return 8;
  
  // NVIDIA RTX 30 series
  if (name.includes('3090')) return 24;
  if (name.includes('3080 ti')) return 12;
  if (name.includes('3080')) return 10;
  if (name.includes('3070 ti')) return 8;
  if (name.includes('3070')) return 8;
  if (name.includes('3060 ti')) return 8;
  if (name.includes('3060')) return 12; // 3060 has 12GB
  
  // NVIDIA RTX 20 series
  if (name.includes('2080 ti')) return 11;
  if (name.includes('2080 super')) return 8;
  if (name.includes('2080')) return 8;
  if (name.includes('2070 super')) return 8;
  if (name.includes('2070')) return 8;
  if (name.includes('2060 super')) return 8;
  if (name.includes('2060')) return 6;
  
  // NVIDIA GTX 16 series
  if (name.includes('1660 ti')) return 6;
  if (name.includes('1660 super')) return 6;
  if (name.includes('1660')) return 6;
  
  // NVIDIA GTX 10 series
  if (name.includes('1080 ti')) return 11;
  if (name.includes('1080')) return 8;
  if (name.includes('1070 ti')) return 8;
  if (name.includes('1070')) return 8;
  
  // AMD RX 7000 series
  if (name.includes('7900 xtx')) return 24;
  if (name.includes('7900 xt')) return 20;
  if (name.includes('7900 gre')) return 16;
  if (name.includes('7800 xt')) return 16;
  if (name.includes('7700 xt')) return 12;
  if (name.includes('7600')) return 8;
  
  // AMD RX 6000 series
  if (name.includes('6950 xt')) return 16;
  if (name.includes('6900 xt')) return 16;
  if (name.includes('6800 xt')) return 16;
  if (name.includes('6800')) return 16;
  if (name.includes('6750 xt')) return 12;
  if (name.includes('6700 xt')) return 12;
  if (name.includes('6700')) return 10;
  if (name.includes('6650 xt')) return 8;
  if (name.includes('6600 xt')) return 8;
  if (name.includes('6600')) return 8;
  
  return 0; // Unknown GPU
}

// Helper: Check if GPU is capable of image generation based on name
function isCapableGpu(gpuName) {
  const estimatedVram = getEstimatedVram(gpuName);
  return estimatedVram >= 6;
}

// Helper: Find best GPU from array of {name, vramBytes}
function findBestGpu(gpus) {
  let bestGpu = null;
  let bestScore = -1;
  
  for (const gpu of gpus) {
    const name = gpu.name.toLowerCase();
    const isNvidia = name.includes('nvidia');
    const isAmd = name.includes('amd') || name.includes('radeon');
    const isIntel = name.includes('intel');
    const isMicrosoft = name.includes('microsoft');
    
    // Skip generic adapters
    if (isMicrosoft) continue;
    
    // Calculate score based on estimated VRAM and GPU type
    let score = 0;
    const estimatedVram = getEstimatedVram(gpu.name);
    
    if (isNvidia) score += 100 + estimatedVram;
    else if (isAmd) score += 50 + estimatedVram;
    else if (!isIntel) score += estimatedVram;
    
    if (score > bestScore) {
      bestScore = score;
      bestGpu = gpu;
    }
  }
  
  return bestGpu;
}

// Helper: Set gpuInfo from best GPU using name-based detection
function setGpuInfoFromBestGpu(bestGpu, method) {
  const name = bestGpu.name.toLowerCase();
  const isNvidia = name.includes('nvidia');
  const isAmd = name.includes('amd') || name.includes('radeon');
  
  // Use estimated VRAM from GPU name (WMI reports wrong values for 8GB+ cards)
  const estimatedVram = getEstimatedVram(bestGpu.name);
  const canGenerate = estimatedVram >= 6;
  
  gpuInfo = {
    hasGpu: isNvidia || isAmd,
    gpuVramGb: estimatedVram,
    canGenerateImages: canGenerate,
    gpuName: bestGpu.name,
    detectionMethod: method,
    vramSource: estimatedVram > 0 ? 'known-model' : 'unknown'
  };
  log('Selected GPU via ' + method + ': ' + JSON.stringify(gpuInfo));
}

// Detect GPU capabilities
async function detectGpuInfo() {
  try {
    const { execSync } = require('child_process');
    
    // Use platform-specific commands to detect GPU
    if (process.platform === 'win32') {
      // Windows: Use PowerShell to get GPU name, then use name-based VRAM lookup
      // (WMI AdapterRAM is 32-bit and can't report >4GB correctly)
      
      try {
        const psCommand = `powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object Name | ConvertTo-Json -Compress"`;
        const result = execSync(psCommand, { encoding: 'utf8', timeout: 15000, windowsHide: true });
        log('PowerShell GPU raw output: ' + result.trim());
        
        let rawGpus = [];
        try {
          const parsed = JSON.parse(result.trim());
          rawGpus = Array.isArray(parsed) ? parsed : [parsed];
        } catch (jsonErr) {
          log('JSON parse error: ' + jsonErr.message);
        }
        
        const gpus = rawGpus.filter(g => g && g.Name).map(g => ({
          name: g.Name || '',
          vramBytes: 0 // Don't use WMI VRAM - it's broken for 8GB+ cards
        }));
        
        log('Parsed GPUs from PowerShell: ' + JSON.stringify(gpus));
        
        const bestGpu = findBestGpu(gpus);
        if (bestGpu) {
          setGpuInfoFromBestGpu(bestGpu, 'powershell-name');
          return;
        }
      } catch (psErr) {
        log('PowerShell GPU detection failed: ' + psErr.message);
      }
      
      // WMIC fallback - just get GPU names
      try {
        const result = execSync('wmic path win32_videocontroller get name /format:csv', { 
          encoding: 'utf8', 
          timeout: 10000,
          windowsHide: true
        });
        log('WMIC raw output: ' + result.trim());
        
        const lines = result.trim().split(/\r?\n/).filter(l => l.trim() && !l.startsWith('Node'));
        const gpus = [];
        
        for (const line of lines) {
          const parts = line.split(',');
          if (parts.length >= 2) {
            const name = parts[1] || '';
            if (name) {
              gpus.push({ name, vramBytes: 0 });
            }
          }
        }
        
        log('Parsed GPUs from WMIC: ' + JSON.stringify(gpus));
        
        const bestGpu = findBestGpu(gpus);
        if (bestGpu) {
          setGpuInfoFromBestGpu(bestGpu, 'wmic-name');
          return;
        }
      } catch (wmicErr) {
        log('WMIC GPU detection failed: ' + wmicErr.message);
      }
      
      log('All Windows GPU detection methods failed');
      
    } else if (process.platform === 'linux') {
      // Linux: Try nvidia-smi or lspci
      try {
        // Try nvidia-smi first (most reliable for NVIDIA)
        const result = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader', { encoding: 'utf8' });
        const parts = result.trim().split(',');
        if (parts.length >= 2) {
          const vramMatch = parts[1].match(/(\d+)/);
          const vramMb = vramMatch ? parseInt(vramMatch[1]) : 0;
          const vramGb = vramMb / 1024;
          
          gpuInfo = {
            hasGpu: true,
            gpuVramGb: Math.round(vramGb * 10) / 10,
            canGenerateImages: vramGb >= 6,
            gpuName: parts[0].trim()
          };
        }
      } catch (e) {
        // No nvidia-smi, try lspci
        try {
          const result = execSync('lspci | grep -i vga', { encoding: 'utf8' });
          const hasNvidia = result.toLowerCase().includes('nvidia');
          const hasAmd = result.toLowerCase().includes('amd') || result.toLowerCase().includes('radeon');
          
          gpuInfo = {
            hasGpu: hasNvidia || hasAmd,
            gpuVramGb: 0,
            // Allow if NVIDIA/AMD detected even without VRAM info
            canGenerateImages: hasNvidia || hasAmd,
            gpuName: result.split(':').pop()?.trim() || 'Unknown',
            vramUnknown: true
          };
        } catch (e2) {
          log('GPU detection failed on Linux');
        }
      }
    }
    
    log('Final GPU info: ' + JSON.stringify(gpuInfo));
  } catch (err) {
    log('GPU detection error: ' + err.message);
  }
}


// Load configuration
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      config = { ...config, ...JSON.parse(data) };
      log('Config loaded successfully');
    }
    
    // Verify Image AI installation status by checking if model file exists
    const imageAiDir = path.join(app.getPath('userData'), 'image-ai');
    const sdModelPath = path.join(imageAiDir, 'sd-v1-5.safetensors');
    const modelExists = fs.existsSync(sdModelPath);
    
    if (config.imageAiInstalled && !modelExists) {
      log('Image AI model not found, updating config');
      config.imageAiInstalled = false;
      saveConfig();
    } else if (!config.imageAiInstalled && modelExists) {
      log('Image AI model found, updating config');
      config.imageAiInstalled = true;
      saveConfig();
    }
  } catch (err) {
    logError('Failed to load config', err);
  }
}

// Save configuration
function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    log('Config saved');
  } catch (err) {
    logError('Failed to save config', err);
  }
}

// Create the main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 700,
    minWidth: 420,
    minHeight: 600,
    resizable: true,
    frame: false,
    titleBarStyle: 'hidden',
    show: !config.startMinimized,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Remove the menu bar completely
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setMenu(null);
  Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    if (!config.startMinimized) {
      mainWindow.show();
    }
    sendStatusToRenderer();
  });

  mainWindow.on('close', (event) => {
    if (config.minimizeToTray && isWorkerRunning) {
      event.preventDefault();
      mainWindow.hide();
      showNotification('ComputeGrid Worker', 'Worker is still running in the background');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create a simple tray icon programmatically
function createTrayIcon() {
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const ratio = (x + y) / (size * 2);
      canvas[idx] = Math.floor(124 + (0 - 124) * ratio);
      canvas[idx + 1] = Math.floor(58 + (212 - 58) * ratio);
      canvas[idx + 2] = Math.floor(237 + (255 - 237) * ratio);
      canvas[idx + 3] = 255;
    }
  }
  
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

// Create system tray
function createTray() {
  let trayIcon;
  
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  try {
    if (fs.existsSync(iconPath)) {
      trayIcon = nativeImage.createFromPath(iconPath);
    }
    if (!trayIcon || trayIcon.isEmpty()) {
      trayIcon = createTrayIcon();
    }
  } catch (err) {
    trayIcon = createTrayIcon();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('ComputeGrid Worker');
  updateTrayMenu();

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    } else {
      createWindow();
    }
  });
}

// Update tray menu
function updateTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Status: ${isOnline ? 'Online' : 'Offline'}`,
      enabled: false
    },
    {
      label: `Tasks: ${stats.tasksCompleted}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: isOnline ? 'Go Offline' : 'Go Online',
      click: () => {
        toggleOnlineStatus();
      }
    },
    {
      label: 'Open Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        } else {
          createWindow();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.send('navigate', 'settings');
        } else {
          createWindow();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        stopWorker();
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(`ComputeGrid Worker - ${isOnline ? 'Online' : 'Offline'} | ${stats.tasksCompleted} tasks`);
}

// Show notification
function showNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

// Send status to renderer
function sendStatusToRenderer() {
  if (mainWindow && mainWindow.webContents) {
    // Check if image AI model is installed
    const imageAiInstalled = fs.existsSync(SD_MODEL_PATH);
    
    mainWindow.webContents.send('status-update', {
      isRunning: isWorkerRunning,
      isOnline,
      stats,
      config: {
        apiKey: config.apiKey ? '***' + config.apiKey.slice(-6) : '',
        serverUrl: SERVER_URL,
        autoStart: config.autoStart,
        minimizeToTray: config.minimizeToTray,
        startMinimized: config.startMinimized
      },
      ollamaDownloadProgress,
      setupPhase,
      setupProgress,
      lastError,
      gpuInfo,
      gpuOverrideEnabled: config.gpuOverrideEnabled || false,
      imageAiEnabled: config.imageAiEnabled || false,
      imageAiInstalled
    });
  }
}

// Check if Ollama is installed (check local installation first, then system)
async function checkOllama() {
  const localBinary = getOllamaBinaryPath();
  
  // Check local installation first
  if (fs.existsSync(localBinary)) {
    stats.ollamaStatus = 'installed';
    log('Ollama found at: ' + localBinary);
    return true;
  }
  
  // Fallback: check system installation
  return new Promise((resolve) => {
    const checkCmd = process.platform === 'win32' ? 'where ollama' : 'which ollama';
    exec(checkCmd, (error, stdout) => {
      if (error) {
        stats.ollamaStatus = 'not installed';
        log('Ollama not found');
        resolve(false);
      } else {
        stats.ollamaStatus = 'installed';
        log('Ollama found in system PATH: ' + stdout.trim());
        resolve(true);
      }
    });
  });
}

// Check if Ollama service is running
async function checkOllamaRunning() {
  return new Promise((resolve) => {
    http.get(`${OLLAMA_HOST}/api/version`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const info = JSON.parse(data);
          log('Ollama service is running: ' + JSON.stringify(info));
          resolve(true);
        } catch {
          resolve(false);
        }
      });
    }).on('error', () => {
      resolve(false);
    });
  });
}

// Start Ollama service (using local binary if available)
async function startOllamaService() {
  const localBinary = getOllamaBinaryPath();
  const useLocal = fs.existsSync(localBinary);
  
  log('Starting Ollama service...');
  setupPhase = 'starting-service';
  setupProgress = 0;
  sendStatusToRenderer();
  
  // Ensure models directory exists
  if (!fs.existsSync(OLLAMA_MODELS_DIR)) {
    fs.mkdirSync(OLLAMA_MODELS_DIR, { recursive: true });
  }
  
  // Set environment for local models storage
  const env = {
    ...process.env,
    OLLAMA_MODELS: OLLAMA_MODELS_DIR
  };
  
  return new Promise((resolve) => {
    if (useLocal) {
      // Use local binary
      log('Using local Ollama binary: ' + localBinary);
      spawn(localBinary, ['serve'], { 
        detached: true, 
        stdio: 'ignore',
        env 
      }).unref();
    } else {
      // Fall back to system installation
      log('Using system Ollama');
      if (process.platform === 'win32') {
        exec('ollama serve', { detached: true, stdio: 'ignore', env });
      } else {
        exec('ollama serve &', { detached: true, stdio: 'ignore', env });
      }
    }
    // Wait for service to start
    setTimeout(() => {
      setupPhase = null;
      sendStatusToRenderer();
      resolve(true);
    }, 3000);
  });
}

// Download file with progress (follows redirects properly)
function downloadFile(url, destPath, progressCallback) {
  return new Promise((resolve, reject) => {
    let lastReportedProgress = -1;
    
    const makeRequest = (requestUrl, redirectCount = 0) => {
      if (redirectCount > 10) {
        reject(new Error('Too many redirects'));
        return;
      }
      
      const protocol = requestUrl.startsWith('https') ? https : http;
      
      protocol.get(requestUrl, (response) => {
        // Handle redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            makeRequest(redirectUrl, redirectCount + 1);
          } else {
            reject(new Error('Redirect with no location'));
          }
          return;
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        
        const file = fs.createWriteStream(destPath);
        const totalBytes = parseInt(response.headers['content-length'], 10);
        let downloadedBytes = 0;
        
        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes && totalBytes > 0) {
            // Only report progress if it increased (prevents jumping around)
            const progress = Math.min(99, Math.round((downloadedBytes / totalBytes) * 100));
            if (progress > lastReportedProgress) {
              lastReportedProgress = progress;
              if (progressCallback) progressCallback(progress);
            }
          }
        });
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          if (progressCallback) progressCallback(100);
          resolve(destPath);
        });
        
        file.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
        
        response.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    };
    
    makeRequest(url);
  });
}

// Install Ollama locally within app data (deleted when app is uninstalled)
async function installOllama() {
  log('Installing Ollama...');
  setupPhase = 'downloading-ollama';
  setupProgress = 0;
  stats.ollamaStatus = 'Downloading AI Engine...';
  ollamaDownloadProgress = 0;
  sendStatusToRenderer();

  const platform = process.platform;
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  
  // Get download URL for this platform/arch
  const platformUrls = OLLAMA_BINARY_URLS[platform];
  if (!platformUrls) {
    const errorMsg = `Unsupported platform: ${platform}`;
    logError(errorMsg);
    stats.ollamaStatus = 'unsupported platform';
    setupPhase = null;
    sendStatusToRenderer();
    return false;
  }
  
  const downloadUrl = platformUrls[arch];
  log(`Downloading from: ${downloadUrl}`);
  
  // Create directories
  if (!fs.existsSync(OLLAMA_BIN_DIR)) {
    fs.mkdirSync(OLLAMA_BIN_DIR, { recursive: true });
  }
  if (!fs.existsSync(OLLAMA_MODELS_DIR)) {
    fs.mkdirSync(OLLAMA_MODELS_DIR, { recursive: true });
  }

  try {
    const tempDir = os.tmpdir();
    const ollamaBinary = getOllamaBinaryPath();
    
    if (platform === 'win32') {
      // Windows: download zip and extract
      const zipPath = path.join(tempDir, 'ollama-windows.zip');
      
      await downloadFile(downloadUrl, zipPath, (progress) => {
        ollamaDownloadProgress = progress;
        setupProgress = progress;
        stats.ollamaStatus = `Downloading AI Engine... ${progress}%`;
        sendStatusToRenderer();
      });
      
      stats.ollamaStatus = 'Extracting AI Engine...';
      setupPhase = 'extracting';
      sendStatusToRenderer();
      log('Extracting Ollama...');
      
      // Extract using PowerShell
      return new Promise((resolve, reject) => {
        exec(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${OLLAMA_BIN_DIR}' -Force"`, (error, stdout, stderr) => {
          fs.unlink(zipPath, () => {});
          
          if (error) {
            logError('Extraction failed', error);
            stats.ollamaStatus = 'Install failed';
            setupPhase = null;
            sendStatusToRenderer();
            reject(error);
          } else {
            log('Ollama extracted successfully');
            stats.ollamaStatus = 'AI Engine Installed';
            ollamaDownloadProgress = 0;
            setupPhase = null;
            sendStatusToRenderer();
            resolve(true);
          }
        });
      });
      
    } else if (platform === 'linux') {
      // Linux: download tgz and extract
      const tgzPath = path.join(tempDir, 'ollama-linux.tgz');
      
      await downloadFile(downloadUrl, tgzPath, (progress) => {
        ollamaDownloadProgress = progress;
        setupProgress = progress;
        stats.ollamaStatus = `Downloading AI Engine... ${progress}%`;
        sendStatusToRenderer();
      });
      
      stats.ollamaStatus = 'Extracting AI Engine...';
      setupPhase = 'extracting';
      sendStatusToRenderer();
      log('Extracting Ollama...');
      
      return new Promise((resolve, reject) => {
        exec(`tar -xzf "${tgzPath}" -C "${OLLAMA_BIN_DIR}" && chmod +x "${ollamaBinary}"`, (error) => {
          fs.unlink(tgzPath, () => {});
          
          if (error) {
            logError('Extraction failed', error);
            stats.ollamaStatus = 'Install failed';
            setupPhase = null;
            sendStatusToRenderer();
            reject(error);
          } else {
            log('Ollama extracted successfully');
            stats.ollamaStatus = 'AI Engine Installed';
            ollamaDownloadProgress = 0;
            setupPhase = null;
            sendStatusToRenderer();
            resolve(true);
          }
        });
      });
      
    } else if (platform === 'darwin') {
      // macOS: download binary directly
      await downloadFile(downloadUrl, ollamaBinary, (progress) => {
        ollamaDownloadProgress = progress;
        setupProgress = progress;
        stats.ollamaStatus = `Downloading AI Engine... ${progress}%`;
        sendStatusToRenderer();
      });
      
      // Make executable
      fs.chmodSync(ollamaBinary, 0o755);
      log('Ollama installed successfully');
      stats.ollamaStatus = 'AI Engine Installed';
      ollamaDownloadProgress = 0;
      setupPhase = null;
      sendStatusToRenderer();
      return true;
    }
  } catch (err) {
    logError('Ollama installation failed', err);
    stats.ollamaStatus = 'Install failed';
    ollamaDownloadProgress = 0;
    setupPhase = null;
    sendStatusToRenderer();
    return false;
  }
}

// Get installed Ollama models
async function getOllamaModels() {
  return new Promise((resolve) => {
    http.get(`${OLLAMA_HOST}/api/tags`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          const models = response.models || [];
          stats.ollamaModels = models.map(m => ({
            name: m.name,
            size: m.size,
            modified: m.modified_at
          }));
          log(`Found ${models.length} Ollama models`);
          resolve(stats.ollamaModels);
        } catch {
          resolve([]);
        }
      });
    }).on('error', () => {
      resolve([]);
    });
  });
}

// Pull Ollama model (uses local binary if available)
async function pullModel(modelName) {
  const localBinary = getOllamaBinaryPath();
  const ollamaCmd = fs.existsSync(localBinary) ? `"${localBinary}"` : 'ollama';
  
  // Set environment for local models storage
  const env = {
    ...process.env,
    OLLAMA_MODELS: OLLAMA_MODELS_DIR
  };
  
  log(`Pulling model: ${modelName}`);
  setupPhase = 'downloading-model';
  setupProgress = 0;
  stats.ollamaStatus = `Downloading AI Model (${modelName})...`;
  sendStatusToRenderer();
  
  return new Promise((resolve, reject) => {
    const pullProcess = exec(`${ollamaCmd} pull ${modelName}`, { timeout: 600000, env });
    
    // Try to parse progress from stdout
    let lastProgress = 0;
    pullProcess.stdout.on('data', (data) => {
      const output = data.toString();
      log(`[Ollama pull] ${output.trim()}`);
      // Try to extract percentage
      const match = output.match(/(\d+)%/);
      if (match) {
        lastProgress = parseInt(match[1]);
        setupProgress = lastProgress;
        stats.ollamaStatus = `Downloading AI Model... ${lastProgress}%`;
        sendStatusToRenderer();
      }
    });
    
    pullProcess.stderr.on('data', (data) => {
      log(`[Ollama pull stderr] ${data.toString().trim()}`);
    });
    
    pullProcess.on('close', (code) => {
      if (code !== 0) {
        logError(`Model pull failed with code ${code}`);
        stats.ollamaStatus = 'Model download failed';
        setupPhase = null;
        sendStatusToRenderer();
        reject(new Error(`Pull failed with code ${code}`));
      } else {
        log(`Model ${modelName} pulled successfully`);
        stats.ollamaStatus = 'AI Ready';
        setupPhase = null;
        getOllamaModels();
        sendStatusToRenderer();
        resolve(true);
      }
    });
  });
}

// Delete Ollama model
async function deleteModel(modelName) {
  return new Promise((resolve, reject) => {
    exec(`ollama rm ${modelName}`, (error) => {
      if (error) {
        reject(error);
      } else {
        getOllamaModels();
        sendStatusToRenderer();
        resolve(true);
      }
    });
  });
}

// Toggle online status
async function toggleOnlineStatus() {
  log(`toggleOnlineStatus called - apiKey: ${config.apiKey ? 'present (' + config.apiKey.substring(0, 10) + '...)' : 'MISSING'}`);
  
  if (!config.apiKey) {
    logError('API key required to go online');
    stats.status = 'API key required';
    stats.lastError = 'Please enter your API key first';
    sendStatusToRenderer();
    return false;
  }
  
  const newStatus = !isOnline;
  log(`Toggling online status to: ${newStatus}`);
  log(`Making request to: ${SERVER_URL}/api/worker/set-online`);
  
  try {
    // Update server
    const result = await makeRequest(`${SERVER_URL}/api/worker/set-online`, {
      method: 'POST',
      body: { isOnline: newStatus }
    });
    
    log(`Set-online response: status=${result.status}, data=${JSON.stringify(result.data)}`);
    
    if (result.status === 200) {
      isOnline = newStatus;
      
      if (isOnline && !isWorkerRunning) {
        await startWorker();
      } else if (!isOnline && isWorkerRunning) {
        stopWorker();
      }
      
      sendStatusToRenderer();
      updateTrayMenu();
      showNotification('ComputeGrid Worker', isOnline ? 'You are now online and can receive tasks' : 'You are now offline');
      return true;
    } else {
      logError('Failed to update online status: ' + JSON.stringify(result.data));
      stats.lastError = result.data?.message || `Server error: ${result.status}`;
      sendStatusToRenderer();
      return false;
    }
  } catch (err) {
    logError('Failed to toggle online status - NETWORK ERROR', err);
    log(`Error details: ${err.code || 'no code'} - ${err.message}`);
    stats.lastError = `Network error: ${err.message}`;
    sendStatusToRenderer();
    return false;
  }
}

// Make HTTP request helper
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    log(`[makeRequest] ${options.method || 'GET'} ${url}`);
    
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey,
        ...options.headers
      },
      timeout: 30000
    };
    
    log(`[makeRequest] Connecting to ${reqOptions.hostname}:${reqOptions.port}${reqOptions.path}`);

    const req = lib.request(reqOptions, (res) => {
      log(`[makeRequest] Got response: ${res.statusCode}`);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        log(`[makeRequest] Response body: ${data.substring(0, 200)}`);
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', (err) => {
      log(`[makeRequest] REQUEST ERROR: ${err.code || 'unknown'} - ${err.message}`);
      reject(err);
    });
    
    req.on('timeout', () => {
      log(`[makeRequest] REQUEST TIMEOUT`);
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (options.body) {
      const bodyStr = JSON.stringify(options.body);
      log(`[makeRequest] Sending body: ${bodyStr}`);
      req.write(bodyStr);
    }
    
    req.end();
  });
}

// Validate API key with server
async function validateApiKey(apiKey) {
  log('Validating API key...');
  try {
    const result = await makeRequest(`${SERVER_URL}/api/worker/validate`, {
      method: 'GET',
      headers: { 'X-API-Key': apiKey }
    });
    
    if (result.status === 200) {
      log('API key validated successfully');
      return { valid: true, worker: result.data };
    } else {
      logError('API key validation failed: ' + JSON.stringify(result.data));
      return { valid: false, error: result.data.message || 'Invalid API key' };
    }
  } catch (err) {
    logError('API key validation request failed', err);
    return { valid: false, error: err.message };
  }
}

// Start the worker
async function startWorker() {
  earlyLog('startWorker() called');
  
  if (isWorkerRunning) {
    earlyLog('Worker already running, returning');
    log('Worker already running');
    return;
  }
  
  manualStop = false; // Allow auto-restart on crash
  lastError = null;
  
  if (!config.apiKey) {
    earlyLog('No API key configured');
    logError('API key required');
    stats.status = 'API key required';
    sendStatusToRenderer();
    return;
  }

  earlyLog(`API key present: ${config.apiKey.slice(0, 8)}...`);
  log('Starting worker...');
  stats.status = 'Starting...';
  sendStatusToRenderer();
  updateTrayMenu();

  try {
    // Validate API key first
    stats.status = 'Validating API key...';
    sendStatusToRenderer();
    
    const validation = await validateApiKey(config.apiKey);
    if (!validation.valid) {
      logError('API key invalid: ' + validation.error);
      stats.status = 'Invalid API key';
      sendStatusToRenderer();
      return;
    }
    
    log('API key valid, checking AI setup...');
    
    // Check and setup Ollama
    stats.status = 'Checking AI...';
    sendStatusToRenderer();
    
    const ollamaInstalled = await checkOllama();
    if (!ollamaInstalled) {
      log('Ollama not installed, installing...');
      try {
        await installOllama();
      } catch (err) {
        logError('Ollama install failed', err);
        // Continue anyway, will use simulated responses
      }
    }
    
    // Ensure Ollama service is running
    const ollamaRunning = await checkOllamaRunning();
    if (!ollamaRunning) {
      log('Ollama not running, starting service...');
      await startOllamaService();
      // Wait a bit more for service to be ready
      await new Promise(r => setTimeout(r, 2000));
    }
    
    // Get current models
    const models = await getOllamaModels();
    log(`Found ${models.length} models`);
    
    // Check if we need to pull a model
    if (models.length === 0) {
      const totalMem = os.totalmem() / (1024 * 1024 * 1024);
      const modelToPull = totalMem >= 8 ? 'mistral' : 'tinyllama';
      log(`No models found, pulling ${modelToPull} (RAM: ${totalMem.toFixed(1)}GB)`);
      
      try {
        await pullModel(modelToPull);
      } catch (err) {
        logError('Model pull failed', err);
        // Continue anyway, will use simulated responses
      }
    }

    // Set online status BEFORE starting worker - this must succeed for worker to poll
    log('Setting online status with server...');
    stats.status = 'Connecting...';
    sendStatusToRenderer();
    
    let onlineStatusSet = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        log(`Setting online status (attempt ${attempt}/3)...`);
        const result = await makeRequest(`${SERVER_URL}/api/worker/set-online`, {
          method: 'POST',
          body: { isOnline: true }
        });
        
        if (result.status === 200) {
          log('Online status set successfully');
          onlineStatusSet = true;
          break;
        } else {
          log(`Set online failed: ${result.status} - ${JSON.stringify(result.data)}`);
        }
      } catch (err) {
        log(`Set online error (attempt ${attempt}): ${err.message}`);
      }
      
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    if (!onlineStatusSet) {
      log('ERROR: Could not set online status after 3 attempts. Worker will not be able to receive tasks.');
      stats.status = 'Error: Could not go online';
      stats.lastError = 'Failed to set online status with server';
      sendStatusToRenderer();
      updateTrayMenu();
      showNotification('ComputeGrid Worker', 'Failed to connect to server. Please check your internet connection.');
      return;
    }
    
    isOnline = true;
    
    // Start the worker process with integrity info
    earlyLog('About to start worker process');
    log('Starting worker process...');
    
    const workerScript = getWorkerScriptPath();
    earlyLog(`Worker script path: ${workerScript}`);
    earlyLog(`Worker script exists: ${fs.existsSync(workerScript)}`);
    log(`Worker script path: ${workerScript}`);
    log(`Worker script exists: ${fs.existsSync(workerScript)}`);
    const appSignature = generateAppSignature();
    
    // Log directory for worker debug logs
    const logDir = path.join(app.getPath('userData'), 'logs');
    log(`Log directory: ${logDir}`);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
      log('Created log directory');
    }
    
    // Write a main process log file for debugging
    const mainLogFile = path.join(logDir, 'main-process.log');
    try {
      fs.appendFileSync(mainLogFile, `\n[${new Date().toISOString()}] Starting worker process...\n`);
      fs.appendFileSync(mainLogFile, `Worker script: ${workerScript}\n`);
      fs.appendFileSync(mainLogFile, `Script exists: ${fs.existsSync(workerScript)}\n`);
      fs.appendFileSync(mainLogFile, `API key set: ${config.apiKey ? 'yes' : 'no'}\n`);
      fs.appendFileSync(mainLogFile, `Server URL: ${SERVER_URL}\n`);
    } catch (e) {
      log('Failed to write main log file: ' + e.message);
    }
    
    earlyLog(`Spawning worker with fork(): ${workerScript}`);
    
    // Use fork() instead of spawn() - fork is designed for Node.js child processes
    // and works correctly in packaged Electron apps
    const { fork } = require('child_process');
    
    workerProcess = fork(workerScript, [], {
      env: {
        ...process.env,
        CG_API_KEY: config.apiKey,
        CG_SERVER_URL: SERVER_URL,
        CG_APP_VERSION: APP_VERSION,
        CG_APP_SIGNATURE: appSignature,
        CG_LOG_DIR: logDir,
        ELECTRON_RUN_AS_NODE: '1'  // Critical: tells Electron to run as Node.js
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      execPath: process.execPath  // Use Electron's Node.js runtime
    });
    
    earlyLog(`Worker process started (PID: ${workerProcess.pid})`);
    log(`Worker process started (PID: ${workerProcess.pid})`);
    
    // Log spawn result
    try {
      fs.appendFileSync(mainLogFile, `Worker PID: ${workerProcess.pid}\n`);
    } catch (e) {}
    isWorkerRunning = true;

    workerProcess.stdout.on('data', (data) => {
      const message = data.toString();
      log('[Worker] ' + message.trim());
      parseWorkerOutput(message);
      // Update activity timestamp on any output
      lastWorkerActivity = Date.now();
    });

    workerProcess.stderr.on('data', (data) => {
      const message = data.toString().trim();
      logError('[Worker Error] ' + message);
    });

    workerProcess.on('message', (message) => {
      // Update activity timestamp on any message
      lastWorkerActivity = Date.now();
      
      if (message.type === 'stats') {
        stats = { ...stats, ...message.data };
        sendStatusToRenderer();
        updateTrayMenu();
      } else if (message.type === 'error') {
        // Log error and update lastError so it surfaces to the UI
        logError('Worker error: ' + message.error);
        lastError = message.error;
        sendStatusToRenderer();
      }
    });

    workerProcess.on('close', (code) => {
      earlyLog(`Worker process exited with code ${code}`);
      log(`Worker process exited with code ${code}`);
      
      // Log to file for debugging
      try {
        const logDir = path.join(app.getPath('userData'), 'logs');
        const mainLogFile = path.join(logDir, 'main-process.log');
        fs.appendFileSync(mainLogFile, `[${new Date().toISOString()}] Worker exited with code: ${code}\n`);
      } catch (e) {}
      
      isWorkerRunning = false;
      isOnline = false;
      
      // Check if this was a manual stop or a crash
      if (manualStop) {
        stats.status = 'Offline';
        log('Worker stopped by user');
      } else if (code === 0) {
        stats.status = 'Stopped';
      } else {
        stats.status = 'Crashed';
      }
      
      if (code !== 0 && code !== null && !manualStop) {
        logError(`Worker crashed with exit code ${code}`);
        // Auto-restart after crash (unless manually stopped)
        if (config.apiKey) {
          log('Auto-restarting worker in 5 seconds...');
          stats.status = 'Restarting...';
          sendStatusToRenderer();
          setTimeout(() => {
            if (!isWorkerRunning && config.apiKey) {
              startWorker();
            }
          }, 5000);
        }
      }
      sendStatusToRenderer();
      updateTrayMenu();
    });

    workerProcess.on('error', (err) => {
      earlyLog(`Worker process error: ${err.message}`);
      logError('Worker process error', err);
      isWorkerRunning = false;
      isOnline = false;
      stats.status = 'Error';
      sendStatusToRenderer();
      updateTrayMenu();
    });

    stats.status = 'Running';
    lastWorkerActivity = Date.now();
    
    // Start watchdog to detect unresponsive worker
    startWatchdog();
    
    sendStatusToRenderer();
    updateTrayMenu();
    showNotification('ComputeGrid Worker', 'Worker started - You are now online');
    
  } catch (err) {
    logError('Failed to start worker', err);
    stats.status = 'Failed to start';
    isWorkerRunning = false;
    sendStatusToRenderer();
    updateTrayMenu();
  }
}

// Parse worker output for stats
function parseWorkerOutput(message) {
  if (message.includes('Task completed')) {
    stats.tasksCompleted++;
  }
  sendStatusToRenderer();
  updateTrayMenu();
}

// Watchdog: detect unresponsive worker
function startWatchdog() {
  stopWatchdog(); // Clear any existing watchdog
  
  watchdogInterval = setInterval(() => {
    if (!isWorkerRunning || manualStop) {
      return; // Don't check if worker is not running or manually stopped
    }
    
    const timeSinceActivity = Date.now() - lastWorkerActivity;
    
    if (timeSinceActivity > WATCHDOG_TIMEOUT_MS) {
      log(`Watchdog: Worker unresponsive for ${Math.round(timeSinceActivity / 1000)}s, restarting...`);
      logError(`Worker unresponsive, forcing restart`);
      
      // Kill the worker and let the close handler restart it
      if (workerProcess) {
        workerProcess.kill('SIGKILL');
        workerProcess = null;
      }
      isWorkerRunning = false;
      stats.status = 'Restarting (unresponsive)...';
      sendStatusToRenderer();
      
      // Restart after a short delay
      setTimeout(() => {
        if (!isWorkerRunning && config.apiKey && !manualStop) {
          startWorker();
        }
      }, 3000);
    }
  }, WATCHDOG_CHECK_INTERVAL_MS);
  
  log('Watchdog started');
}

function stopWatchdog() {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
    log('Watchdog stopped');
  }
}

// Stop the worker
async function stopWorker() {
  log('Stopping worker...');
  manualStop = true; // Prevent auto-restart
  stopWatchdog(); // Stop watchdog when worker stops
  
  if (workerProcess) {
    workerProcess.kill();
    workerProcess = null;
  }
  
  isWorkerRunning = false;
  isOnline = false;
  stats.status = 'Stopped';
  
  // Update server with offline status
  try {
    await makeRequest(`${SERVER_URL}/api/worker/set-online`, {
      method: 'POST',
      body: { isOnline: false }
    });
  } catch (err) {
    log('Could not update offline status: ' + err.message);
  }
  
  sendStatusToRenderer();
  updateTrayMenu();
}

// Clear app data (including AI and models)
function clearAppData() {
  try {
    // Delete config file
    if (fs.existsSync(CONFIG_PATH)) {
      fs.unlinkSync(CONFIG_PATH);
    }
    
    // Delete Ollama directory (binary and models)
    if (fs.existsSync(OLLAMA_DIR)) {
      fs.rmSync(OLLAMA_DIR, { recursive: true, force: true });
      log('Deleted Ollama directory: ' + OLLAMA_DIR);
    }
    
    config = {
      apiKey: '',
      autoStart: false,
      minimizeToTray: true,
      startMinimized: false
    };
    
    stats = {
      tasksCompleted: 0,
      status: 'stopped',
      ollamaStatus: 'not installed',
      ollamaModels: []
    };
    
    lastError = null;
    sendStatusToRenderer();
    log('App data cleared');
  } catch (err) {
    logError('Failed to clear app data', err);
  }
}

// Uninstall guidance
function showUninstallInstructions() {
  const platform = process.platform;
  let message = '';
  
  if (platform === 'win32') {
    message = 'To uninstall:\n\n1. Go to Settings > Apps > Installed apps\n2. Find "ComputeGrid Worker"\n3. Click the three dots and select "Uninstall"';
  } else if (platform === 'darwin') {
    message = 'To uninstall:\n\n1. Open Finder\n2. Go to Applications\n3. Drag "ComputeGrid Worker" to the Trash\n4. Empty the Trash';
  } else {
    message = 'To uninstall, delete the AppImage file you downloaded.';
  }
  
  dialog.showMessageBoxSync(mainWindow, {
    type: 'info',
    title: 'Uninstall Instructions',
    message: 'ComputeGrid Worker',
    detail: message
  });
}

// IPC handlers
ipcMain.handle('get-status', () => ({
  isRunning: isWorkerRunning,
  isOnline,
  stats,
  config: {
    apiKey: config.apiKey ? '***' + config.apiKey.slice(-6) : '',
    serverUrl: SERVER_URL,
    autoStart: config.autoStart,
    minimizeToTray: config.minimizeToTray,
    startMinimized: config.startMinimized
  },
  ollamaDownloadProgress,
  setupPhase,
  setupProgress,
  lastError,
  // Image AI status
  gpuInfo: gpuInfo || { hasGpu: false, gpuVramGb: 0, canGenerateImages: false },
  imageAiInstalled: config.imageAiInstalled || false,
  imageAiEnabled: config.imageAiEnabled || false
}));

ipcMain.handle('save-config', async (event, newConfig) => {
  log('Saving config...');
  // If API key is masked, keep the old one
  if (newConfig.apiKey && !newConfig.apiKey.includes('*')) {
    config.apiKey = newConfig.apiKey;
  }
  config.autoStart = newConfig.autoStart ?? config.autoStart;
  config.minimizeToTray = newConfig.minimizeToTray ?? config.minimizeToTray;
  config.startMinimized = newConfig.startMinimized ?? config.startMinimized;
  
  saveConfig();
  
  // Update auto-start setting
  app.setLoginItemSettings({
    openAtLogin: config.autoStart,
    path: process.execPath
  });
  
  sendStatusToRenderer();
  return true;
});

ipcMain.handle('start-worker', async () => {
  earlyLog('IPC: start-worker called');
  try {
    await startWorker();
    earlyLog('IPC: start-worker completed successfully');
    return true;
  } catch (err) {
    earlyLog(`IPC: start-worker failed: ${err.message}`);
    throw err;
  }
});

ipcMain.handle('stop-worker', async () => {
  await stopWorker();
  return true;
});

ipcMain.handle('toggle-online', async () => {
  return await toggleOnlineStatus();
});

ipcMain.handle('check-ollama', checkOllama);

ipcMain.handle('get-ollama-models', getOllamaModels);

ipcMain.handle('pull-model', async (event, modelName) => {
  try {
    await pullModel(modelName);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('delete-model', async (event, modelName) => {
  try {
    await deleteModel(modelName);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
});

// Image AI management
const IMAGE_AI_DIR = path.join(app.getPath('userData'), 'image-ai');
const SD_MODEL_PATH = path.join(IMAGE_AI_DIR, 'sd-v1-5.safetensors');
const SD_MODEL_URL = 'https://huggingface.co/runwayml/stable-diffusion-v1-5/resolve/main/v1-5-pruned-emaonly.safetensors';
const SD_MODEL_SIZE_BYTES = 4265380512; // ~4GB

let imageAiDownloadController = null;

ipcMain.handle('set-gpu-override', async (event, enabled) => {
  config.gpuOverrideEnabled = enabled;
  // If enabling override, also update gpuInfo to reflect this
  if (enabled) {
    gpuInfo.canGenerateImages = true;
    gpuInfo.gpuVramGb = gpuInfo.gpuVramGb || 8; // Assume 8GB if unknown
  }
  saveConfig();
  sendStatusToRenderer();
  log('GPU override set to: ' + enabled);
  return true;
});

ipcMain.handle('set-image-ai-enabled', async (event, enabled) => {
  config.imageAiEnabled = enabled;
  saveConfig();
  sendStatusToRenderer();
  return true;
});

ipcMain.handle('download-image-ai', async () => {
  log('Starting Image AI download...');
  
  try {
    // Create directory if it doesn't exist
    if (!fs.existsSync(IMAGE_AI_DIR)) {
      fs.mkdirSync(IMAGE_AI_DIR, { recursive: true });
    }
    
    // Check if already downloading
    if (imageAiDownloadController) {
      log('Image AI download already in progress');
      return false;
    }
    
    // Start download with progress tracking
    const https = require('https');
    const http = require('http');
    
    return new Promise((resolve, reject) => {
      const tempPath = SD_MODEL_PATH + '.tmp';
      const file = fs.createWriteStream(tempPath);
      let downloadedBytes = 0;
      let lastProgressUpdate = 0;
      
      const downloadUrl = SD_MODEL_URL;
      const protocol = downloadUrl.startsWith('https') ? https : http;
      
      log(`Downloading from: ${downloadUrl}`);
      
      const request = protocol.get(downloadUrl, { 
        headers: { 'User-Agent': 'ComputeGrid-Worker/1.3.0' }
      }, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          log(`Redirecting to: ${redirectUrl}`);
          file.close();
          fs.unlinkSync(tempPath);
          
          // Follow redirect
          const redirectProtocol = redirectUrl.startsWith('https') ? https : http;
          redirectProtocol.get(redirectUrl, { 
            headers: { 'User-Agent': 'ComputeGrid-Worker/1.3.0' }
          }, handleResponse).on('error', handleError);
          return;
        }
        
        handleResponse(response);
      });
      
      function handleResponse(response) {
        const totalBytes = parseInt(response.headers['content-length'], 10) || SD_MODEL_SIZE_BYTES;
        log(`Download started, total size: ${(totalBytes / 1024 / 1024 / 1024).toFixed(2)}GB`);
        
        response.pipe(file);
        
        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const progress = Math.floor((downloadedBytes / totalBytes) * 100);
          
          // Update progress every 1%
          if (progress > lastProgressUpdate) {
            lastProgressUpdate = progress;
            if (mainWindow) {
              mainWindow.webContents.send('image-ai-progress', progress);
            }
            if (progress % 10 === 0) {
              log(`Image AI download: ${progress}% (${(downloadedBytes / 1024 / 1024).toFixed(0)}MB / ${(totalBytes / 1024 / 1024).toFixed(0)}MB)`);
            }
          }
        });
        
        response.on('end', () => {
          file.close(() => {
            // Rename temp file to final
            fs.renameSync(tempPath, SD_MODEL_PATH);
            config.imageAiInstalled = true;
            saveConfig();
            sendStatusToRenderer();
            log('Image AI download complete');
            imageAiDownloadController = null;
            resolve(true);
          });
        });
      }
      
      function handleError(err) {
        file.close();
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
        log(`Image AI download failed: ${err.message}`);
        if (mainWindow) {
          mainWindow.webContents.send('image-ai-error', err.message);
        }
        imageAiDownloadController = null;
        reject(err);
      }
      
      request.on('error', handleError);
      
      imageAiDownloadController = request;
    });
  } catch (err) {
    log(`Image AI download failed: ${err.message}`);
    imageAiDownloadController = null;
    return false;
  }
});

ipcMain.handle('cancel-image-ai-download', async () => {
  if (imageAiDownloadController) {
    imageAiDownloadController.destroy();
    imageAiDownloadController = null;
    log('Image AI download cancelled');
    return true;
  }
  return false;
});

ipcMain.handle('uninstall-image-ai', async () => {
  log('Uninstalling Image AI...');
  try {
    // Delete the Stable Diffusion model files
    if (fs.existsSync(SD_MODEL_PATH)) {
      fs.unlinkSync(SD_MODEL_PATH);
      log('Deleted SD model file');
    }
    if (fs.existsSync(IMAGE_AI_DIR)) {
      fs.rmdirSync(IMAGE_AI_DIR, { recursive: true });
      log('Deleted Image AI directory');
    }
    config.imageAiInstalled = false;
    saveConfig();
    sendStatusToRenderer();
    log('Image AI uninstalled');
    return true;
  } catch (err) {
    log(`Image AI uninstall failed: ${err.message}`);
    return false;
  }
});

ipcMain.handle('get-server-url', () => SERVER_URL);

ipcMain.handle('get-version', () => APP_VERSION);

ipcMain.handle('get-app-info', () => ({
  version: APP_VERSION,
  platform: process.platform,
  arch: process.arch,
  electronVersion: process.versions.electron,
  nodeVersion: process.versions.node,
  serverUrl: SERVER_URL
}));

ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return result;
  } catch (err) {
    logError('Update check failed', err);
    return { error: err.message };
  }
});

ipcMain.handle('clear-data', () => {
  clearAppData();
  return true;
});

ipcMain.handle('uninstall-app', async () => {
  stopWorker();
  clearAppData();
  showUninstallInstructions();
  app.quit();
});

// Window control handlers
ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// Get worker logs
ipcMain.handle('get-logs', async () => {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    const logFile = path.join(logDir, 'computegrid-worker.log');
    
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf8');
      // Return last 100 lines
      const lines = content.split('\n');
      const lastLines = lines.slice(-100).join('\n');
      return { success: true, logs: lastLines, path: logFile };
    }
    return { success: true, logs: 'No logs yet.', path: logFile };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Open logs folder
ipcMain.handle('open-logs-folder', () => {
  const logDir = path.join(app.getPath('userData'), 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  shell.openPath(logDir);
});

// Auto-updater setup
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'TheFutureForgeCo',
    repo: 'Worker'
  });
  
  autoUpdater.on('checking-for-update', () => {
    log('Checking for updates...');
  });
  
  autoUpdater.on('update-available', (info) => {
    log('Update available: ' + info.version);
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { 
        status: 'downloading', 
        version: info.version 
      });
    }
  });
  
  autoUpdater.on('update-not-available', () => {
    log('No updates available');
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { status: 'up-to-date' });
    }
  });
  
  autoUpdater.on('update-downloaded', (info) => {
    log('Update downloaded: ' + info.version);
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { 
        status: 'ready', 
        version: info.version 
      });
    }
    
    // Install when idle (not processing tasks)
    if (!isWorkerRunning) {
      log('Installing update now (worker not running)');
      autoUpdater.quitAndInstall(true, true);
    } else {
      log('Update will install when worker stops');
    }
  });
  
  autoUpdater.on('error', (err) => {
    logError('Auto-updater error', err);
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { status: 'error' });
    }
  });
  
  // Check for updates on startup (after a delay)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      log('Initial update check failed: ' + err.message);
    });
  }, 10000);
  
  // Check hourly
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 60 * 60 * 1000);
}

// App initialization
app.whenReady().then(async () => {
  log('App starting...');
  loadConfig();
  await detectGpuInfo();
  createWindow();
  createTray();
  setupAutoUpdater();
  
  // Handle second instance (someone tried to run the app again)
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  
  // Auto-start worker if configured
  if (config.autoStart && config.apiKey) {
    log('Auto-starting worker...');
    setTimeout(() => startWorker(), 2000);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (!config.minimizeToTray || !isWorkerRunning) {
      app.quit();
    }
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  stopWorker();
});
