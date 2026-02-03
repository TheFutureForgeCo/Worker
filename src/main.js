const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, Notification, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, exec, execSync } = require('child_process');
const https = require('https');
const http = require('http');
const os = require('os');
const { autoUpdater } = require('electron-updater');

// Bundle manager for pre-packaged AI assets
const bundleManager = require('./bundle-manager');

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

// App version and integrity - use multiple fallback methods for packaged builds
let APP_VERSION = '1.0.0';
try {
  // Method 1: Require package.json (works in dev)
  APP_VERSION = require('../package.json').version;
} catch (e) {
  earlyLog(`Failed to load version from ../package.json: ${e.message}`);
  try {
    // Method 2: Try from app path (works in packaged)
    const pkgPath = path.join(app.getAppPath(), 'package.json');
    APP_VERSION = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version;
  } catch (e2) {
    earlyLog(`Failed to load version from app path: ${e2.message}`);
    // Method 3: Hardcode fallback
    APP_VERSION = '1.5.19';
  }
}
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

// Unified AI paths resolution - returns bundled paths when bundle is installed
function getAiPaths() {
  // Check if bundle is installed and configured
  if (config && config.bundleInstalled) {
    const bundlePaths = bundleManager.getBundlePaths();
    if (bundlePaths.isValid) {
      return {
        useBundled: true,
        ollamaBinary: bundlePaths.ollamaBinary,
        ollamaModelsDir: bundlePaths.ollamaModelsDir,
        pythonDir: bundlePaths.pythonDir,
        pythonExe: bundlePaths.pythonExe,
        sdModelPath: bundlePaths.sdModelPath,
        imageGenScript: bundlePaths.imageGenScript
      };
    }
  }
  
  // Fall back to legacy paths
  return {
    useBundled: false,
    ollamaBinary: getOllamaBinaryPath(),
    ollamaModelsDir: OLLAMA_MODELS_DIR,
    pythonDir: path.join(app.getPath('userData'), 'image-ai', 'python'),
    pythonExe: process.platform === 'win32'
      ? path.join(app.getPath('userData'), 'image-ai', 'python', 'python', 'python.exe')
      : path.join(app.getPath('userData'), 'image-ai', 'python', 'python', 'bin', 'python'),
    sdModelPath: path.join(app.getPath('userData'), 'image-ai', 'sd-onnx'),
    imageGenScript: null
  };
}

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
  ollamaStatus: 'idle',  // Changed from 'checking...' - actual check happens on Go Online
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
let deviceId = null; // Unique device identifier for per-device tracking
const WATCHDOG_TIMEOUT_MS = 60000; // 60 seconds without activity = unresponsive
const WATCHDOG_CHECK_INTERVAL_MS = 15000; // Check every 15 seconds

// Generate or load device ID for per-device tracking
function getOrCreateDeviceId() {
  const configPath = path.join(app.getPath('userData'), 'device-id');
  try {
    if (fs.existsSync(configPath)) {
      return fs.readFileSync(configPath, 'utf8').trim();
    }
    // Generate new device ID using machine info
    const crypto = require('crypto');
    const os = require('os');
    const machineId = `${os.hostname()}-${os.platform()}-${os.arch()}-${os.cpus()[0]?.model || 'unknown'}`;
    const id = crypto.createHash('sha256').update(machineId + Date.now()).digest('hex').substring(0, 32);
    fs.writeFileSync(configPath, id);
    return id;
  } catch (err) {
    log('Error with device ID: ' + err.message);
    return 'unknown-' + Date.now();
  }
}

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
    const sdModelPath = path.join(imageAiDir, 'sd-onnx', 'model_index.json');
    const modelExists = fs.existsSync(sdModelPath);
    
    // Check if ALL image AI components are present (not just model)
    const pythonExists = fs.existsSync(PYTHON_EXE);
    const depsMarker = path.join(PYTHON_DIR, '.deps-installed');
    const depsExist = fs.existsSync(depsMarker);
    const fullyInstalled = pythonExists && depsExist && modelExists;
    
    if (config.imageAiInstalled && !fullyInstalled) {
      log(`Image AI incomplete (python=${pythonExists}, deps=${depsExist}, model=${modelExists}), updating config`);
      config.imageAiInstalled = false;
      saveConfig();
    } else if (!config.imageAiInstalled && fullyInstalled) {
      log('Image AI fully installed, updating config and enabling');
      config.imageAiInstalled = true;
      config.imageAiEnabled = true; // Enable so benchmark can run
      saveConfig();
    }
    
    // Also ensure imageAiEnabled is true if Image AI is fully installed
    // This fixes cases where config.imageAiEnabled was false after restart
    if (fullyInstalled && !config.imageAiEnabled) {
      log('Image AI installed but not enabled, enabling now');
      config.imageAiEnabled = true;
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

  // Push version to renderer after page loads (more reliable than IPC invoke)
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('app-version', APP_VERSION);
    log(`[Main] Sent app version to renderer: ${APP_VERSION}`);
  });

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
    // Check if image AI is FULLY installed (Python + deps + model)
    const pythonReady = fs.existsSync(PYTHON_EXE);
    const depsMarker = path.join(PYTHON_DIR, '.deps-installed');
    const depsReady = fs.existsSync(depsMarker);
    const modelReady = fs.existsSync(SD_MODEL_INDEX_PATH);
    const imageAiInstalled = pythonReady && depsReady && modelReady;
    
    // Log for debugging
    if (config.imageAiEnabled) {
      log(`[Status] Image AI: python=${pythonReady}, deps=${depsReady}, model=${modelReady}, installed=${imageAiInstalled}`);
    }
    
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
      // Image AI status
      imageAiEnabled: config.imageAiEnabled || false,
      imageAiInstalled,
      imageBenchmarkTimeMs: config.imageBenchmarkTimeMs || null,
      imageQualityTier: config.imageQualityTier || 'none',
      deviceId: deviceId
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
  // Don't show overlay for model download - just update status text on main screen
  // This prevents the confusing screen jump after Ollama binary downloads
  setupPhase = null;
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
        
        // Notify renderer that Ollama setup is complete
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('ollama-setup-complete');
          log('Sent ollama-setup-complete event to renderer');
        }
        
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
  
  // Block network calls in Maximum Privacy Mode
  if (config.maxPrivacyMode) {
    log('[Privacy] toggleOnlineStatus blocked - Maximum Privacy Mode enabled');
    stats.status = 'Privacy Mode Active';
    stats.lastError = 'Maximum Privacy Mode is enabled - no server connections allowed';
    sendStatusToRenderer();
    return false;
  }
  
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
    // Centralized privacy mode check - block all server requests
    if (config.maxPrivacyMode && url.includes(SERVER_URL)) {
      log(`[makeRequest] BLOCKED by Maximum Privacy Mode: ${url}`);
      reject(new Error('Maximum Privacy Mode is enabled - no server connections allowed'));
      return;
    }
    
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
  // Block network calls in Maximum Privacy Mode
  if (config.maxPrivacyMode) {
    log('[Privacy] validateApiKey blocked - Maximum Privacy Mode enabled');
    return { valid: false, error: 'Maximum Privacy Mode is enabled - no server connections allowed' };
  }
  
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
  
  // Block worker start in Maximum Privacy Mode
  if (config.maxPrivacyMode) {
    earlyLog('[Privacy] startWorker blocked - Maximum Privacy Mode enabled');
    log('[Privacy] Worker start blocked - Maximum Privacy Mode enabled');
    stats.status = 'Privacy Mode Active';
    sendStatusToRenderer();
    return;
  }
  
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
    
    // Check if Image AI needs benchmark before starting worker
    // This ensures worker has the correct imageQualityTier for claiming image tasks
    if (config.imageAiEnabled && isImageAiFullyReady()) {
      if (!config.imageBenchmarkTimeMs || !config.imageQualityTier || config.imageQualityTier === 'none') {
        log('[ImageAI] Running benchmark before worker starts...');
        try {
          await checkAndRunBenchmarkIfNeeded();
        } catch (err) {
          log(`[ImageAI] Pre-worker benchmark failed: ${err.message}`);
        }
      }
    }
    
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
        CG_USER_DATA: app.getPath('userData'),  // Pass userData path for image AI
        CG_IMAGE_QUALITY_TIER: config.imageQualityTier || 'none',  // Pass image quality tier from benchmark
        CG_IMAGE_BENCHMARK_MS: String(config.imageBenchmarkTimeMs || 0),  // Pass benchmark time
        CG_MAX_PRIVACY_MODE: config.maxPrivacyMode ? '1' : '0',  // Pass privacy mode (safety check)
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
const SD_MODEL_DIR = path.join(IMAGE_AI_DIR, 'sd-onnx'); // ONNX models are stored in a directory
const SD_MODEL_PATH = SD_MODEL_DIR; // For compatibility with existing code
const PYTHON_DIR = path.join(IMAGE_AI_DIR, 'python');
// python-build-standalone extracts to a 'python/' subfolder containing bin/
const PYTHON_EXE = process.platform === 'win32' 
  ? path.join(PYTHON_DIR, 'python', 'python.exe')
  : path.join(PYTHON_DIR, 'python', 'bin', 'python3');

// ONNX model ID from Hugging Face - will be downloaded automatically by diffusers
const SD_ONNX_MODEL_ID = 'runwayml/stable-diffusion-v1-5';
// The model is downloaded on first use, so we check for the model_index.json file
const SD_MODEL_INDEX_PATH = path.join(SD_MODEL_DIR, 'model_index.json');

// Portable Python URLs for each platform
const PYTHON_URLS = {
  win32: 'https://github.com/indygreg/python-build-standalone/releases/download/20240107/cpython-3.11.7+20240107-x86_64-pc-windows-msvc-shared-install_only.tar.gz',
  linux: 'https://github.com/indygreg/python-build-standalone/releases/download/20240107/cpython-3.11.7+20240107-x86_64-unknown-linux-gnu-install_only.tar.gz',
  darwin: 'https://github.com/indygreg/python-build-standalone/releases/download/20240107/cpython-3.11.7+20240107-x86_64-apple-darwin-install_only.tar.gz'
};

let imageAiDownloadController = null;
let currentDownloadPhase = 'idle'; // 'idle', 'python', 'deps', 'model', 'benchmark'
let isDownloadPaused = false;
const DOWNLOAD_PROGRESS_FILE = path.join(app.getPath('userData'), 'image-ai', 'download-progress.json');

