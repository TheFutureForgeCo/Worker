const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, Notification, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, exec, execSync } = require('child_process');
const https = require('https');
const http = require('http');
const os = require('os');
const { autoUpdater } = require('electron-updater');

// Single instance lock - prevent multiple windows
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running - exit immediately
  app.exit(0);
}

// App version and integrity
const APP_VERSION = require('../package.json').version;
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

// Generate app signature for integrity verification
function generateAppSignature() {
  const workerPath = path.join(__dirname, 'worker.js');
  const mainPath = path.join(__dirname, 'main.js');
  
  try {
    const workerContent = fs.readFileSync(workerPath, 'utf8');
    const mainContent = fs.readFileSync(mainPath, 'utf8');
    const combined = workerContent + mainContent + APP_VERSION;
    return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 16);
  } catch (err) {
    logError('Failed to generate signature', err);
    return 'unknown';
  }
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
  earnings: '0.00',
  status: 'stopped',
  ollamaStatus: 'checking...',
  ollamaModels: []
};
let ollamaDownloadProgress = 0;
let setupPhase = null; // null, 'downloading-ollama', 'downloading-model', 'starting-service'
let setupProgress = 0;
let lastError = null;
let isOnline = false;

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

// Load configuration
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      config = { ...config, ...JSON.parse(data) };
      log('Config loaded successfully');
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
      label: `Tokens: ${stats.earnings}`,
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
  tray.setToolTip(`ComputeGrid Worker - ${isOnline ? 'Online' : 'Offline'} | ${stats.earnings} tokens`);
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
      lastError
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
  if (!config.apiKey) {
    logError('API key required to go online');
    return false;
  }
  
  const newStatus = !isOnline;
  log(`Toggling online status to: ${newStatus}`);
  
  try {
    // Update server
    const result = await makeRequest(`${SERVER_URL}/api/worker/set-online`, {
      method: 'POST',
      body: { isOnline: newStatus }
    });
    
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
      return false;
    }
  } catch (err) {
    logError('Failed to toggle online status', err);
    return false;
  }
}

// Make HTTP request helper
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
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
      }
    };

    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
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
  if (isWorkerRunning) {
    log('Worker already running');
    return;
  }
  
  lastError = null;
  
  if (!config.apiKey) {
    logError('API key required');
    stats.status = 'API key required';
    sendStatusToRenderer();
    return;
  }

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

    // Start the worker process with integrity info
    log('Starting worker process...');
    stats.status = 'Connecting...';
    sendStatusToRenderer();
    
    const workerScript = path.join(__dirname, 'worker.js');
    const appSignature = generateAppSignature();
    
    workerProcess = spawn(process.execPath, [workerScript], {
      env: {
        ...process.env,
        CG_API_KEY: config.apiKey,
        CG_SERVER_URL: SERVER_URL,
        CG_APP_VERSION: APP_VERSION,
        CG_APP_SIGNATURE: appSignature
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });
    
    log(`Worker process started (PID: ${workerProcess.pid})`);
    isWorkerRunning = true;

    workerProcess.stdout.on('data', (data) => {
      const message = data.toString();
      log('[Worker] ' + message.trim());
      parseWorkerOutput(message);
    });

    workerProcess.stderr.on('data', (data) => {
      const message = data.toString().trim();
      logError('[Worker Error] ' + message);
    });

    workerProcess.on('message', (message) => {
      if (message.type === 'stats') {
        stats = { ...stats, ...message.data };
        sendStatusToRenderer();
        updateTrayMenu();
      } else if (message.type === 'error') {
        logError('Worker error: ' + message.error);
      }
    });

    workerProcess.on('close', (code) => {
      log(`Worker process exited with code ${code}`);
      isWorkerRunning = false;
      isOnline = false;
      stats.status = code === 0 ? 'Stopped' : 'Crashed';
      if (code !== 0 && code !== null) {
        logError(`Worker crashed with exit code ${code}`);
      }
      sendStatusToRenderer();
      updateTrayMenu();
    });

    workerProcess.on('error', (err) => {
      logError('Worker process error', err);
      isWorkerRunning = false;
      isOnline = false;
      stats.status = 'Error';
      sendStatusToRenderer();
      updateTrayMenu();
    });

    stats.status = 'Running';
    isOnline = true;
    
    // Update server with online status
    try {
      await makeRequest(`${SERVER_URL}/api/worker/set-online`, {
        method: 'POST',
        body: { isOnline: true }
      });
    } catch (err) {
      log('Could not update online status: ' + err.message);
    }
    
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
  if (message.includes('Earned:')) {
    const match = message.match(/Earned:\s*\$?([\d.]+)/);
    if (match) {
      stats.earnings = (parseFloat(stats.earnings) + parseFloat(match[1])).toFixed(2);
    }
  }
  sendStatusToRenderer();
  updateTrayMenu();
}

// Stop the worker
async function stopWorker() {
  log('Stopping worker...');
  
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
      earnings: '0.00',
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
  lastError
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
  await startWorker();
  return true;
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
app.whenReady().then(() => {
  log('App starting...');
  loadConfig();
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
