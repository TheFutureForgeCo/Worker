const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, Notification, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, exec } = require('child_process');
const https = require('https');
const http = require('http');
const os = require('os');
const { autoUpdater } = require('electron-updater');

// App version and integrity
const APP_VERSION = require('../package.json').version;
const INTEGRITY_CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

// App configuration
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const OLLAMA_HOST = 'http://127.0.0.1:11434';

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
  serverUrl: '',
  autoStart: false,
  minimizeToTray: true
};
let stats = {
  tasksCompleted: 0,
  earnings: '0.00',
  status: 'stopped',
  ollamaStatus: 'not installed'
};

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
    width: 450,
    height: 600,
    minWidth: 400,
    minHeight: 500,
    resizable: true,
    frame: true,
    show: false,
    // Icon will be set during packaging by electron-builder
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
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
  // Create a simple 16x16 icon
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  
  // Fill with gradient-like pattern (purple to cyan)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const ratio = (x + y) / (size * 2);
      
      // RGBA: purple to cyan gradient
      canvas[idx] = Math.floor(124 + (0 - 124) * ratio);     // R
      canvas[idx + 1] = Math.floor(58 + (212 - 58) * ratio); // G
      canvas[idx + 2] = Math.floor(237 + (255 - 237) * ratio); // B
      canvas[idx + 3] = 255; // A
    }
  }
  
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

// Create system tray
function createTray() {
  let trayIcon;
  
  // Try to load icon from file, fallback to generated icon
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
      label: `Earnings: $${stats.earnings}`,
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
      label: 'Quit',
      click: () => {
        stopWorker();
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(`ComputeGrid Worker - ${stats.status} | $${stats.earnings}`);
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
        serverUrl: config.serverUrl,
        autoStart: config.autoStart,
        minimizeToTray: config.minimizeToTray
      }
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

// Install Ollama
async function installOllama() {
  stats.ollamaStatus = 'installing...';
  sendStatusToRenderer();

  return new Promise((resolve, reject) => {
    if (process.platform === 'linux') {
      exec('curl -fsSL https://ollama.com/install.sh | sh', (error, stdout, stderr) => {
        if (error) {
          stats.ollamaStatus = 'install failed';
          reject(error);
        } else {
          stats.ollamaStatus = 'installed';
          resolve(true);
        }
        sendStatusToRenderer();
      });
    } else if (process.platform === 'darwin') {
      shell.openExternal('https://ollama.com/download/mac');
      stats.ollamaStatus = 'manual install required';
      resolve(false);
    } else if (process.platform === 'win32') {
      shell.openExternal('https://ollama.com/download/windows');
      stats.ollamaStatus = 'manual install required';
      resolve(false);
    } else {
      reject(new Error('Unsupported platform'));
    }
    sendStatusToRenderer();
  });
}

// Pull Ollama model
async function pullModel(modelName) {
  return new Promise((resolve, reject) => {
    stats.ollamaStatus = `pulling ${modelName}...`;
    sendStatusToRenderer();

    exec(`ollama pull ${modelName}`, { timeout: 600000 }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        stats.ollamaStatus = `${modelName} ready`;
        resolve(true);
      }
      sendStatusToRenderer();
    });
  });
}

// Start the worker
async function startWorker() {
  if (isWorkerRunning) return;
  if (!config.apiKey || !config.serverUrl) {
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

  // Start the worker process with integrity info
  const workerScript = path.join(__dirname, 'worker.js');
  const appSignature = generateAppSignature();
  
  workerProcess = spawn(process.execPath, [workerScript], {
    env: {
      ...process.env,
      CG_API_KEY: config.apiKey,
      CG_SERVER_URL: config.serverUrl,
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

// IPC handlers
ipcMain.handle('get-status', () => {
  return {
    isRunning: isWorkerRunning,
    stats,
    config: {
      apiKey: config.apiKey ? '***' + config.apiKey.slice(-6) : '',
      serverUrl: config.serverUrl,
      autoStart: config.autoStart,
      minimizeToTray: config.minimizeToTray
    }
  };
});

ipcMain.handle('save-config', (event, newConfig) => {
  config = { ...config, ...newConfig };
  saveConfig();
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
  return await checkOllama();
});

ipcMain.handle('install-ollama', async () => {
  return await installOllama();
});

ipcMain.handle('pull-model', async (event, modelName) => {
  return await pullModel(modelName);
});

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
});

ipcMain.handle('get-version', () => {
  return APP_VERSION;
});

// Auto-start configuration
function setupAutoStart() {
  app.setLoginItemSettings({
    openAtLogin: config.autoStart,
    openAsHidden: true
  });
}

// Setup auto-updater
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    showNotification('Update Available', `Version ${info.version} is downloading...`);
  });

  autoUpdater.on('update-not-available', () => {
    console.log('No updates available');
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`Download progress: ${Math.round(progress.percent)}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    showNotification('Update Ready', `Version ${info.version} will install on restart`);
    
    // If worker is not running, offer to restart now
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
  });

  // Check for updates on startup
  autoUpdater.checkForUpdates().catch(err => {
    console.log('Update check failed (may be in development):', err.message);
  });

  // Check for updates every hour
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

  if (config.autoStart && config.apiKey && config.serverUrl) {
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