// Save download progress for resume capability
function saveDownloadProgress(phase, bytesDownloaded = 0, totalBytes = 0) {
  try {
    const dir = path.dirname(DOWNLOAD_PROGRESS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const progress = { phase, bytesDownloaded, totalBytes, timestamp: Date.now() };
    fs.writeFileSync(DOWNLOAD_PROGRESS_FILE, JSON.stringify(progress));
    log(`[ImageAI] Saved download progress: ${JSON.stringify(progress)}`);
  } catch (err) {
    log(`[ImageAI] Failed to save download progress: ${err.message}`);
  }
}

// Load saved download progress
function loadDownloadProgress() {
  try {
    if (fs.existsSync(DOWNLOAD_PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(DOWNLOAD_PROGRESS_FILE, 'utf-8'));
      log(`[ImageAI] Loaded download progress: ${JSON.stringify(data)}`);
      return data;
    }
  } catch (err) {
    log(`[ImageAI] Failed to load download progress: ${err.message}`);
  }
  return null;
}

// Clear download progress after successful completion
function clearDownloadProgress() {
  try {
    if (fs.existsSync(DOWNLOAD_PROGRESS_FILE)) {
      fs.unlinkSync(DOWNLOAD_PROGRESS_FILE);
      log('[ImageAI] Cleared download progress');
    }
  } catch (err) {
    log(`[ImageAI] Failed to clear download progress: ${err.message}`);
  }
}

// Check if Python environment is ready
function isPythonReady() {
  const ready = fs.existsSync(PYTHON_EXE);
  log(`[ImageAI] Python ready: ${ready} (path: ${PYTHON_EXE})`);
  return ready;
}

// Check if Python dependencies are installed
function areDepsInstalled() {
  const depsMarker = path.join(PYTHON_DIR, '.deps-installed');
  const ready = fs.existsSync(depsMarker);
  log(`[ImageAI] Deps installed: ${ready} (marker: ${depsMarker})`);
  return ready;
}

// Check if SD ONNX model is ready
function isModelReady() {
  // For ONNX models, check if the model directory exists and has model_index.json
  if (!fs.existsSync(SD_MODEL_DIR)) {
    log(`[ImageAI] ONNX model directory not found: ${SD_MODEL_DIR}`);
    return false;
  }
  // Check for model_index.json which indicates model is downloaded
  if (!fs.existsSync(SD_MODEL_INDEX_PATH)) {
    log(`[ImageAI] ONNX model index not found: ${SD_MODEL_INDEX_PATH}`);
    return false;
  }
  log(`[ImageAI] ONNX model ready at: ${SD_MODEL_DIR}`);
  return true;
}

// Check if ALL image AI components are ready (Python + deps + model)
function isImageAiFullyReady() {
  const pythonOk = isPythonReady();
  const depsOk = areDepsInstalled();
  const modelOk = isModelReady();
  const fullyReady = pythonOk && depsOk && modelOk;
  log(`[ImageAI] Fully ready: ${fullyReady} (python=${pythonOk}, deps=${depsOk}, model=${modelOk})`);
  return fullyReady;
}

// Check and auto-run benchmark if Image AI is ready but no benchmark exists
async function checkAndRunBenchmarkIfNeeded() {
  log('[ImageAI] Checking if benchmark is needed...');
  log(`[ImageAI] Config state: enabled=${config.imageAiEnabled}, installed=${config.imageAiInstalled}, tier=${config.imageQualityTier}, benchmarkMs=${config.imageBenchmarkTimeMs}`);
  
  // Only check if image AI is enabled
  if (!config.imageAiEnabled) {
    log('[ImageAI] Image AI not enabled (imageAiEnabled=false), skipping benchmark check');
    return;
  }
  
  // Check if Image AI is fully ready
  if (!isImageAiFullyReady()) {
    log('[ImageAI] Image AI not fully ready, skipping benchmark check');
    return;
  }
  
  // Check if we already have a valid benchmark result
  if (config.imageBenchmarkTimeMs && config.imageQualityTier && config.imageQualityTier !== 'none') {
    log(`[ImageAI] Benchmark already exists: ${config.imageBenchmarkTimeMs}ms, tier=${config.imageQualityTier}`);
    return;
  }
  
  // Need to run benchmark!
  // Run twice: first to warm up/cache model, second for accurate score
  log('[ImageAI] No valid benchmark found, running benchmark now...');
  log('[ImageAI] First run (warming up model cache)...');
  
  // Notify UI
  if (mainWindow) {
    mainWindow.webContents.send('image-ai-phase', 'benchmark');
    mainWindow.webContents.send('image-ai-benchmark-start');
    mainWindow.webContents.send('image-ai-deps-progress', 'Benchmark run 1/2 (warming up model)...');
  }
  
  // First run - warm up cache
  const warmupResult = await runBenchmark();
  if (!warmupResult.success) {
    log(`[ImageAI] Warmup benchmark failed: ${warmupResult.error}`);
  } else {
    log(`[ImageAI] Warmup completed: ${warmupResult.time}ms (not used for tier)`);
  }
  
  // Second run - actual benchmark with cached model
  log('[ImageAI] Second run (actual benchmark with cached model)...');
  if (mainWindow) {
    mainWindow.webContents.send('image-ai-deps-progress', 'Benchmark run 2/2 (measuring real performance)...');
  }
  
  const benchResult = await runBenchmark();
  
  if (benchResult.success) {
    log(`[ImageAI] Auto-benchmark completed: ${benchResult.time}ms, tier=${benchResult.tier}`);
  } else {
    log(`[ImageAI] Auto-benchmark failed: ${benchResult.error}`);
    
    // Set a fallback tier based on GPU VRAM (consistent with download handler)
    const vramGb = config.gpuVramGb || 0;
    if (vramGb >= 8) {
      config.imageQualityTier = 'medium'; // Allow up to 512px
    } else if (vramGb >= 6) {
      config.imageQualityTier = 'slow'; // 256px only
    } else {
      config.imageQualityTier = 'banned'; // Not enough VRAM - don't claim image tasks
    }
    config.imageBenchmarkTimeMs = null;
    saveConfig();
    
    log(`[ImageAI] Using fallback tier: ${config.imageQualityTier} (based on ${vramGb}GB VRAM)`);
    
    // Report fallback tier to server (blocked in Maximum Privacy Mode)
    if (config.apiKey && !config.maxPrivacyMode) {
      try {
        const response = await fetch(`${SERVER_URL}/api/worker/report-benchmark`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
          },
          body: JSON.stringify({
            deviceId: deviceId,
            benchmarkTimeMs: 0,
            qualityTier: config.imageQualityTier
          })
        });
        if (response.ok) {
          log('[ImageAI] Fallback tier reported to server successfully');
        } else {
          log('[ImageAI] Failed to report fallback tier: ' + response.status);
        }
      } catch (err) {
        log('[ImageAI] Error reporting fallback tier: ' + err.message);
      }
    } else if (config.maxPrivacyMode) {
      log('[ImageAI] [Privacy] Skipping benchmark report - Maximum Privacy Mode enabled');
    }
    
    // Notify UI
    if (mainWindow) {
      mainWindow.webContents.send('image-ai-benchmark-fallback', {
        tier: config.imageQualityTier,
        reason: benchResult.error
      });
    }
  }
}

ipcMain.handle('set-image-ai-enabled', async (event, enabled) => {
  config.imageAiEnabled = enabled;
  saveConfig();
  sendStatusToRenderer();
  log('Image AI enabled: ' + enabled);
  return true;
});

// Store benchmark result and report to server
async function reportBenchmarkResult(benchmarkTimeMs) {
  config.imageBenchmarkTimeMs = benchmarkTimeMs;
  
  // Determine quality tier based on benchmark time
  // Benchmark is for 256px image generation
  if (benchmarkTimeMs < 15000) {
    config.imageQualityTier = 'fast'; // All quality levels
  } else if (benchmarkTimeMs < 30000) {
    config.imageQualityTier = 'medium'; // Up to 512px
  } else if (benchmarkTimeMs < 60000) {
    config.imageQualityTier = 'slow'; // 256px only
  } else {
    config.imageQualityTier = 'banned'; // Too slow
  }
  
  saveConfig();
  sendStatusToRenderer();
  log(`Benchmark completed: ${benchmarkTimeMs}ms, tier: ${config.imageQualityTier}`);
  
  // Report to server (blocked in Maximum Privacy Mode)
  if (config.apiKey && !config.maxPrivacyMode) {
    try {
      const response = await fetch(`${SERVER_URL}/api/worker/report-benchmark`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          deviceId: deviceId,
          benchmarkTimeMs: benchmarkTimeMs,
          qualityTier: config.imageQualityTier
        })
      });
      if (response.ok) {
        log('Benchmark reported to server successfully');
      } else {
        log('Failed to report benchmark to server: ' + response.status);
      }
    } catch (err) {
      log('Error reporting benchmark to server: ' + err.message);
    }
  }
  
  return { tier: config.imageQualityTier };
}

ipcMain.handle('report-benchmark', async (event, benchmarkTimeMs) => {
  return await reportBenchmarkResult(benchmarkTimeMs);
});

// ========== BUNDLE MANAGEMENT IPC HANDLERS ==========

// Check if bundled AI is installed
ipcMain.handle('check-bundle-status', async () => {
  log('[Bundle] Checking bundle status...');
  const status = bundleManager.isBundleInstalled();
  log(`[Bundle] Status: ${JSON.stringify(status)}`);
  return status;
});

// Get bundle paths
ipcMain.handle('get-bundle-paths', async () => {
  return bundleManager.getBundlePaths();
});

// Install bundled AI assets
ipcMain.handle('install-bundle', async () => {
  log('[Bundle] Starting bundle installation...');
  
  const result = await bundleManager.installBundle(
    // Progress callback
    (progress) => {
      if (mainWindow) {
        mainWindow.webContents.send('bundle-progress', progress);
      }
    },
    // Status callback
    (status) => {
      log(`[Bundle] ${status}`);
      if (mainWindow) {
        mainWindow.webContents.send('bundle-status', status);
      }
    }
  );
  
  if (result.success) {
    log('[Bundle] Installation complete!');
    // Update paths to use bundled assets
    config.bundleInstalled = true;
    config.bundleVersion = result.version;
    saveConfig();
    sendStatusToRenderer();
  } else {
    log(`[Bundle] Installation failed: ${result.error}`);
  }
  
  return result;
});

// ========== END BUNDLE MANAGEMENT ==========

// ========== MAXIMUM PRIVACY MODE & LOCAL CHAT ==========
const LOCAL_CONVERSATIONS_FILE = path.join(app.getPath('userData'), 'local-conversations.json');

// Set maximum privacy mode
ipcMain.handle('set-max-privacy-mode', async (event, enabled) => {
  log(`[Privacy] Setting maximum privacy mode: ${enabled}`);
  config.maxPrivacyMode = enabled;
  saveConfig();
  sendStatusToRenderer();
  return true;
});

// Get maximum privacy mode status
ipcMain.handle('get-max-privacy-mode', async () => {
  return config.maxPrivacyMode || false;
});

// Local chat send - direct Ollama communication (no server)
ipcMain.handle('local-chat-send', async (event, message, model, conversationHistory) => {
  log(`[LocalChat] Sending message to ${model}: ${message.substring(0, 50)}...`);
  
  try {
    // Map friendly model names to actual Ollama model names
    const modelMap = {
      'mistral': 'mistral:7b',
      'tinyllama': 'tinyllama:1.1b'
    };
    const ollamaModel = modelMap[model] || 'mistral:7b';
    
    // Build messages array for Ollama
    const messages = conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    messages.push({ role: 'user', content: message });
    
    // Call Ollama directly
    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        messages: messages,
        stream: false
      })
    });
    
    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }
    
    const data = await response.json();
    log(`[LocalChat] Response received from ${ollamaModel}`);
    
    return {
      success: true,
      content: data.message?.content || '',
      model: ollamaModel
    };
  } catch (err) {
    log(`[LocalChat] Error: ${err.message}`);
    return {
      success: false,
      error: err.message
    };
  }
});

