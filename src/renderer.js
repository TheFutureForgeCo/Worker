// DOM Elements - Main Page
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const earnings = document.getElementById('earnings');
const tasksCompleted = document.getElementById('tasksCompleted');
const ollamaDot = document.getElementById('ollamaDot');
const ollamaStatus = document.getElementById('ollamaStatus');
const ollamaProgress = document.getElementById('ollamaProgress');
const ollamaProgressFill = document.getElementById('ollamaProgressFill');
const installOllamaBtn = document.getElementById('installOllamaBtn');
const apiKey = document.getElementById('apiKey');
const saveBtn = document.getElementById('saveBtn');
const startBtn = document.getElementById('startBtn');
const dashboardLink = document.getElementById('dashboardLink');
const getApiKeyLink = document.getElementById('getApiKeyLink');
const versionBadge = document.getElementById('versionBadge');
const settingsBtn = document.getElementById('settingsBtn');

// DOM Elements - Settings Page
const autoStartToggle = document.getElementById('autoStartToggle');
const autoStartSwitch = document.getElementById('autoStartSwitch');
const startMinimizedToggle = document.getElementById('startMinimizedToggle');
const startMinimizedSwitch = document.getElementById('startMinimizedSwitch');
const minimizeToTrayToggle = document.getElementById('minimizeToTrayToggle');
const minimizeToTraySwitch = document.getElementById('minimizeToTraySwitch');
const manageModelsBtn = document.getElementById('manageModelsBtn');
const modelCount = document.getElementById('modelCount');
const checkUpdatesBtn = document.getElementById('checkUpdatesBtn');
const updateStatus = document.getElementById('updateStatus');
const clearDataBtn = document.getElementById('clearDataBtn');
const aboutBtn = document.getElementById('aboutBtn');
const uninstallBtn = document.getElementById('uninstallBtn');
const backBtn = document.getElementById('backBtn');

// DOM Elements - Models Page
const preferredModel = document.getElementById('preferredModel');
const modelList = document.getElementById('modelList');
const newModelName = document.getElementById('newModelName');
const pullModelBtn = document.getElementById('pullModelBtn');
const modelsBackBtn = document.getElementById('modelsBackBtn');

// DOM Elements - About Page
const aboutBackBtn = document.getElementById('aboutBackBtn');
const openGithubBtn = document.getElementById('openGithubBtn');

// Pages
const mainPage = document.getElementById('mainPage');
const settingsPage = document.getElementById('settingsPage');
const modelsPage = document.getElementById('modelsPage');
const aboutPage = document.getElementById('aboutPage');

let isRunning = false;
let currentConfig = {};
let serverUrl = '';

// Format earnings nicely
function formatEarnings(amount) {
  const num = parseFloat(amount) || 0;
  return `$${num.toFixed(2)}`;
}

// Format task count
function formatTasks(count) {
  const num = parseInt(count) || 0;
  return num.toLocaleString();
}

// Format bytes to human readable
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

// Navigate between pages
function showPage(pageId) {
  [mainPage, settingsPage, modelsPage, aboutPage].forEach(page => {
    page.classList.remove('active');
  });
  document.getElementById(pageId).classList.add('active');
  
  // Update settings icon state
  settingsBtn.classList.toggle('active', pageId === 'settingsPage');
}

// Initialize
async function init() {
  // Get server URL first
  serverUrl = await window.electronAPI.getServerUrl();
  
  const status = await window.electronAPI.getStatus();
  updateUI(status);
  
  // Check Ollama status
  checkOllamaStatus();
  
  // Update dashboard links
  updateDashboardLink();
  
  // Show version
  if (window.electronAPI.getVersion) {
    const version = await window.electronAPI.getVersion();
    if (versionBadge && version) {
      versionBadge.textContent = `v${version}`;
    }
  }
  
  // Load models
  loadModels();
}

// Update UI with status
function updateUI(status) {
  isRunning = status.isRunning;
  currentConfig = status.config;
  
  // Update status indicator
  if (isRunning) {
    statusDot.classList.add('running');
    statusText.textContent = status.stats.status || 'Running';
    startBtn.textContent = 'Stop Worker';
    startBtn.classList.remove('btn-primary');
    startBtn.classList.add('btn-danger');
  } else {
    statusDot.classList.remove('running');
    statusText.textContent = 'Stopped';
    startBtn.textContent = 'Start Worker';
    startBtn.classList.remove('btn-danger');
    startBtn.classList.add('btn-primary');
  }
  
  // Update stats with formatting
  earnings.textContent = formatEarnings(status.stats.earnings);
  tasksCompleted.textContent = formatTasks(status.stats.tasksCompleted);
  
  // Update Ollama status
  updateOllamaUI(status.stats.ollamaStatus || 'checking...', status.ollamaDownloadProgress);
  
  // Update settings toggles
  autoStartSwitch.classList.toggle('active', currentConfig.autoStart);
  startMinimizedSwitch.classList.toggle('active', currentConfig.startMinimized);
  minimizeToTraySwitch.classList.toggle('active', currentConfig.minimizeToTray);
  
  // Update preferred model
  if (preferredModel && currentConfig.selectedModel) {
    preferredModel.value = currentConfig.selectedModel;
  }
  
  // Update model count
  if (status.stats.ollamaModels) {
    const count = status.stats.ollamaModels.length;
    modelCount.textContent = `${count} model${count !== 1 ? 's' : ''} installed`;
  }
}

