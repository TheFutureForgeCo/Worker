const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, Notification, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, exec, execSync } = require('child_process');
const https = require('https');
const http = require('http');
const os = require('os');
const { autoUpdater } = require('electron-updater');

// App version and integrity
const APP_VERSION = require('../package.json').version;
const INTEGRITY_CHECK_INTERVAL = 5 * 60 * 1000;

// Hardcoded server URL - users only need to enter API key
const SERVER_URL = 'https://computegrid.replit.app';

// App configuration
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const OLLAMA_HOST = 'http://127.0.0.1:11434';

// Ollama download URLs
const OLLAMA_DOWNLOAD_URLS = {
  win32: 'https://ollama.com/download/OllamaSetup.exe',
  darwin: 'https://ollama.com/download/Ollama-darwin.zip',
  linux: 'https://ollama.com/install.sh'
};

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
    console.error('Failed to generate signature:', err);
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

// Load configuration
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      config = { ...config, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error('Failed to load config:', err);
  }
}

// Save configuration
function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Failed to save config:', err);
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
    frame: true,
    show: !config.startMinimized,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

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
      label: `Status: ${stats.status}`,
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
      label: isWorkerRunning ? 'Stop Worker' : 'Start Worker',
      click: () => {
        if (isWorkerRunning) {
          stopWorker();
        } else {
          startWorker();
        }
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
  tray.setToolTip(`ComputeGrid Worker - ${stats.status} | ${stats.earnings} tokens`);
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
      stats,
      config: {
        apiKey: config.apiKey ? '***' + config.apiKey.slice(-6) : '',
        serverUrl: SERVER_URL,
        autoStart: config.autoStart,
        minimizeToTray: config.minimizeToTray,
        startMinimized: config.startMinimized
      },
      ollamaDownloadProgress
    });
  }
}

// Check if Ollama is installed
async function checkOllama() {
  return new Promise((resolve) => {
    const checkCmd = process.platform === 'win32' ? 'where ollama' : 'which ollama';
    exec(checkCmd, (error) => {
      if (error) {
        stats.ollamaStatus = 'not installed';
        resolve(false);
      } else {
        stats.ollamaStatus = 'installed';
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

// Start Ollama service
async function startOllamaService() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec('ollama serve', { detached: true, stdio: 'ignore' });
    } else {
      exec('ollama serve &', { detached: true, stdio: 'ignore' });
    }
    // Wait for service to start
    setTimeout(() => resolve(true), 3000);
  });
}

// Download file with progress
function downloadFile(url, destPath, progressCallback) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    
    const makeRequest = (requestUrl) => {
      https.get(requestUrl, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          makeRequest(response.headers.location);
          return;
        }
        
        const totalBytes = parseInt(response.headers['content-length'], 10);
        let downloadedBytes = 0;
        
        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const progress = Math.round((downloadedBytes / totalBytes) * 100);
          if (progressCallback) progressCallback(progress);
        });
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          resolve(destPath);
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    };
    
    makeRequest(url);
  });
}