// Local chat stream - streaming Ollama communication
ipcMain.handle('local-chat-stream', async (event, message, model, conversationHistory) => {
  log(`[LocalChat] Starting stream to ${model}: ${message.substring(0, 50)}...`);
  
  try {
    const modelMap = {
      'mistral': 'mistral:7b',
      'tinyllama': 'tinyllama:1.1b'
    };
    const ollamaModel = modelMap[model] || 'mistral:7b';
    
    const messages = conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    messages.push({ role: 'user', content: message });
    
    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        messages: messages,
        stream: true
      })
    });
    
    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }
    
    let fullContent = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.message?.content) {
            fullContent += data.message.content;
            if (mainWindow) {
              mainWindow.webContents.send('local-chat-token', data.message.content);
            }
          }
        } catch (e) {
          // Ignore JSON parse errors for incomplete chunks
        }
      }
    }
    
    if (mainWindow) {
      mainWindow.webContents.send('local-chat-complete', fullContent);
    }
    
    return { success: true, content: fullContent };
  } catch (err) {
    log(`[LocalChat] Stream error: ${err.message}`);
    if (mainWindow) {
      mainWindow.webContents.send('local-chat-error', err.message);
    }
    return { success: false, error: err.message };
  }
});

// Local image generation - direct ONNX Runtime (no server)
ipcMain.handle('local-image-generate', async (event, prompt) => {
  log(`[LocalImage] Generating image for prompt: ${prompt.substring(0, 50)}...`);
  
  try {
    const aiPaths = getAiPaths();
    
    if (!config.imageAiInstalled && !aiPaths.useBundled) {
      throw new Error('Image AI is not installed');
    }
    
    // Generate a unique filename
    const timestamp = Date.now();
    const outputDir = path.join(app.getPath('userData'), 'local-images');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputPath = path.join(outputDir, `local_${timestamp}.png`);
    
    // Get Python executable and script paths
    const pythonExe = aiPaths.pythonExe;
    const scriptPath = aiPaths.imageGenScript || getSourcePath('sd_inference.py');
    const modelPath = aiPaths.sdModelPath || SD_MODEL_DIR;
    
    // Run the inference script with JSON input (same format as generateImage)
    const result = await new Promise((resolve, reject) => {
      const inputData = JSON.stringify({
        prompt: prompt,
        seed: Math.floor(Math.random() * 2147483647),
        width: 512,
        height: 512,
        model_dir: modelPath,
        is_benchmark: false,
        output_path: outputPath
      });
      
      log(`[LocalImage] Running: ${pythonExe} ${scriptPath}`);
      log(`[LocalImage] Input: ${inputData.substring(0, 100)}...`);
      
      const proc = spawn(pythonExe, [scriptPath, inputData], {
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        const msg = data.toString();
        stderr += msg;
        // Log progress for debugging
        const lines = msg.split('\n').filter(l => l.trim());
        for (const line of lines) {
          log(`[LocalImage] ${line}`);
        }
      });
      
      proc.on('close', (code) => {
        log(`[LocalImage] Process exited with code ${code}`);
        
        if (code === 0 && stdout.trim()) {
          try {
            // Parse the last line of stdout as JSON (same as generateImage)
            const lines = stdout.trim().split('\n');
            const jsonResult = JSON.parse(lines[lines.length - 1]);
            
            if (jsonResult.success) {
              // Save the image from base64 if output_path wasn't used
              if (jsonResult.image_base64 && !fs.existsSync(outputPath)) {
                const imageBuffer = Buffer.from(jsonResult.image_base64, 'base64');
                fs.writeFileSync(outputPath, imageBuffer);
              }
              resolve({ success: true, path: outputPath, ...jsonResult });
            } else {
              reject(new Error(jsonResult.error || 'Generation failed'));
            }
          } catch (parseErr) {
            log(`[LocalImage] Failed to parse output: ${stdout.slice(-500)}`);
            reject(new Error('Failed to parse generation result'));
          }
        } else {
          reject(new Error(stderr || `Process exited with code ${code}`));
        }
      });
      
      proc.on('error', reject);
    });
    
    if (mainWindow) {
      mainWindow.webContents.send('local-image-complete', result.path);
    }
    
    log(`[LocalImage] Image generated: ${result.path}`);
    return result;
  } catch (err) {
    log(`[LocalImage] Error: ${err.message}`);
    if (mainWindow) {
      mainWindow.webContents.send('local-image-error', err.message);
    }
    return { success: false, error: err.message };
  }
});

// Server chat send - use ComputeGrid network API
ipcMain.handle('server-chat-send', async (event, message, conversationHistory) => {
  log(`[ServerChat] Sending message to server: ${message.substring(0, 50)}...`);
  
  try {
    // CRITICAL: Block server calls in Maximum Privacy Mode
    if (config.maxPrivacyMode) {
      log('[ServerChat] BLOCKED - Maximum Privacy Mode is enabled');
      return {
        success: false,
        error: 'Maximum Privacy Mode is enabled. Server chat is disabled. Use Local Processing instead.'
      };
    }
    
    // Check if we have an API key
    if (!config.apiKey) {
      return {
        success: false,
        error: 'No API key configured. Please add your API key in the Worker tab.'
      };
    }
    
    // Call the ComputeGrid chat API (conversation history is managed server-side)
    const response = await fetch(`${SERVER_URL}/api/chat/send`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        message: message,
        settings: {
          useCredits: false,
          responseLength: 'medium',
          priority: 'standard'
        }
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    log(`[ServerChat] Response received from server`);
    
    // The server returns assistantMessage with content
    return {
      success: true,
      content: data.assistantMessage?.content || 'No response received'
    };
  } catch (err) {
    log(`[ServerChat] Error: ${err.message}`);
    return {
      success: false,
      error: err.message
    };
  }
});

// Save local conversations
ipcMain.handle('save-local-conversations', async (event, conversations) => {
  try {
    fs.writeFileSync(LOCAL_CONVERSATIONS_FILE, JSON.stringify(conversations, null, 2));
    return true;
  } catch (err) {
    log(`[LocalChat] Failed to save conversations: ${err.message}`);
    return false;
  }
});

// Load local conversations
ipcMain.handle('load-local-conversations', async () => {
  try {
    if (fs.existsSync(LOCAL_CONVERSATIONS_FILE)) {
      const data = fs.readFileSync(LOCAL_CONVERSATIONS_FILE, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (err) {
    log(`[LocalChat] Failed to load conversations: ${err.message}`);
    return [];
  }
});

// Clear local conversations
ipcMain.handle('clear-local-conversations', async () => {
  try {
    if (fs.existsSync(LOCAL_CONVERSATIONS_FILE)) {
      fs.unlinkSync(LOCAL_CONVERSATIONS_FILE);
    }
    // Also clear local images
    const localImagesDir = path.join(app.getPath('userData'), 'local-images');
    if (fs.existsSync(localImagesDir)) {
      fs.rmSync(localImagesDir, { recursive: true, force: true });
    }
    return true;
  } catch (err) {
    log(`[LocalChat] Failed to clear conversations: ${err.message}`);
    return false;
  }
});

// ========== END MAXIMUM PRIVACY MODE ==========

// Retry benchmark manually from UI
ipcMain.handle('retry-image-benchmark', async () => {
  log('[ImageAI] Manual benchmark retry requested from UI');
  
  // Check if Image AI is ready
  if (!isImageAiFullyReady()) {
    log('[ImageAI] Cannot retry benchmark - Image AI not fully ready');
    return { success: false, error: 'Image AI is not fully installed' };
  }
  
  // Notify UI that benchmark is starting
  if (mainWindow) {
    mainWindow.webContents.send('image-ai-phase', 'benchmark');
    mainWindow.webContents.send('image-ai-benchmark-start');
  }
  
  try {
    const benchResult = await runBenchmark();
    
    if (benchResult.success) {
      log(`[ImageAI] Manual benchmark completed: ${benchResult.time}ms, tier=${benchResult.tier}`);
      // Report to server - this also sets config.imageBenchmarkTimeMs and imageQualityTier
      await reportBenchmarkResult(benchResult.time);
      sendStatusToRenderer();
      return { success: true, time: benchResult.time, tier: config.imageQualityTier };
    } else {
      const errorMsg = benchResult.error || 'Unknown benchmark error';
      log(`[ImageAI] Manual benchmark failed: ${errorMsg}`);
      
      // Set fallback tier based on GPU VRAM
      const vramGb = config.gpuVramGb || 0;
      if (vramGb >= 8) {
        config.imageQualityTier = 'medium';
      } else if (vramGb >= 6) {
        config.imageQualityTier = 'slow';
      } else {
        config.imageQualityTier = 'banned';
      }
      config.imageBenchmarkTimeMs = null;
      saveConfig();
      
      log(`[ImageAI] Using fallback tier: ${config.imageQualityTier} (based on ${vramGb}GB VRAM)`);
      sendStatusToRenderer();
      return { success: false, error: errorMsg, tier: config.imageQualityTier };
    }
  } catch (err) {
    log(`[ImageAI] Manual benchmark error: ${err.message}`);
    sendStatusToRenderer();
    return { success: false, error: err.message || 'Benchmark failed unexpectedly' };
  }
});

// Download file with progress, proper redirects, and status checking
function downloadFile(url, destPath, onProgress, phaseForProgress = null) {
  return new Promise((resolve, reject) => {
    const tempPath = destPath + '.tmp';
    log(`[Download] Starting: ${url}`);
    log(`[Download] Destination: ${destPath}`);
    
    // Check for existing partial download
    let resumeFromBytes = 0;
    if (fs.existsSync(tempPath)) {
      try {
        const stats = fs.statSync(tempPath);
        resumeFromBytes = stats.size;
        log(`[Download] Found partial download: ${resumeFromBytes} bytes, will attempt resume`);
      } catch (err) {
        log(`[Download] Could not stat temp file: ${err.message}`);
      }
    }
    
    function doDownload(downloadUrl, redirectCount = 0) {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }
      
      // Check if paused before starting
      if (isDownloadPaused) {
        log('[Download] Download paused before starting');
        reject(new Error('PAUSED'));
        return;
      }
      
      const protocol = downloadUrl.startsWith('https') ? https : http;
      
      // Set up headers with Range for resume support
      const headers = { 
        'User-Agent': 'ComputeGrid-Worker/1.5.0',
        'Accept': '*/*'
      };
      if (resumeFromBytes > 0) {
        headers['Range'] = `bytes=${resumeFromBytes}-`;
        log(`[Download] Requesting with Range header: bytes=${resumeFromBytes}-`);
      }
      
      const request = protocol.get(downloadUrl, {
        headers,
        timeout: 30000
      }, (response) => {
        log(`[Download] Response status: ${response.statusCode}`);
        log(`[Download] Content-Length: ${response.headers['content-length']}`);
        log(`[Download] Accept-Ranges: ${response.headers['accept-ranges']}`);
        
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
          const redirectUrl = response.headers.location;
          log(`[Download] Redirecting to: ${redirectUrl}`);
          response.resume(); // Consume response to free up memory
          doDownload(redirectUrl, redirectCount + 1);
          return;
        }
        
        // Check for error status codes (200 = fresh, 206 = partial/resume)
        if (response.statusCode !== 200 && response.statusCode !== 206) {
          response.resume();
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }
        
        // If we got 200 instead of 206, server doesn't support resume - start fresh
        if (response.statusCode === 200 && resumeFromBytes > 0) {
          log('[Download] Server does not support resume (got 200), starting fresh');
          resumeFromBytes = 0;
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        }
        
        // Calculate total bytes
        let totalBytes;
        if (response.statusCode === 206) {
          // Partial content - get total from Content-Range header
          const contentRange = response.headers['content-range'];
          if (contentRange) {
            const match = contentRange.match(/bytes \d+-\d+\/(\d+)/);
            if (match) {
              totalBytes = parseInt(match[1], 10);
            }
          }
          if (!totalBytes) {
            totalBytes = resumeFromBytes + parseInt(response.headers['content-length'], 10) || 0;
          }
        } else {
          totalBytes = parseInt(response.headers['content-length'], 10) || 0;
        }
        
        let downloadedBytes = resumeFromBytes;
        let lastProgressUpdate = -1;
        let lastProgressSave = Date.now();
        
        // Open file in append mode if resuming
        const file = fs.createWriteStream(tempPath, { flags: resumeFromBytes > 0 ? 'a' : 'w' });
        
        response.pipe(file);
        
        response.on('data', (chunk) => {
          // Check if paused during download
          if (isDownloadPaused) {
            log('[Download] Pause requested, aborting download');
            request.destroy();
            file.close(() => {
              // Save progress before rejecting
              if (phaseForProgress) {
                saveDownloadProgress(phaseForProgress, downloadedBytes, totalBytes);
              }
              reject(new Error('PAUSED'));
            });
            return;
          }
          
          downloadedBytes += chunk.length;
          if (totalBytes > 0) {
            const progress = Math.floor((downloadedBytes / totalBytes) * 100);
            if (progress > lastProgressUpdate) {
              lastProgressUpdate = progress;
              if (onProgress) onProgress(progress, downloadedBytes, totalBytes);
            }
            // Save progress every 10 seconds for very large files
            if (phaseForProgress && Date.now() - lastProgressSave > 10000) {
              lastProgressSave = Date.now();
              saveDownloadProgress(phaseForProgress, downloadedBytes, totalBytes);
            }
          }
        });
        
        response.on('error', (err) => {
          log(`[Download] Response error: ${err.message}`);
          file.close();
          // Don't delete temp file on error - allow resume
          reject(err);
        });
        
        file.on('finish', () => {
          file.close(() => {
            // Verify file was written
            try {
              const stats = fs.statSync(tempPath);
              log(`[Download] File size: ${stats.size} bytes`);
              
              if (stats.size === 0) {
                fs.unlinkSync(tempPath);
                reject(new Error('Downloaded file is empty'));
                return;
              }
              
              // Move temp to final
              if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
              fs.renameSync(tempPath, destPath);
              log(`[Download] Complete: ${destPath}`);
              resolve(destPath);
            } catch (err) {
              reject(err);
            }
          });
        });
        
        file.on('error', (err) => {
          log(`[Download] File error: ${err.message}`);
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          reject(err);
        });
      });
      
      request.on('error', (err) => {
        log(`[Download] Request error: ${err.message}`);
        reject(err);
      });
      
      request.on('timeout', () => {
        log(`[Download] Request timeout`);
        request.destroy();
        reject(new Error('Download timed out'));
      });
      
      imageAiDownloadController = request;
    }
    
    doDownload(url);
  });
}

// Extract tar.gz file
async function extractTarGz(archivePath, destDir) {
  log(`[Extract] Extracting ${archivePath} to ${destDir}`);
  
  return new Promise((resolve, reject) => {
    // Use tar command on Unix, or built-in on Windows
    const isWindows = process.platform === 'win32';
    
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    if (isWindows) {
      // Use PowerShell to extract
      const cmd = `powershell -Command "tar -xzf '${archivePath}' -C '${destDir}'"`;
      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          log(`[Extract] Error: ${stderr}`);
          reject(err);
        } else {
          log(`[Extract] Complete`);
          resolve();
        }
      });
    } else {
      // Use tar command
      const cmd = `tar -xzf "${archivePath}" -C "${destDir}"`;
      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          log(`[Extract] Error: ${stderr}`);
          reject(err);
        } else {
          log(`[Extract] Complete`);
          resolve();
        }
      });
    }
  });
}