// Check Ollama status
async function checkOllamaStatus() {
  const installed = await window.electronAPI.checkOllama();
  updateOllamaUI(installed ? 'installed' : 'not installed', 0);
  if (installed) {
    loadModels();
  }
}

// Update Ollama UI
function updateOllamaUI(status, progress = 0) {
  ollamaStatus.textContent = `Ollama: ${status}`;
  
  // Show/hide progress bar
  if (progress > 0 && progress < 100) {
    ollamaProgress.style.display = 'block';
    ollamaProgressFill.style.width = `${progress}%`;
  } else {
    ollamaProgress.style.display = 'none';
  }
  
  if (status === 'installed' || status.includes('ready') || status.includes('pulling')) {
    ollamaDot.classList.add('ready');
    ollamaDot.classList.remove('error');
    installOllamaBtn.style.display = 'none';
  } else if (status === 'not installed' || status.includes('failed')) {
    ollamaDot.classList.remove('ready');
    ollamaDot.classList.add('error');
    installOllamaBtn.style.display = 'block';
  } else if (status.includes('downloading') || status.includes('installing')) {
    ollamaDot.classList.remove('ready', 'error');
    installOllamaBtn.style.display = 'none';
  } else {
    ollamaDot.classList.remove('ready', 'error');
    installOllamaBtn.style.display = 'none';
  }
}

// Update dashboard link
function updateDashboardLink() {
  dashboardLink.onclick = (e) => {
    e.preventDefault();
    window.electronAPI.openExternal(serverUrl);
  };
  getApiKeyLink.onclick = (e) => {
    e.preventDefault();
    window.electronAPI.openExternal(serverUrl);
  };
}

// Load installed models
async function loadModels() {
  const models = await window.electronAPI.getOllamaModels();
  
  if (models && models.length > 0) {
    modelList.innerHTML = models.map(model => `
      <div class="model-item">
        <div class="model-item-info">
          <div class="model-item-name">${model.name}</div>
          <div class="model-item-size">${formatBytes(model.size)}</div>
        </div>
        <button class="btn btn-secondary btn-icon" onclick="deleteModel('${model.name}')" title="Delete">&#128465;</button>
      </div>
    `).join('');
    
    modelCount.textContent = `${models.length} model${models.length !== 1 ? 's' : ''} installed`;
  } else {
    modelList.innerHTML = '<div class="input-hint">No models installed yet. Download one below.</div>';
    modelCount.textContent = '0 models installed';
  }
}

// Delete model
window.deleteModel = async function(modelName) {
  if (confirm(`Delete ${modelName}?`)) {
    try {
      await window.electronAPI.deleteModel(modelName);
      loadModels();
    } catch (err) {
      alert('Failed to delete model: ' + err.message);
    }
  }
};

// Load app info for About page
async function loadAboutInfo() {
  const info = await window.electronAPI.getAppInfo();
  document.getElementById('aboutVersion').textContent = info.version;
  document.getElementById('aboutPlatform').textContent = info.platform;
  document.getElementById('aboutArch').textContent = info.arch;
  document.getElementById('aboutElectron').textContent = info.electronVersion;
  document.getElementById('aboutNode').textContent = info.nodeVersion;
  document.getElementById('aboutServer').textContent = info.serverUrl;
}

// Event handlers - Main Page
saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  
  await window.electronAPI.saveConfig({
    apiKey: apiKey.value || currentConfig.apiKey?.replace(/\*/g, ''),
    autoStart: currentConfig.autoStart,
    minimizeToTray: currentConfig.minimizeToTray,
    startMinimized: currentConfig.startMinimized,
    selectedModel: preferredModel?.value || 'mistral'
  });
  
  saveBtn.textContent = 'Saved!';
  setTimeout(() => {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }, 1500);
});

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  
  if (isRunning) {
    await window.electronAPI.stopWorker();
  } else {
    // Save config first
    if (apiKey.value) {
      await window.electronAPI.saveConfig({
        apiKey: apiKey.value,
        autoStart: currentConfig.autoStart,
        minimizeToTray: currentConfig.minimizeToTray,
        startMinimized: currentConfig.startMinimized,
        selectedModel: preferredModel?.value || 'mistral'
      });
    }
    await window.electronAPI.startWorker();
  }
  
  startBtn.disabled = false;
});