// Install Ollama with automatic download
async function installOllama() {
  stats.ollamaStatus = 'downloading...';
  ollamaDownloadProgress = 0;
  sendStatusToRenderer();

  const platform = process.platform;
  const downloadUrl = OLLAMA_DOWNLOAD_URLS[platform];
  
  if (!downloadUrl) {
    stats.ollamaStatus = 'unsupported platform';
    sendStatusToRenderer();
    return false;
  }

  try {
    if (platform === 'linux') {
      // Linux: use curl install script
      stats.ollamaStatus = 'installing...';
      sendStatusToRenderer();
      
      return new Promise((resolve, reject) => {
        exec('curl -fsSL https://ollama.com/install.sh | sh', (error) => {
          if (error) {
            stats.ollamaStatus = 'install failed';
            sendStatusToRenderer();
            reject(error);
          } else {
            stats.ollamaStatus = 'installed';
            sendStatusToRenderer();
            resolve(true);
          }
        });
      });
    } else if (platform === 'win32') {
      // Windows: download and run installer silently
      const tempDir = os.tmpdir();
      const installerPath = path.join(tempDir, 'OllamaSetup.exe');
      
      await downloadFile(downloadUrl, installerPath, (progress) => {
        ollamaDownloadProgress = progress;
        stats.ollamaStatus = `downloading... ${progress}%`;
        sendStatusToRenderer();
      });
      
      stats.ollamaStatus = 'installing...';
      sendStatusToRenderer();
      
      // Run installer silently
      return new Promise((resolve, reject) => {
        exec(`"${installerPath}" /S`, (error) => {
          // Clean up installer
          fs.unlink(installerPath, () => {});
          
          if (error) {
            // Try alternative installation method
            exec(`start /wait "${installerPath}"`, (error2) => {
              if (error2) {
                stats.ollamaStatus = 'install failed - please install manually';
                sendStatusToRenderer();
                shell.openExternal('https://ollama.com/download/windows');
                reject(error2);
              } else {
                stats.ollamaStatus = 'installed';
                sendStatusToRenderer();
                resolve(true);
              }
            });
          } else {
            stats.ollamaStatus = 'installed';
            ollamaDownloadProgress = 0;
            sendStatusToRenderer();
            resolve(true);
          }
        });
      });
    } else if (platform === 'darwin') {
      // macOS: download zip and extract
      const tempDir = os.tmpdir();
      const zipPath = path.join(tempDir, 'Ollama.zip');
      
      await downloadFile(downloadUrl, zipPath, (progress) => {
        ollamaDownloadProgress = progress;
        stats.ollamaStatus = `downloading... ${progress}%`;
        sendStatusToRenderer();
      });
      
      stats.ollamaStatus = 'installing...';
      sendStatusToRenderer();
      
      return new Promise((resolve, reject) => {
        exec(`unzip -o "${zipPath}" -d /Applications && open /Applications/Ollama.app`, (error) => {
          fs.unlink(zipPath, () => {});
          
          if (error) {
            stats.ollamaStatus = 'install failed';
            sendStatusToRenderer();
            shell.openExternal('https://ollama.com/download/mac');
            reject(error);
          } else {
            stats.ollamaStatus = 'installed';
            ollamaDownloadProgress = 0;
            sendStatusToRenderer();
            resolve(true);
          }
        });
      });
    }
  } catch (err) {
    console.error('Ollama installation failed:', err);
    stats.ollamaStatus = 'install failed';
    ollamaDownloadProgress = 0;
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

// Pull Ollama model
async function pullModel(modelName) {
  return new Promise((resolve, reject) => {
    stats.ollamaStatus = `pulling ${modelName}...`;
    sendStatusToRenderer();

    exec(`ollama pull ${modelName}`, { timeout: 600000 }, (error, stdout, stderr) => {
      if (error) {
        stats.ollamaStatus = `pull failed: ${error.message}`;
        sendStatusToRenderer();
        reject(error);
      } else {
        stats.ollamaStatus = `${modelName} ready`;
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

// Start the worker
async function startWorker() {
  if (isWorkerRunning) return;
  if (!config.apiKey) {
    stats.status = 'API key required';
    sendStatusToRenderer();
    return;
  }

  isWorkerRunning = true;
  stats.status = 'starting...';
  sendStatusToRenderer();
  updateTrayMenu();

  // Check and setup Ollama
  const ollamaInstalled = await checkOllama();
  if (!ollamaInstalled) {
    try {
      await installOllama();
    } catch (err) {
      console.error('Ollama install failed:', err);
    }
  }
  
  // Ensure Ollama service is running
  const ollamaRunning = await checkOllamaRunning();
  if (!ollamaRunning) {
    await startOllamaService();
  }
  
  // Get current models
  await getOllamaModels();

  // Start the worker process with integrity info
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
  
  console.log(`Worker started with signature: ${appSignature}`);

  workerProcess.stdout.on('data', (data) => {
    const message = data.toString();
    console.log('[Worker]', message);
    parseWorkerOutput(message);
  });

  workerProcess.stderr.on('data', (data) => {
    console.error('[Worker Error]', data.toString());
  });

  workerProcess.on('message', (message) => {
    if (message.type === 'stats') {
      stats = { ...stats, ...message.data };
      sendStatusToRenderer();
      updateTrayMenu();
    }
  });

  workerProcess.on('close', (code) => {
    console.log(`Worker process exited with code ${code}`);
    isWorkerRunning = false;
    stats.status = 'stopped';
    sendStatusToRenderer();
    updateTrayMenu();
  });

  stats.status = 'running';
  sendStatusToRenderer();
  updateTrayMenu();
  showNotification('ComputeGrid Worker', 'Worker started successfully');
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
function stopWorker() {
  if (workerProcess) {
    workerProcess.kill();
    workerProcess = null;
  }
  isWorkerRunning = false;
  stats.status = 'stopped';
  sendStatusToRenderer();
  updateTrayMenu();
}

// Clear app data
function clearAppData() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      fs.unlinkSync(CONFIG_PATH);
    }
    config = {
      apiKey: '',
      autoStart: false,
      minimizeToTray: true,
      startMinimized: false,
      selectedModel: 'mistral'
    };
    stats = {
      tasksCompleted: 0,
      earnings: '0.00',
      status: 'stopped',
      ollamaStatus: 'checking...',
      ollamaModels: []
    };
    sendStatusToRenderer();
    return true;
  } catch (err) {
    console.error('Failed to clear data:', err);
    return false;
  }
}

// Uninstall the app
async function uninstallApp() {
  stopWorker();
  clearAppData();
  
  // Show instructions based on platform
  const platform = process.platform;
  let instructions = '';
  
  if (platform === 'win32') {
    instructions = 'To complete uninstallation:\n\n1. Open Settings > Apps\n2. Find "ComputeGrid Worker"\n3. Click Uninstall\n\nOr use Control Panel > Programs and Features';
  } else if (platform === 'darwin') {
    instructions = 'To complete uninstallation:\n\n1. Open Finder\n2. Go to Applications\n3. Drag "ComputeGrid Worker" to Trash';
  } else {
    instructions = 'To complete uninstallation:\n\nDelete the AppImage file you used to run this application.';
  }
  
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Uninstall ComputeGrid Worker',
    message: 'App data has been cleared.',
    detail: instructions,
    buttons: ['OK']
  }).then(() => {
    app.quit();
  });
}

// IPC handlers
ipcMain.handle('get-status', () => {
  return {
    isRunning: isWorkerRunning,
    stats,
    config: {
      apiKey: config.apiKey ? '***' + config.apiKey.slice(-6) : '',
      serverUrl: SERVER_URL,
      autoStart: config.autoStart,
      minimizeToTray: config.minimizeToTray,
      startMinimized: config.startMinimized
    },
    ollamaDownloadProgress
  };
});

ipcMain.handle('get-server-url', () => {
  return SERVER_URL;
});

ipcMain.handle('save-config', (event, newConfig) => {
  config = { ...config, ...newConfig };
  saveConfig();
  setupAutoStart();
  sendStatusToRenderer();
  return true;
});

ipcMain.handle('start-worker', () => {
  startWorker();
  return true;
});

ipcMain.handle('stop-worker', () => {
  stopWorker();
  return true;
});

ipcMain.handle('check-ollama', async () => {
  const installed = await checkOllama();
  if (installed) {
    const running = await checkOllamaRunning();
    if (!running) {
      await startOllamaService();
    }
    await getOllamaModels();
  }
  return installed;
});

ipcMain.handle('install-ollama', async () => {
  return await installOllama();
});

ipcMain.handle('get-ollama-models', async () => {
  return await getOllamaModels();
});

ipcMain.handle('pull-model', async (event, modelName) => {
  return await pullModel(modelName);
});

ipcMain.handle('delete-model', async (event, modelName) => {
  return await deleteModel(modelName);
});

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
});

ipcMain.handle('get-version', () => {
  return APP_VERSION;
});

ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return result;
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('clear-data', () => {
  return clearAppData();
});

ipcMain.handle('uninstall-app', () => {
  uninstallApp();
  return true;
});

ipcMain.handle('get-app-info', () => {
  return {
    version: APP_VERSION,
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    dataPath: app.getPath('userData'),
    serverUrl: SERVER_URL
  };
});

// Auto-start configuration
function setupAutoStart() {
  app.setLoginItemSettings({
    openAtLogin: config.autoStart,
    openAsHidden: config.startMinimized
  });
}

// Auto-setup Ollama on startup
async function setupOllamaOnStartup() {
  stats.ollamaStatus = 'checking...';
  sendStatusToRenderer();
  
  const installed = await checkOllama();
  
  if (!installed) {
    // Auto-install Ollama
    stats.ollamaStatus = 'downloading AI...';
    sendStatusToRenderer();
    
    try {
      await installOllama();
    } catch (err) {
      console.error('Ollama auto-install failed:', err);
      stats.ollamaStatus = 'install failed';
      sendStatusToRenderer();
      return;
    }
  }
  
  // Start Ollama service
  const running = await checkOllamaRunning();
  if (!running) {
    stats.ollamaStatus = 'starting AI service...';
    sendStatusToRenderer();
    await startOllamaService();
  }
  
  // Get available models
  const models = await getOllamaModels();
  
  // If no models installed, pull default model
  if (!models || models.length === 0) {
    stats.ollamaStatus = 'downloading AI model...';
    sendStatusToRenderer();
    
    // Pick model based on RAM: TinyLlama for <8GB, Mistral for 8GB+
    const totalMemory = os.totalmem() / (1024 * 1024 * 1024); // GB
    const defaultModel = totalMemory < 8 ? 'tinyllama' : 'mistral';
    
    try {
      await pullModel(defaultModel);
      stats.ollamaStatus = `${defaultModel} ready`;
    } catch (err) {
      console.error('Model pull failed:', err);
      stats.ollamaStatus = 'model download failed';
    }
  } else {
    stats.ollamaStatus = 'ready';
  }
  
  sendStatusToRenderer();
}

// Setup auto-updater
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  
  // Set GitHub as the update provider
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'TheFutureForgeCo',
    repo: 'Worker'
  });

  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    showNotification('Update Available', `Version ${info.version} is downloading...`);
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { status: 'downloading', version: info.version });
    }
  });

  autoUpdater.on('update-not-available', () => {
    console.log('No updates available');
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { status: 'up-to-date' });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`Download progress: ${Math.round(progress.percent)}%`);
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { status: 'downloading', progress: progress.percent });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    showNotification('Update Ready', `Version ${info.version} will install on restart`);
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { status: 'ready', version: info.version });
    }
    
    if (!isWorkerRunning) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded. Restart now to install?`,
        buttons: ['Restart Now', 'Later']
      }).then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-update error:', err);
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { status: 'error', message: err.message });
    }
  });

  autoUpdater.checkForUpdates().catch(err => {
    console.log('Update check failed (may be in development):', err.message);
  });

  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 60 * 60 * 1000);
}

// App lifecycle
app.whenReady().then(() => {
  loadConfig();
  createWindow();
  createTray();
  setupAutoStart();
  setupAutoUpdater();

  console.log(`ComputeGrid Worker v${APP_VERSION} started`);
  console.log(`App signature: ${generateAppSignature()}`);
  console.log(`Server URL: ${SERVER_URL}`);

  // Auto-setup Ollama on startup - install and pull models automatically
  setupOllamaOnStartup();

  if (config.autoStart && config.apiKey) {
    startWorker();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !isWorkerRunning) {
    app.quit();
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