// Check if Visual C++ Redistributable is installed (required by PyTorch on Windows)
function isVcRedistInstalled() {
  if (process.platform !== 'win32') return true; // Only needed on Windows
  
  // Check for vcruntime140.dll in System32 - this is the main VC++ runtime DLL
  const system32Path = process.env.SYSTEMROOT ? path.join(process.env.SYSTEMROOT, 'System32') : 'C:\\Windows\\System32';
  const vcRuntimeDll = path.join(system32Path, 'vcruntime140.dll');
  const vcRuntime2Dll = path.join(system32Path, 'vcruntime140_1.dll');
  
  const installed = fs.existsSync(vcRuntimeDll) && fs.existsSync(vcRuntime2Dll);
  log(`[VCRedist] Check: vcruntime140.dll=${fs.existsSync(vcRuntimeDll)}, vcruntime140_1.dll=${fs.existsSync(vcRuntime2Dll)}`);
  return installed;
}

// Download and install Visual C++ Redistributable 2015-2022 (required by PyTorch/fbgemm.dll)
async function installVcRedist() {
  if (process.platform !== 'win32') {
    log('[VCRedist] Not Windows, skipping VC++ Redistributable installation');
    return true;
  }
  
  if (isVcRedistInstalled()) {
    log('[VCRedist] Visual C++ Redistributable is already installed');
    return true;
  }
  
  log('[VCRedist] Installing Visual C++ Redistributable 2015-2022...');
  
  if (mainWindow) {
    mainWindow.webContents.send('image-ai-deps-progress', 'Installing Visual C++ Redistributable (required for PyTorch)...');
  }
  
  // Download URL for VC++ Redistributable 2015-2022 (x64)
  const vcRedistUrl = 'https://aka.ms/vs/17/release/vc_redist.x64.exe';
  const vcRedistPath = path.join(IMAGE_AI_DIR, 'vc_redist.x64.exe');
  
  try {
    // Download the installer
    log('[VCRedist] Downloading from: ' + vcRedistUrl);
    
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(vcRedistPath);
      
      const makeRequest = (url) => {
        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, { 
          headers: { 'User-Agent': 'ComputeGrid-Worker' },
          timeout: 60000
        }, (response) => {
          // Handle redirects
          if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
            const redirectUrl = response.headers.location;
            log('[VCRedist] Redirecting to: ' + redirectUrl);
            makeRequest(redirectUrl);
            return;
          }
          
          if (response.statusCode !== 200) {
            reject(new Error(`Download failed with status: ${response.statusCode}`));
            return;
          }
          
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }).on('error', reject);
      };
      
      makeRequest(vcRedistUrl);
    });
    
    log('[VCRedist] Downloaded successfully');
    
    // Run the installer silently
    log('[VCRedist] Running silent install...');
    
    await new Promise((resolve, reject) => {
      // /install /quiet /norestart - silent installation
      const proc = spawn(vcRedistPath, ['/install', '/quiet', '/norestart'], {
        windowsHide: true
      });
      
      proc.on('close', (code) => {
        log(`[VCRedist] Installer exited with code: ${code}`);
        // Code 0 = success, code 1638 = already installed, code 3010 = success but needs reboot
        if (code === 0 || code === 1638 || code === 3010) {
          resolve();
        } else {
          reject(new Error(`VC++ Redistributable installation failed with code: ${code}`));
        }
      });
      
      proc.on('error', (err) => {
        log(`[VCRedist] Installer error: ${err.message}`);
        reject(err);
      });
    });
    
    // Clean up installer
    try {
      fs.unlinkSync(vcRedistPath);
    } catch (e) {
      log('[VCRedist] Could not delete installer: ' + e.message);
    }
    
    log('[VCRedist] Visual C++ Redistributable installed successfully');
    
    if (mainWindow) {
      mainWindow.webContents.send('image-ai-deps-progress', 'Visual C++ Redistributable installed');
    }
    
    return true;
  } catch (err) {
    log('[VCRedist] Installation failed: ' + err.message);
    
    // Clean up on failure
    try {
      if (fs.existsSync(vcRedistPath)) {
        fs.unlinkSync(vcRedistPath);
      }
    } catch (e) {}
    
    // Don't throw - let PyTorch installation try anyway (it might work if already partially installed)
    if (mainWindow) {
      mainWindow.webContents.send('image-ai-deps-progress', 'Warning: VC++ Redistributable installation may have failed');
    }
    
    return false;
  }
}