installOllamaBtn.addEventListener('click', async () => {
  installOllamaBtn.disabled = true;
  installOllamaBtn.textContent = 'Installing...';
  
  await window.electronAPI.installOllama();
  
  installOllamaBtn.disabled = false;
  installOllamaBtn.textContent = 'Install';
});

// Navigation
settingsBtn.addEventListener('click', () => {
  showPage('settingsPage');
});

backBtn.addEventListener('click', () => {
  showPage('mainPage');
});

modelsBackBtn.addEventListener('click', () => {
  showPage('settingsPage');
});

aboutBackBtn.addEventListener('click', () => {
  showPage('settingsPage');
});

// Settings toggles
autoStartToggle.addEventListener('click', async () => {
  const newValue = !autoStartSwitch.classList.contains('active');
  autoStartSwitch.classList.toggle('active', newValue);
  await window.electronAPI.saveConfig({
    ...currentConfig,
    autoStart: newValue
  });
  currentConfig.autoStart = newValue;
});

startMinimizedToggle.addEventListener('click', async () => {
  const newValue = !startMinimizedSwitch.classList.contains('active');
  startMinimizedSwitch.classList.toggle('active', newValue);
  await window.electronAPI.saveConfig({
    ...currentConfig,
    startMinimized: newValue
  });
  currentConfig.startMinimized = newValue;
});

minimizeToTrayToggle.addEventListener('click', async () => {
  const newValue = !minimizeToTraySwitch.classList.contains('active');
  minimizeToTraySwitch.classList.toggle('active', newValue);
  await window.electronAPI.saveConfig({
    ...currentConfig,
    minimizeToTray: newValue
  });
  currentConfig.minimizeToTray = newValue;
});

// Settings actions
manageModelsBtn.addEventListener('click', () => {
  loadModels();
  showPage('modelsPage');
});

checkUpdatesBtn.addEventListener('click', async () => {
  updateStatus.textContent = 'Checking...';
  const result = await window.electronAPI.checkForUpdates();
  if (result && result.error) {
    updateStatus.textContent = 'Check failed';
  } else {
    updateStatus.textContent = 'Up to date';
  }
});

clearDataBtn.addEventListener('click', async () => {
  if (confirm('This will reset all settings and clear stored data. Continue?')) {
    await window.electronAPI.clearData();
    apiKey.value = '';
    alert('App data cleared. Please restart the application.');
  }
});

aboutBtn.addEventListener('click', () => {
  loadAboutInfo();
  showPage('aboutPage');
});

uninstallBtn.addEventListener('click', async () => {
  if (confirm('This will stop the worker and clear all data. The app will then close with uninstallation instructions.')) {
    await window.electronAPI.uninstallApp();
  }
});

// Models page
preferredModel.addEventListener('change', async () => {
  await window.electronAPI.saveConfig({
    ...currentConfig,
    selectedModel: preferredModel.value
  });
  currentConfig.selectedModel = preferredModel.value;
});

pullModelBtn.addEventListener('click', async () => {
  const modelName = newModelName.value.trim();
  if (!modelName) {
    alert('Please enter a model name');
    return;
  }
  
  pullModelBtn.disabled = true;
  pullModelBtn.textContent = 'Downloading...';
  
  try {
    await window.electronAPI.pullModel(modelName);
    newModelName.value = '';
    loadModels();
  } catch (err) {
    alert('Failed to download model: ' + err.message);
  }
  
  pullModelBtn.disabled = false;
  pullModelBtn.textContent = 'Download Model';
});

// About page
openGithubBtn.addEventListener('click', () => {
  window.electronAPI.openExternal('https://github.com/TheFutureForgeCo/Worker');
});

// Listen for status updates from main process
window.electronAPI.onStatusUpdate((status) => {
  updateUI(status);
});

// Listen for navigation from main process (e.g., tray menu)
window.electronAPI.onNavigate((page) => {
  if (page === 'settings') {
    showPage('settingsPage');
  } else if (page === 'models') {
    showPage('modelsPage');
  } else if (page === 'about') {
    showPage('aboutPage');
  } else {
    showPage('mainPage');
  }
});

// Listen for update status
window.electronAPI.onUpdateStatus((data) => {
  if (data.status === 'downloading') {
    updateStatus.textContent = `Downloading ${data.version}...`;
  } else if (data.status === 'ready') {
    updateStatus.textContent = `${data.version} ready to install`;
  } else if (data.status === 'up-to-date') {
    updateStatus.textContent = 'Up to date';
  } else if (data.status === 'error') {
    updateStatus.textContent = 'Check failed';
  }
});

// Initialize on load
init();
