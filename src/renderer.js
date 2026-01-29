// DOM Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const earnings = document.getElementById('earnings');
const tasksCompleted = document.getElementById('tasksCompleted');
const ollamaDot = document.getElementById('ollamaDot');
const ollamaStatus = document.getElementById('ollamaStatus');
const installOllamaBtn = document.getElementById('installOllamaBtn');
const serverUrl = document.getElementById('serverUrl');
const apiKey = document.getElementById('apiKey');
const autoStart = document.getElementById('autoStart');
const minimizeToTray = document.getElementById('minimizeToTray');
const saveBtn = document.getElementById('saveBtn');
const startBtn = document.getElementById('startBtn');
const dashboardLink = document.getElementById('dashboardLink');
const versionBadge = document.getElementById('versionBadge');

let isRunning = false;
let currentConfig = {};

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

// Initialize
async function init() {
  const status = await window.electronAPI.getStatus();
  updateUI(status);
  
  // Load saved config into inputs
  if (status.config.serverUrl) {
    serverUrl.value = status.config.serverUrl;
  }
  
  autoStart.checked = status.config.autoStart;
  minimizeToTray.checked = status.config.minimizeToTray;
  
  // Check Ollama status
  checkOllamaStatus();
  
  // Update dashboard link
  updateDashboardLink();
  
  // Show version
  if (window.electronAPI.getVersion) {
    const version = await window.electronAPI.getVersion();
    if (versionBadge && version) {
      versionBadge.textContent = `v${version}`;
    }
  }
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
  updateOllamaUI(status.stats.ollamaStatus || 'checking...');
}

// Check Ollama status
async function checkOllamaStatus() {
  const installed = await window.electronAPI.checkOllama();
  updateOllamaUI(installed ? 'installed' : 'not installed');
}

// Update Ollama UI
function updateOllamaUI(status) {
  ollamaStatus.textContent = `Ollama: ${status}`;
  
  if (status === 'installed' || status.includes('ready') || status.includes('pulling')) {
    ollamaDot.classList.add('ready');
    ollamaDot.classList.remove('error');
    installOllamaBtn.style.display = 'none';
  } else if (status === 'not installed' || status.includes('failed')) {
    ollamaDot.classList.remove('ready');
    ollamaDot.classList.add('error');
    installOllamaBtn.style.display = 'block';
  } else {
    ollamaDot.classList.remove('ready', 'error');
    installOllamaBtn.style.display = 'none';
  }
}

// Update dashboard link
function updateDashboardLink() {
  if (serverUrl.value) {
    dashboardLink.onclick = (e) => {
      e.preventDefault();
      window.electronAPI.openExternal(serverUrl.value);
    };
  }
}

// Event handlers
saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  
  await window.electronAPI.saveConfig({
    serverUrl: serverUrl.value,
    apiKey: apiKey.value || currentConfig.apiKey,
    autoStart: autoStart.checked,
    minimizeToTray: minimizeToTray.checked
  });
  
  updateDashboardLink();
  
  saveBtn.textContent = 'Saved!';
  setTimeout(() => {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Settings';
  }, 1500);
});

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  
  if (isRunning) {
    await window.electronAPI.stopWorker();
  } else {
    // Save config first
    await window.electronAPI.saveConfig({
      serverUrl: serverUrl.value,
      apiKey: apiKey.value || currentConfig.apiKey,
      autoStart: autoStart.checked,
      minimizeToTray: minimizeToTray.checked
    });
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

serverUrl.addEventListener('input', updateDashboardLink);

// Listen for status updates from main process
window.electronAPI.onStatusUpdate((status) => {
  updateUI(status);
});

// Initialize on load
init();