// Install Python dependencies using ONNX Runtime (simpler, no DLL issues)
async function installPythonDeps() {
  log('[Deps] Installing Python dependencies (ONNX Runtime)...');
  
  // Check if Python exists first
  if (!fs.existsSync(PYTHON_EXE)) {
    log(`[Deps] Python not found at ${PYTHON_EXE}`);
    throw new Error('Python not found');
  }
  
  log(`[Deps] Using Python at: ${PYTHON_EXE}`);
  
  // Helper function to run pip install
  const runPipInstall = (packages, extraArgs = []) => {
    return new Promise((resolve, reject) => {
      const args = ['-m', 'pip', 'install', '--no-cache-dir', ...extraArgs, ...packages];
      log(`[Deps] Running: python ${args.join(' ')}`);
      
      const proc = spawn(PYTHON_EXE, args, {
        env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' }
      });
      
      let output = '';
      
      proc.stdout.on('data', (data) => {
        output += data.toString();
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.includes('Collecting') || line.includes('Installing') || line.includes('Successfully') || line.includes('Downloading')) {
            log(`[Deps] ${line.trim()}`);
            if (mainWindow) {
              mainWindow.webContents.send('image-ai-deps-progress', line.trim());
            }
          }
        }
      });
      
      proc.stderr.on('data', (data) => {
        output += data.toString();
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.trim() && !line.includes('WARNING')) {
            log(`[Deps] ${line.trim()}`);
          }
        }
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          log(`[Deps] pip install failed with code ${code}`);
          log(`[Deps] Last output: ${output.slice(-2000)}`);
          reject(new Error(`pip install failed with code ${code}`));
        }
      });
      
      proc.on('error', (err) => {
        log(`[Deps] Process error: ${err.message}`);
        reject(err);
      });
    });
  };
  
  // Helper function to run pip uninstall
  const runPipUninstall = (packages) => {
    return new Promise((resolve, reject) => {
      const args = ['-m', 'pip', 'uninstall', '-y', ...packages];
      log(`[Deps] Running: python ${args.join(' ')}`);
      
      const proc = spawn(PYTHON_EXE, args, {
        env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' }
      });
      
      let output = '';
      
      proc.stdout.on('data', (data) => {
        output += data.toString();
        log(`[Deps] ${data.toString().trim()}`);
      });
      
      proc.stderr.on('data', (data) => {
        output += data.toString();
      });
      
      proc.on('close', (code) => {
        // Uninstall can "fail" if package wasn't installed - that's OK
        resolve(output);
      });
      
      proc.on('error', (err) => {
        log(`[Deps] Uninstall error: ${err.message}`);
        resolve(''); // Don't reject, just continue
      });
    });
  };
  
  // Step 1: Install PyTorch with CUDA support (requires special wheel index)
  log('[Deps] Step 1/3: Installing PyTorch with CUDA support...');
  if (mainWindow) {
    mainWindow.webContents.send('image-ai-deps-progress', 'Installing PyTorch with CUDA support...');
  }
  
  // PyTorch must be installed from the special wheel index to get CUDA support
  // Regular pip install torch only gets CPU version on Windows
  await runPipInstall(['torch'], ['--index-url', 'https://download.pytorch.org/whl/cu118']);
  
  // Step 2: Install other dependencies
  log('[Deps] Step 2/3: Installing diffusers and dependencies...');
  if (mainWindow) {
    mainWindow.webContents.send('image-ai-deps-progress', 'Installing diffusers and dependencies...');
  }
  
  // Install other packages (without torch since we installed it above)
  // IMPORTANT: numpy must be <2 for onnxruntime-gpu 1.16.3 compatibility
  const basePackages = [
    'numpy<2',  // Pin numpy to <2 for onnxruntime-gpu compatibility
    'diffusers',
    'transformers',
    'accelerate',
    'safetensors',
    'Pillow',
    'scipy'
  ];
  
  await runPipInstall(basePackages);
  
  // Step 3: Detect GPU type and install appropriate ONNX Runtime
  log('[Deps] Step 3/7: Detecting GPU type...');
  if (mainWindow) {
    mainWindow.webContents.send('image-ai-deps-progress', 'Detecting GPU type...');
  }
  
  // Detect if NVIDIA GPU is present (CUDA) or Intel/AMD (DirectML)
  let hasNvidiaGpu = false;
  try {
    const { execSync } = require('child_process');
    // Check for NVIDIA GPU using nvidia-smi or wmic
    if (process.platform === 'win32') {
      try {
        const wmic = execSync('wmic path win32_VideoController get name', { encoding: 'utf8' });
        hasNvidiaGpu = wmic.toLowerCase().includes('nvidia');
        log(`[Deps] GPU detection result: ${wmic.trim()}`);
      } catch (e) {
        log('[Deps] wmic check failed, trying nvidia-smi...');
        try {
          execSync('nvidia-smi', { encoding: 'utf8' });
          hasNvidiaGpu = true;
        } catch (e2) {
          hasNvidiaGpu = false;
        }
      }
    } else {
      // On Linux, check for nvidia-smi
      try {
        execSync('nvidia-smi', { encoding: 'utf8' });
        hasNvidiaGpu = true;
      } catch (e) {
        hasNvidiaGpu = false;
      }
    }
    log(`[Deps] NVIDIA GPU detected: ${hasNvidiaGpu}`);
  } catch (detectErr) {
    log(`[Deps] GPU detection error: ${detectErr.message}`);
    hasNvidiaGpu = false;
  }
  
  // Step 4: Remove any existing onnxruntime versions to prevent conflicts
  log('[Deps] Step 4/7: Removing existing ONNX Runtime versions...');
  if (mainWindow) {
    mainWindow.webContents.send('image-ai-deps-progress', 'Removing old ONNX Runtime versions...');
  }
  
  try {
    await runPipUninstall(['onnxruntime', 'onnxruntime-gpu', 'onnxruntime-directml']);
    log('[Deps] Removed existing ONNX Runtime versions');
  } catch (uninstallErr) {
    log('[Deps] No existing runtime to remove (this is OK)');
  }
  
  // Step 5: Install the appropriate ONNX Runtime for this GPU
  // IMPORTANT: On Windows, ALWAYS use DirectML - it works with ANY GPU (NVIDIA, AMD, Intel)
  // via Windows native APIs and doesn't require CUDA Toolkit installation
  log('[Deps] Step 5/7: Installing ONNX Runtime...');
  
  let onnxRuntimePackage = 'onnxruntime';  // CPU fallback
  if (process.platform === 'win32') {
    // Windows: Always use DirectML for ALL GPUs (NVIDIA, AMD, Intel)
    // DirectML uses Windows native GPU APIs - no CUDA Toolkit needed
    onnxRuntimePackage = 'onnxruntime-directml';
    log('[Deps] Installing onnxruntime-directml for Windows GPU acceleration...');
    if (mainWindow) {
      mainWindow.webContents.send('image-ai-deps-progress', 'Installing ONNX Runtime DirectML for GPU...');
    }
  } else if (hasNvidiaGpu) {
    // Linux with NVIDIA: Use CUDA (requires CUDA Toolkit)
    onnxRuntimePackage = 'onnxruntime-gpu==1.16.3';
    log('[Deps] Installing onnxruntime-gpu for Linux NVIDIA CUDA...');
    if (mainWindow) {
      mainWindow.webContents.send('image-ai-deps-progress', 'Installing ONNX Runtime for NVIDIA GPU...');
    }
  } else {
    log('[Deps] Installing onnxruntime CPU version...');
    if (mainWindow) {
      mainWindow.webContents.send('image-ai-deps-progress', 'Installing ONNX Runtime (CPU)...');
    }
  }
  
  try {
    await runPipInstall([onnxRuntimePackage]);
    log(`[Deps] ${onnxRuntimePackage} installed successfully`);
  } catch (runtimeErr) {
    log(`[Deps] Failed to install ${onnxRuntimePackage}: ${runtimeErr.message}`);
    // Fallback to CPU version
    log('[Deps] Falling back to CPU-only onnxruntime...');
    await runPipInstall(['onnxruntime']);
  }
  
  // Step 6: Install optimum with onnxruntime extra (this installs the submodule)
  // Note: This will temporarily install CPU onnxruntime, which we'll override in step 7
  log('[Deps] Step 6/8: Installing optimum[onnxruntime]...');
  if (mainWindow) {
    mainWindow.webContents.send('image-ai-deps-progress', 'Installing optimum (AI optimization library)...');
  }
  await runPipInstall(['optimum[onnxruntime]']);
  
  // Step 7: Reinstall GPU runtime to override the CPU version that optimum installed
  log(`[Deps] Step 7/8: Reinstalling ${onnxRuntimePackage} (override CPU version)...`);
  if (mainWindow) {
    mainWindow.webContents.send('image-ai-deps-progress', `Reinstalling ${onnxRuntimePackage}...`);
  }
  try {
    await runPipInstall([onnxRuntimePackage], ['--force-reinstall', '--no-deps']);
    log(`[Deps] Reinstalled ${onnxRuntimePackage} successfully`);
  } catch (reinstallErr) {
    log(`[Deps] Warning: Failed to reinstall ${onnxRuntimePackage}: ${reinstallErr.message}`);
  }
  
  // Step 8: Verify optimum.onnxruntime module works
  log('[Deps] Step 8/8: Verifying optimum.onnxruntime module...');
  if (mainWindow) {
    mainWindow.webContents.send('image-ai-deps-progress', 'Verifying optimum ONNX integration...');
  }
  
  const verifyOptimum = () => {
    return new Promise((resolve) => {
      const checkScript = `
import sys
try:
    from optimum.onnxruntime import ORTStableDiffusionPipeline
    import onnxruntime as ort
    providers = ort.get_available_providers()
    print(f"OK: providers={providers}")
except ImportError as e:
    print(f"MISSING: {e}")
`;
      const proc = spawn(PYTHON_EXE, ['-c', checkScript], { env: process.env });
      let output = '';
      proc.stdout.on('data', (data) => { output += data.toString(); });
      proc.stderr.on('data', (data) => { output += data.toString(); });
      proc.on('close', () => {
        log(`[Deps] optimum verification: ${output.trim()}`);
        resolve(output.includes('OK'));
      });
    });
  };
  
  const optimumOk = await verifyOptimum();
  if (!optimumOk) {
    log('[Deps] WARNING: optimum.onnxruntime module verification failed');
    log('[Deps] User may need to delete image-ai folder and re-download');
  } else {
    log('[Deps] optimum.onnxruntime module verified OK');
  }
  
  log('[Deps] All dependencies installed successfully');
}

// Verify ONNX Runtime GPU is available after installation
async function verifyCudaAvailable() {
  log('[ONNX] Verifying ONNX Runtime GPU availability...');
  
  return new Promise((resolve) => {
    const checkScript = `
import sys
import json
try:
    import onnxruntime as ort
    providers = ort.get_available_providers()
    cuda_available = 'CUDAExecutionProvider' in providers
    dml_available = 'DmlExecutionProvider' in providers
    
    result = {
        "onnx_version": ort.__version__,
        "cuda_available": cuda_available,
        "dml_available": dml_available,
        "providers": providers,
        "gpu_available": cuda_available or dml_available
    }
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({"error": str(e), "cuda_available": False, "gpu_available": False}))
`;
    
    const proc = spawn(PYTHON_EXE, ['-c', checkScript], {
      env: process.env
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        try {
          const result = JSON.parse(stdout.trim());
          log(`[ONNX] ONNX Runtime version: ${result.onnx_version}`);
          log(`[ONNX] CUDA provider available: ${result.cuda_available}`);
          log(`[ONNX] DML provider available: ${result.dml_available}`);
          log(`[ONNX] Available providers: ${result.providers?.join(', ')}`);
          resolve(result);
        } catch (e) {
          log(`[ONNX] Failed to parse result: ${e.message}`);
          log(`[ONNX] stdout: ${stdout}`);
          resolve({ cuda_available: false, gpu_available: false, error: 'Parse error' });
        }
      } else {
        log(`[ONNX] Check failed with code ${code}`);
        log(`[ONNX] stderr: ${stderr}`);
        resolve({ cuda_available: false, gpu_available: false, error: stderr || 'Check failed' });
      }
    });
    
    proc.on('error', (err) => {
      log(`[ONNX] Process error: ${err.message}`);
      resolve({ cuda_available: false, gpu_available: false, error: err.message });
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      proc.kill();
      resolve({ cuda_available: false, gpu_available: false, error: 'Timeout' });
    }, 30000);
  });
}

// Run benchmark image generation
async function runBenchmark() {
  log('[Benchmark] Starting benchmark (ONNX Runtime)...');
  
  if (mainWindow) {
    mainWindow.webContents.send('image-ai-benchmark-start');
  }
  
  // Pre-check that all required components exist
  log('[Benchmark] Pre-check: Verifying Image AI components...');
  
  // Use unified AI paths - supports both bundled and legacy installations
  const aiPaths = getAiPaths();
  const pythonPath = aiPaths.pythonExe;
  const modelDir = aiPaths.sdModelPath || SD_MODEL_DIR;
  
  log(`[Benchmark] Using ${aiPaths.useBundled ? 'bundled' : 'legacy'} AI installation`);
  log(`[Benchmark] Python path: ${pythonPath}`);
  log(`[Benchmark] Model path: ${modelDir}`);
  
  // Verify model path is a directory (not a file)
  if (fs.existsSync(modelDir) && !fs.statSync(modelDir).isDirectory()) {
    log(`[Benchmark] WARNING: Model path is a file, not a directory. Using parent directory.`);
    // This shouldn't happen with the fixed getBundlePaths, but handle it just in case
  }
  
  if (!fs.existsSync(pythonPath)) {
    const errMsg = `Python not found at: ${pythonPath}`;
    log(`[Benchmark] FAIL: ${errMsg}`);
    if (mainWindow) {
      mainWindow.webContents.send('image-ai-benchmark-error', errMsg);
    }
    return { success: false, error: errMsg };
  }
  log(`[Benchmark] Python found: ${pythonPath}`);
  
  // For ONNX, model directory may not exist yet - it will be downloaded on first use
  // Just ensure the parent directory exists
  if (!fs.existsSync(modelDir)) {
    log(`[Benchmark] ONNX model not found, will be downloaded during benchmark`);
    fs.mkdirSync(modelDir, { recursive: true });
  } else {
    log(`[Benchmark] ONNX model directory exists: ${modelDir}`);
  }
  
  const benchmarkPrompt = 'a simple red cube on a white background, minimal, clean';
  const benchmarkSeed = 42;
  const benchmarkWidth = 256;
  const benchmarkHeight = 256;
  
  const startTime = Date.now();
  
  try {
    log('[Benchmark] Starting image generation test...');
    const result = await generateImage({
      prompt: benchmarkPrompt,
      seed: benchmarkSeed,
      width: benchmarkWidth,
      height: benchmarkHeight,
      is_benchmark: true
    });
    
    const totalTime = Date.now() - startTime;
    
    if (result.success) {
      log(`[Benchmark] Success! Time: ${totalTime}ms`);
      
      // Save benchmark image for verification
      const benchmarkImagePath = path.join(IMAGE_AI_DIR, 'benchmark-result.png');
      const imageBuffer = Buffer.from(result.image_base64, 'base64');
      fs.writeFileSync(benchmarkImagePath, imageBuffer);
      log(`[Benchmark] Image saved to: ${benchmarkImagePath}`);
      
      await reportBenchmarkResult(totalTime);
      
      if (mainWindow) {
        mainWindow.webContents.send('image-ai-benchmark-complete', {
          time: totalTime,
          tier: config.imageQualityTier
        });
      }
      
      return { success: true, time: totalTime, tier: config.imageQualityTier };
    } else {
      // Show full error details - use fullError if available for complete info
      const fullErrorText = result.fullError || result.error || 'Unknown error during image generation';
      log(`[Benchmark] Generation failed: ${result.error}`);
      log(`[Benchmark] Full error output:\n${fullErrorText}`);
      
      // Create an error with both short and full error
      const err = new Error(result.error);
      err.fullError = fullErrorText;
      throw err;
    }
  } catch (err) {
    // Include fullError for complete debugging info
    const shortError = err.message || String(err);
    const fullErrorDetails = err.fullError || shortError;
    log(`[Benchmark] Failed: ${shortError}`);
    
    if (mainWindow) {
      // Send full error so renderer can display complete info in logs
      mainWindow.webContents.send('image-ai-benchmark-error', fullErrorDetails);
    }
    
    return { success: false, error: shortError, fullError: fullErrorDetails };
  }
}

// Embedded inference script - fallback when file not found in packaged app
function getEmbeddedInferenceScript() {
  return `#!/usr/bin/env python3
"""
Stable Diffusion ONNX inference script for ComputeGrid Worker
Uses ONNX Runtime instead of PyTorch for better Windows compatibility.
"""

import sys
import os
import warnings

# Suppress warnings BEFORE any other imports
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['TRANSFORMERS_VERBOSITY'] = 'error'

warnings.filterwarnings("ignore", message=".*CUDA is not available.*")
warnings.filterwarnings("ignore", message=".*torch_xla.*")
warnings.filterwarnings("ignore", message=".*autocast.*")
warnings.filterwarnings("ignore", message=".*Disabling autocast.*")
warnings.filterwarnings("ignore", category=UserWarning, module="diffusers")
warnings.filterwarnings("ignore", category=UserWarning, module="transformers")
warnings.filterwarnings("ignore", category=FutureWarning)

import json
import time
import base64
from io import BytesIO

def log(message):
    """Log to stderr for the Electron app to capture"""
    print(f"[SD-ONNX] {message}", file=sys.stderr, flush=True)

def log_gpu_info():
    """Log detailed GPU information for debugging"""
    try:
        import torch
        log(f"PyTorch version: {torch.__version__}")
        log(f"PyTorch CUDA available: {torch.cuda.is_available()}")
        if torch.cuda.is_available():
            log(f"PyTorch CUDA version: {torch.version.cuda}")
            log(f"GPU count: {torch.cuda.device_count()}")
            for i in range(torch.cuda.device_count()):
                props = torch.cuda.get_device_properties(i)
                log(f"GPU {i}: {props.name}, {props.total_memory / 1024**3:.1f} GB VRAM")
    except Exception as e:
        log(f"PyTorch GPU info error: {e}")
    
    try:
        import onnxruntime as ort
        log(f"ONNX Runtime version: {ort.__version__}")
        log(f"ONNX Runtime available providers: {ort.get_available_providers()}")
        
        if 'CUDAExecutionProvider' in ort.get_available_providers():
            try:
                sess_options = ort.SessionOptions()
                sess_options.log_severity_level = 3
                log("CUDA provider detected - will attempt GPU inference")
            except Exception as e:
                log(f"CUDA provider check error: {e}")
    except Exception as e:
        log(f"ONNX Runtime info error: {e}")

def verify_provider_in_use(pipe, expected_provider):
    """Verify which provider the pipeline is actually using"""
    try:
        if hasattr(pipe, 'unet') and hasattr(pipe.unet, 'session'):
            session = pipe.unet.session
            providers_in_use = session.get_providers()
            log(f"UNET session providers: {providers_in_use}")
            
            if expected_provider in providers_in_use:
                log(f"VERIFIED: {expected_provider} is active for UNET")
                return True
            else:
                log(f"WARNING: Expected {expected_provider} but got {providers_in_use}")
                return False
        else:
            log("Could not access pipeline session to verify provider")
            return None
    except Exception as e:
        log(f"Provider verification error: {e}")
        return None

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No input provided", "success": False}))
        return 1
    
    try:
        input_data = json.loads(sys.argv[1])
        
        prompt = input_data.get("prompt", "a beautiful landscape")
        seed = input_data.get("seed", 42)
        width = input_data.get("width", 512)
        height = input_data.get("height", 512)
        model_dir = input_data.get("model_dir", "")
        model_id = input_data.get("model_id", "runwayml/stable-diffusion-v1-5")
        output_path = input_data.get("output_path", "")
        is_benchmark = input_data.get("is_benchmark", False)
        
        log("=" * 60)
        log("BENCHMARK START" if is_benchmark else "IMAGE GENERATION START")
        log("=" * 60)
        log(f"Image size: {width}x{height}, seed={seed}")
        log(f"Prompt: {prompt[:50]}...")
        log(f"Model dir: {model_dir}")
        log(f"Is benchmark: {is_benchmark}")
        
        start_time = time.time()
        
        log("-" * 40)
        log("STEP 1: System Information")
        log("-" * 40)
        log_gpu_info()
        
        log("-" * 40)
        log("STEP 2: Loading ONNX Runtime")
        log("-" * 40)
        import numpy as np
        import onnxruntime as ort
        
        providers = ort.get_available_providers()
        log(f"Available execution providers: {providers}")
        
        use_cuda = 'CUDAExecutionProvider' in providers
        use_dml = 'DmlExecutionProvider' in providers
        
        log(f"CUDA provider available: {use_cuda}")
        log(f"DirectML provider available: {use_dml}")
        
        if use_cuda:
            provider = 'CUDAExecutionProvider'
            log("SELECTED: CUDAExecutionProvider (NVIDIA GPU)")
        elif use_dml:
            provider = 'DmlExecutionProvider'
            log("SELECTED: DmlExecutionProvider (Windows GPU)")
        else:
            provider = 'CPUExecutionProvider'
            log("SELECTED: CPUExecutionProvider (CPU ONLY - SLOW!)")
        
        log("-" * 40)
        log("STEP 3: Loading Stable Diffusion Pipeline")
        log("-" * 40)
        
        pipeline_load_start = time.time()
        from optimum.onnxruntime import ORTStableDiffusionPipeline
        
        if model_dir and os.path.exists(os.path.join(model_dir, "model_index.json")):
            log(f"Loading from local ONNX model: {model_dir}")
            pipe = ORTStableDiffusionPipeline.from_pretrained(
                model_dir,
                provider=provider
            )
            log("Local model loaded successfully")
        else:
            # Use pre-exported ONNX model - NO local conversion needed
            log(f"Downloading pre-exported ONNX model (one-time setup)...")
            log(f"This will download ~2.5GB of pre-converted ONNX files...")
            
            onnx_model_id = "runwayml/stable-diffusion-v1-5"
            
            try:
                pipe = ORTStableDiffusionPipeline.from_pretrained(
                    onnx_model_id,
                    revision="onnx",
                    provider=provider
                )
                log(f"Loaded pre-exported ONNX model from {onnx_model_id}")
            except Exception as onnx_err:
                log(f"Failed to load ONNX revision: {onnx_err}")
                log("Trying alternative: download and export (requires more memory)...")
                pipe = ORTStableDiffusionPipeline.from_pretrained(
                    onnx_model_id,
                    export=True,
                    provider=provider
                )
            
            if model_dir:
                log(f"Saving ONNX model to: {model_dir}")
                os.makedirs(model_dir, exist_ok=True)
                pipe.save_pretrained(model_dir)
                log(f"ONNX model saved - future loads will be faster")
        
        pipeline_load_time = time.time() - pipeline_load_start
        log(f"Pipeline loaded in {pipeline_load_time:.2f}s")
        
        log("-" * 40)
        log("STEP 4: Verifying GPU Provider")
        log("-" * 40)
        provider_verified = verify_provider_in_use(pipe, provider)
        if provider_verified is False:
            log("WARNING: GPU provider not active! May be using CPU fallback.")
        
        log("-" * 40)
        log("STEP 5: Generating Image")
        log("-" * 40)
        
        np.random.seed(seed)
        
        num_steps = 20 if is_benchmark else 25
        log(f"Inference steps: {num_steps}")
        log(f"Guidance scale: 7.5")
        
        gen_start = time.time()
        log("Starting inference...")
        
        result = pipe(
            prompt,
            width=width,
            height=height,
            num_inference_steps=num_steps,
            guidance_scale=7.5,
        )
        
        image = result.images[0]
        gen_time = time.time() - gen_start
        total_time = time.time() - start_time
        
        log("-" * 40)
        log("STEP 6: Results")
        log("-" * 40)
        log(f"Generation time: {gen_time:.2f}s")
        log(f"Pipeline load time: {pipeline_load_time:.2f}s")
        log(f"Total time: {total_time:.2f}s")
        log(f"Time per step: {gen_time / num_steps:.3f}s")
        log(f"Provider used: {provider}")
        
        if gen_time < 8:
            log("PERFORMANCE: EXCELLENT (GPU working correctly)")
        elif gen_time < 15:
            log("PERFORMANCE: GOOD (GPU acceleration active)")
        elif gen_time < 25:
            log("PERFORMANCE: SLOW (May be using CPU or suboptimal settings)")
        else:
            log("PERFORMANCE: VERY SLOW (Likely using CPU instead of GPU)")
        
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        image_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
        
        if output_path:
            image.save(output_path, format="PNG")
            log(f"Image saved to: {output_path}")
        
        log("=" * 60)
        log("BENCHMARK COMPLETE" if is_benchmark else "GENERATION COMPLETE")
        log("=" * 60)
        
        result = {
            "success": True,
            "image_base64": image_base64,
            "width": width,
            "height": height,
            "seed": seed,
            "model_load_time_ms": int(pipeline_load_time * 1000),
            "generation_time_ms": int(gen_time * 1000),
            "total_time_ms": int(total_time * 1000),
            "provider": provider,
            "provider_verified": provider_verified
        }
        
        print(json.dumps(result))
        return 0
        
    except ImportError as e:
        log(f"Import error: {e}")
        print(json.dumps({
            "success": False,
            "error": f"Missing dependency: {e}. Try reinstalling Image AI.",
            "error_type": "import_error"
        }))
        return 1
        
    except Exception as e:
        error_str = str(e)
        error_type = "general"
        error_msg = error_str
        
        if "out of memory" in error_str.lower() or "OutOfMemoryError" in type(e).__name__:
            error_type = "oom"
            error_msg = "GPU out of memory - try smaller image size"
        
        log(f"Error ({error_type}): {error_str}")
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({
            "success": False,
            "error": error_msg,
            "error_type": error_type
        }))
        return 1

if __name__ == "__main__":
    sys.exit(main())
`;
}

// Generate image using ONNX Runtime
async function generateImage(params) {
  const { prompt, seed, width, height, is_benchmark, tileX, tileY, totalTilesX, totalTilesY, tileOverlap } = params;
  
  log(`[Generate] Starting ONNX inference: ${width}x${height}, seed=${seed}`);
  log(`[Generate] Prompt: ${prompt.substring(0, 50)}...`);
  
  return new Promise((resolve, reject) => {
    // Get the inference script path - check multiple locations
    // IMPORTANT: Python cannot read files inside app.asar, so we MUST use unpacked paths
    // or copy the script to a location Python can access
    
    log(`[Generate] Searching for inference script...`);
    log(`[Generate] app.isPackaged: ${app.isPackaged}`);
    log(`[Generate] __dirname: ${__dirname}`);
    if (app.isPackaged) {
      log(`[Generate] resourcesPath: ${process.resourcesPath}`);
    }
    
    let scriptPath = null;
    
    if (app.isPackaged) {
      // In packaged builds, ONLY use unpacked paths (Python can't access asar)
      const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'sd_inference.py');
      log(`[Generate] Checking unpacked path: ${unpackedPath}`);
      
      if (fs.existsSync(unpackedPath)) {
        scriptPath = unpackedPath;
        log(`[Generate] Found script at unpacked location`);
      } else {
        // Script not unpacked - copy it to a location Python can access
        log(`[Generate] Script not at unpacked location, will copy from asar`);
        
        // Try to read from asar (Electron can read asar)
        const asarPath = path.join(__dirname, 'sd_inference.py');
        log(`[Generate] Checking asar path: ${asarPath}`);
        
        if (fs.existsSync(asarPath)) {
          // Copy script to image-ai directory where Python can access it
          const copyPath = path.join(IMAGE_AI_DIR, 'sd_inference.py');
          try {
            const scriptContent = fs.readFileSync(asarPath, 'utf8');
            fs.writeFileSync(copyPath, scriptContent, 'utf8');
            scriptPath = copyPath;
            log(`[Generate] Copied script to: ${copyPath}`);
          } catch (copyErr) {
            log(`[Generate] Failed to copy script: ${copyErr.message}`);
          }
        }
      }
    } else {
      // Development mode - script is directly accessible
      const possiblePaths = [
        path.join(__dirname, 'sd_inference.py'),
        path.join(process.cwd(), 'src', 'sd_inference.py')
      ];
      
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          scriptPath = p;
          log(`[Generate] Found script in dev mode: ${p}`);
          break;
        }
      }
    }
    
    if (!scriptPath) {
      // Final fallback: write embedded script to image-ai directory
      log(`[Generate] Script not found in any location, using embedded fallback`);
      const embeddedScriptPath = path.join(IMAGE_AI_DIR, 'sd_inference.py');
      try {
        fs.mkdirSync(IMAGE_AI_DIR, { recursive: true });
        fs.writeFileSync(embeddedScriptPath, getEmbeddedInferenceScript(), 'utf8');
        scriptPath = embeddedScriptPath;
        log(`[Generate] Wrote embedded script to: ${embeddedScriptPath}`);
      } catch (embedErr) {
        log(`[Generate] Failed to write embedded script: ${embedErr.message}`);
        resolve({ success: false, error: `Could not create inference script: ${embedErr.message}` });
        return;
      }
    }
    
    log(`[Generate] Using script: ${scriptPath}`);
    
    if (!fs.existsSync(PYTHON_EXE)) {
      log(`[Generate] Python not found: ${PYTHON_EXE}`);
      resolve({ success: false, error: 'Python not installed' });
      return;
    }
    
    const inputData = JSON.stringify({
      prompt,
      seed: seed || 42,
      width: width || 512,
      height: height || 512,
      model_dir: SD_MODEL_DIR,
      model_id: SD_ONNX_MODEL_ID,
      is_benchmark: is_benchmark || false,
      tile_x: tileX,
      tile_y: tileY,
      total_tiles_x: totalTilesX,
      total_tiles_y: totalTilesY,
      tile_overlap: tileOverlap
    });
    
    log(`[Generate] Running: ${PYTHON_EXE} ${scriptPath}`);
    
    const proc = spawn(PYTHON_EXE, [scriptPath, inputData], {
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1'
      },
      timeout: 5 * 60 * 1000 // 5 minute timeout
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      const msg = data.toString();
      stderr += msg;
      // Log SD output for debugging
      const lines = msg.split('\n').filter(l => l.trim());
      for (const line of lines) {
        log(`[SD] ${line}`);
        // Send benchmark logs to renderer for display
        if ((is_benchmark || params.is_benchmark) && mainWindow) {
          mainWindow.webContents.send('benchmark-log', line);
        }
      }
    });
    
    proc.on('close', (code) => {
      log(`[Generate] Process exited with code ${code}`);
      
      if (code === 0 && stdout.trim()) {
        try {
          const result = JSON.parse(stdout.trim().split('\n').pop());
          resolve(result);
        } catch (parseErr) {
          log(`[Generate] Failed to parse output: ${stdout.slice(-500)}`);
          resolve({ success: false, error: 'Failed to parse generation result' });
        }
      } else {
        // Show last 2000 chars of stderr for better debugging
        const errorOutput = stderr.slice(-2000);
        log(`[Generate] Error output: ${errorOutput}`);
        
        // Try to extract a useful error message from stderr
        let errorMessage = `Process exited with code ${code}`;
        if (stderr) {
          // Look for Python traceback or error messages
          const lines = stderr.split('\n').filter(l => l.trim());
          const errorLines = lines.filter(l => 
            l.includes('Error') || 
            l.includes('error') || 
            l.includes('Exception') || 
            l.includes('ModuleNotFoundError') ||
            l.includes('ImportError') ||
            l.includes('RuntimeError') ||
            l.includes('CUDA') ||
            l.includes('out of memory') ||
            l.includes('No module named')
          );
          if (errorLines.length > 0) {
            // Get the most relevant error lines - include more context
            const relevantErrors = errorLines.slice(-8).join(' | ');
            // Clean up the error message for display - keep more content
            errorMessage = relevantErrors
              .replace(/File ".*?", line \d+, in \w+/g, '')
              .replace(/\s+/g, ' ')
              .trim()
              .substring(0, 1000);  // Increased from 300 to 1000
          } else if (lines.length > 0) {
            // Use last few lines as the error - keep more
            errorMessage = lines.slice(-6).join(' | ').substring(0, 1000);
          }
        }
        // Include full stderr in fullError for debugging (up to 5000 chars)
        resolve({ success: false, error: errorMessage, fullError: stderr.slice(-5000) });
      }
    });
    
    proc.on('error', (err) => {
      log(`[Generate] Process spawn error: ${err.message}`);
      resolve({ success: false, error: `Failed to start Python: ${err.message}` });
    });
  });
}

ipcMain.handle('generate-image', async (event, params) => {
  return await generateImage(params);
});

ipcMain.handle('download-image-ai', async () => {
  log('[ImageAI] Starting full Image AI setup...');
  
  try {
    // Create directory
    if (!fs.existsSync(IMAGE_AI_DIR)) {
      fs.mkdirSync(IMAGE_AI_DIR, { recursive: true });
    }
    
    // Check if already downloading
    if (imageAiDownloadController) {
      log('[ImageAI] Download already in progress');
      return { success: false, error: 'Download already in progress' };
    }
    
    const phases = [];
    
    // Phase 1: Download Python if needed
    if (!isPythonReady()) {
      phases.push('python');
    }
    
    // Phase 2: Install deps if Python ready but deps missing
    const depsMarker = path.join(PYTHON_DIR, '.deps-installed');
    if (!fs.existsSync(depsMarker)) {
      phases.push('deps');
    }
    
    // Phase 3: Verify CUDA is working (always run after deps to confirm installation worked)
    phases.push('cuda_check');
    
    // Phase 4: Download model if needed
    if (!isModelReady()) {
      phases.push('model');
    }
    
    // Phase 5: Always run benchmark after setup
    phases.push('benchmark');
    
    log(`[ImageAI] Phases to run: ${phases.join(', ')}`);
    
    // Execute phases
    for (const phase of phases) {
      currentDownloadPhase = phase;
      
      if (mainWindow) {
        mainWindow.webContents.send('image-ai-phase', phase);
      }
      
      if (phase === 'python') {
        log('[ImageAI] Phase: Downloading Python runtime...');
        const pythonUrl = PYTHON_URLS[process.platform];
        if (!pythonUrl) {
          throw new Error(`Unsupported platform: ${process.platform}`);
        }
        
        // Send initial progress event before download starts
        if (mainWindow) {
          mainWindow.webContents.send('image-ai-progress', { phase: 'python', progress: 0 });
        }
        
        const archivePath = path.join(IMAGE_AI_DIR, 'python.tar.gz');
        
        await downloadFile(pythonUrl, archivePath, (progress, downloaded, total) => {
          if (mainWindow) {
            mainWindow.webContents.send('image-ai-progress', { 
              phase: 'python', 
              progress,
              downloaded,
              total
            });
          }
        }, 'python');
        
        log('[ImageAI] Extracting Python...');
        await extractTarGz(archivePath, PYTHON_DIR);
        
        // Clean up archive
        fs.unlinkSync(archivePath);
        
        // Debug: Log directory structure after extraction
        log(`[ImageAI] Python extracted. Checking structure...`);
        log(`[ImageAI] PYTHON_DIR: ${PYTHON_DIR}`);
        log(`[ImageAI] Expected PYTHON_EXE: ${PYTHON_EXE}`);
        
        // List what's in PYTHON_DIR
        if (fs.existsSync(PYTHON_DIR)) {
          const entries = fs.readdirSync(PYTHON_DIR);
          log(`[ImageAI] Contents of PYTHON_DIR: ${entries.join(', ')}`);
          
          // Check for python subfolder
          const pythonSubdir = path.join(PYTHON_DIR, 'python');
          if (fs.existsSync(pythonSubdir)) {
            const subEntries = fs.readdirSync(pythonSubdir);
            log(`[ImageAI] Contents of python/: ${subEntries.join(', ')}`);
            
            // Check for bin folder
            const binDir = path.join(pythonSubdir, 'bin');
            if (fs.existsSync(binDir)) {
              const binEntries = fs.readdirSync(binDir);
              log(`[ImageAI] Contents of python/bin/: ${binEntries.slice(0, 10).join(', ')}${binEntries.length > 10 ? '...' : ''}`);
            } else {
              log(`[ImageAI] No bin/ folder at ${binDir}`);
            }
          } else {
            log(`[ImageAI] No python/ subfolder at ${pythonSubdir}`);
            // Maybe it extracted directly without subfolder?
            const binDirect = path.join(PYTHON_DIR, 'bin');
            if (fs.existsSync(binDirect)) {
              const binEntries = fs.readdirSync(binDirect);
              log(`[ImageAI] Found bin/ directly in PYTHON_DIR: ${binEntries.slice(0, 10).join(', ')}`);
            }
          }
        }
        
        // Check if Python was actually installed
        if (fs.existsSync(PYTHON_EXE)) {
          log(`[ImageAI] Python installed successfully at ${PYTHON_EXE}`);
        } else {
          log(`[ImageAI] WARNING: Python not found at expected path ${PYTHON_EXE}`);
        }
      }
      
      if (phase === 'deps') {
        log('[ImageAI] Phase: Installing Python dependencies...');
        if (mainWindow) {
          mainWindow.webContents.send('image-ai-progress', { phase: 'deps', progress: 0 });
        }
        
        await installPythonDeps();
        
        // Mark deps as installed
        fs.writeFileSync(path.join(PYTHON_DIR, '.deps-installed'), new Date().toISOString());
        log('[ImageAI] Dependencies installed');
      }
      
      if (phase === 'cuda_check') {
        log('[ImageAI] Phase: Verifying CUDA installation...');
        if (mainWindow) {
          mainWindow.webContents.send('image-ai-progress', { phase: 'cuda_check', progress: 0 });
          mainWindow.webContents.send('image-ai-deps-progress', 'Verifying CUDA/GPU availability...');
        }
        
        const cudaResult = await verifyCudaAvailable();
        
        if (mainWindow) {
          mainWindow.webContents.send('image-ai-progress', { phase: 'cuda_check', progress: 100 });
        }
        
        if (cudaResult.cuda_available) {
          log(`[ImageAI] CUDA is available: ${cudaResult.device_name} (${cudaResult.device_memory_gb}GB)`);
          if (mainWindow) {
            mainWindow.webContents.send('image-ai-deps-progress', `GPU detected: ${cudaResult.device_name}`);
          }
          // Store GPU info in config
          config.gpuName = cudaResult.device_name;
          config.gpuVramGb = cudaResult.device_memory_gb;
          config.cudaVersion = cudaResult.cuda_version;
          saveConfig();
        } else {
          log(`[ImageAI] WARNING: CUDA is NOT available. Error: ${cudaResult.error || 'Unknown'}`);
          log('[ImageAI] Image generation will fall back to CPU (very slow) or may not work');
          if (mainWindow) {
            mainWindow.webContents.send('image-ai-deps-progress', 'Warning: CUDA not available, GPU acceleration disabled');
          }
        }
      }
      
      if (phase === 'model') {
        // For ONNX, the model is downloaded automatically by optimum/diffusers on first use
        // We just need to ensure the directory exists
        log('[ImageAI] Phase: Preparing ONNX model directory...');
        
        if (mainWindow) {
          mainWindow.webContents.send('image-ai-progress', { phase: 'model', progress: 0 });
          mainWindow.webContents.send('image-ai-deps-progress', 'ONNX model will be downloaded on first use...');
        }
        
        // Create model directory if it doesn't exist
        if (!fs.existsSync(SD_MODEL_DIR)) {
          fs.mkdirSync(SD_MODEL_DIR, { recursive: true });
        }
        
        if (mainWindow) {
          mainWindow.webContents.send('image-ai-progress', { phase: 'model', progress: 100 });
        }
        
        log('[ImageAI] ONNX model directory prepared - will download on first generation');
      }
      
      if (phase === 'benchmark') {
        log('[ImageAI] Phase: Running benchmark...');
        const benchResult = await runBenchmark();
        
        if (!benchResult.success) {
          // Benchmark failed but don't block setup - allow image generation anyway
          log(`[ImageAI] Benchmark failed (${benchResult.error}) - proceeding with default tier`);
          
          // Set a conservative default quality tier based on GPU VRAM
          const vramGb = config.gpuVramGb || 0;
          if (vramGb >= 8) {
            config.imageQualityTier = 'medium'; // Allow up to 512px
          } else if (vramGb >= 6) {
            config.imageQualityTier = 'slow'; // 256px only (server expects 'slow' not 'low')
          } else {
            config.imageQualityTier = 'banned'; // Not enough VRAM
          }
          config.imageBenchmarkTimeMs = null; // No benchmark time available
          saveConfig();
          
          log(`[ImageAI] Using fallback tier: ${config.imageQualityTier} (based on ${vramGb}GB VRAM)`);
          
          // Report fallback tier to server so worker can claim image tasks (blocked in Maximum Privacy Mode)
          if (config.apiKey && !config.maxPrivacyMode) {
            try {
              const response = await fetch(`${SERVER_URL}/api/worker/report-benchmark`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${config.apiKey}`
                },
                body: JSON.stringify({
                  deviceId: deviceId,
                  benchmarkTimeMs: 0, // No benchmark time for fallback
                  qualityTier: config.imageQualityTier
                })
              });
              if (response.ok) {
                log('[ImageAI] Fallback tier reported to server successfully');
              } else {
                log('[ImageAI] Failed to report fallback tier to server: ' + response.status);
              }
            } catch (err) {
              log('[ImageAI] Error reporting fallback tier to server: ' + err.message);
            }
          }
          
          // Notify UI about the fallback
          if (mainWindow) {
            mainWindow.webContents.send('image-ai-benchmark-fallback', {
              tier: config.imageQualityTier,
              reason: benchResult.error
            });
          }
        }
      }
    }
    
    // Mark as installed and enabled
    config.imageAiInstalled = true;
    config.imageAiEnabled = true; // Enable for benchmark checking
    saveConfig();
    sendStatusToRenderer();
    log('[ImageAI] Marked as installed and enabled');
    
    currentDownloadPhase = 'idle';
    imageAiDownloadController = null;
    
    log('[ImageAI] Setup complete!');
    return { success: true };
    
  } catch (err) {
    // Handle pause specially - don't treat as error
    if (err.message === 'PAUSED') {
      log('[ImageAI] Download paused by user');
      currentDownloadPhase = 'paused';
      imageAiDownloadController = null;
      
      if (mainWindow) {
        mainWindow.webContents.send('image-ai-phase', 'paused');
      }
      
      return { success: false, paused: true };
    }
    
    log(`[ImageAI] Setup failed: ${err.message}`);
    currentDownloadPhase = 'idle';
    imageAiDownloadController = null;
    
    if (mainWindow) {
      mainWindow.webContents.send('image-ai-error', err.message);
    }
    
    return { success: false, error: err.message };
  }
});

// Pause the current download
ipcMain.handle('pause-image-ai-download', async () => {
  log('[ImageAI] Pause requested');
  isDownloadPaused = true;
  
  // The download will be stopped in the next data chunk
  // Progress is saved automatically
  
  return { success: true };
});

// Resume a paused download - just clears the flag, caller should then call download-image-ai
ipcMain.handle('resume-image-ai-download', async () => {
  log('[ImageAI] Resume requested - clearing paused flag');
  isDownloadPaused = false;
  currentDownloadPhase = 'idle';
  return { success: true };
});

ipcMain.handle('cancel-image-ai-download', async () => {
  if (imageAiDownloadController) {
    imageAiDownloadController.destroy();
    imageAiDownloadController = null;
    log('Image AI download cancelled');
    isDownloadPaused = false;
    clearDownloadProgress();
    return true;
  }
  return false;
});

ipcMain.handle('uninstall-image-ai', async () => {
  log('Uninstalling Image AI...');
  try {
    // Delete the entire image-ai directory (Python, model, everything)
    if (fs.existsSync(IMAGE_AI_DIR)) {
      fs.rmSync(IMAGE_AI_DIR, { recursive: true, force: true });
      log('Deleted Image AI directory');
    }
    
    // Reset all image AI config
    config.imageAiInstalled = false;
    config.imageBenchmarkTimeMs = null;
    config.imageQualityTier = null;
    saveConfig();
    sendStatusToRenderer();
    log('Image AI uninstalled');
    return true;
  } catch (err) {
    log(`Image AI uninstall failed: ${err.message}`);
    return false;
  }
});

// Delete all image AI files (for cleanup of failed/partial installs)
ipcMain.handle('delete-image-ai-files', async () => {
  log('Deleting all Image AI files...');
  try {
    // Cancel any active download first
    if (imageAiDownloadController) {
      try {
        imageAiDownloadController.destroy();
      } catch (e) {
        log(`[ImageAI] Error destroying download controller: ${e.message}`);
      }
      imageAiDownloadController = null;
    }
    
    // Reset download state flags - THIS IS CRITICAL for allowing restart
    isDownloadPaused = false;
    currentDownloadPhase = 'idle';
    
    // Clear download progress file (may be outside IMAGE_AI_DIR in some cases)
    clearDownloadProgress();
    
    // Delete the entire image-ai directory
    if (fs.existsSync(IMAGE_AI_DIR)) {
      fs.rmSync(IMAGE_AI_DIR, { recursive: true, force: true });
      log('Deleted Image AI directory');
    }
    
    // Reset config flags
    config.imageAiInstalled = false;
    config.imageAiEnabled = false;
    config.imageBenchmarkTimeMs = null;
    config.imageQualityTier = null;
    saveConfig();
    sendStatusToRenderer();
    
    // Send state reset event to renderer to clear UI
    if (mainWindow) {
      mainWindow.webContents.send('image-ai-phase', 'idle');
      mainWindow.webContents.send('image-ai-download-reset');
    }
    
    log('Image AI files deleted, download state reset');
    return { success: true };
  } catch (err) {
    log(`Delete Image AI files failed: ${err.message}`);
    return { success: false, error: err.message };
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
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { status: 'checking' });
    }
  });
  
  autoUpdater.on('update-available', (info) => {
    log('Update available: ' + info.version);
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { 
        status: 'downloading', 
        version: info.version,
        progress: 0
      });
    }
  });
  
  // Track download progress
  autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.round(progressObj.percent);
    log(`Download progress: ${percent}% (${Math.round(progressObj.transferred / 1024 / 1024)}MB / ${Math.round(progressObj.total / 1024 / 1024)}MB)`);
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { 
        status: 'downloading', 
        progress: percent,
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total
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
    const errorMessage = err.message || err.toString();
    logError('Auto-updater error: ' + errorMessage, err);
    log('Update error details: ' + JSON.stringify({
      message: errorMessage,
      stack: err.stack,
      code: err.code
    }));
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { 
        status: 'error',
        error: errorMessage
      });
    }
  });
  
  // Check for updates on startup (after a delay)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      log('Initial update check failed: ' + err.message);
      if (mainWindow) {
        mainWindow.webContents.send('update-status', { 
          status: 'error',
          error: 'Failed to check for updates: ' + err.message
        });
      }
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
  
  // Initialize device ID for per-device tracking
  deviceId = getOrCreateDeviceId();
  log('Device ID: ' + deviceId);
  
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
  
  // Check if Image AI needs benchmark (after window is ready for notifications)
  setTimeout(async () => {
    try {
      await checkAndRunBenchmarkIfNeeded();
    } catch (err) {
      log('[ImageAI] Auto-benchmark check failed: ' + err.message);
    }
  }, 3000); // Give window time to fully load
  
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
