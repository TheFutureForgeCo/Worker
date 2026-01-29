// Window Controls (frameless window)
const windowClose = document.getElementById('windowClose');
const windowMinimize = document.getElementById('windowMinimize');
const windowMaximize = document.getElementById('windowMaximize');

// Setup window controls
if (windowClose) {
  windowClose.addEventListener('click', () => window.electronAPI.windowClose());
}
if (windowMinimize) {
  windowMinimize.addEventListener('click', () => window.electronAPI.windowMinimize());
}
if (windowMaximize) {
  windowMaximize.addEventListener('click', () => window.electronAPI.windowMaximize());
}

// DOM Elements - Setup Overlay
const setupOverlay = document.getElementById('setupOverlay');
const setupTitle = document.getElementById('setupTitle');
const setupSubtitle = document.getElementById('setupSubtitle');
const setupProgressFill = document.getElementById('setupProgressFill');
const setupProgressText = document.getElementById('setupProgressText');

// DOM Elements - Error Banner
const errorBanner = document.getElementById('errorBanner');
const errorMessage = document.getElementById('errorMessage');
const errorDismiss = document.getElementById('errorDismiss');

// DOM Elements - Main Page
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const earnings = document.getElementById('earnings');
const tasksCompleted = document.getElementById('tasksCompleted');
const ollamaDot = document.getElementById('ollamaDot');
const ollamaStatus = document.getElementById('ollamaStatus');
const ollamaProgress = document.getElementById('ollamaProgress');
const ollamaProgressFill = document.getElementById('ollamaProgressFill');
const apiKey = document.getElementById('apiKey');
const saveBtn = document.getElementById('saveBtn');
const onlineToggleBtn = document.getElementById('onlineToggleBtn');
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
const checkUpdatesBtn = document.getElementById('checkUpdatesBtn');
const updateStatus = document.getElementById('updateStatus');
const clearDataBtn = document.getElementById('clearDataBtn');
const aboutBtn = document.getElementById('aboutBtn');
const uninstallBtn = document.getElementById('uninstallBtn');
const backBtn = document.getElementById('backBtn');

// DOM Elements - About Page
const aboutBackBtn = document.getElementById('aboutBackBtn');
const openGithubBtn = document.getElementById('openGithubBtn');

// Pages
const mainPage = document.getElementById('mainPage');
const settingsPage = document.getElementById('settingsPage');
const aboutPage = document.getElementById('aboutPage');

let isOnline = false;
let currentConfig = {};
let serverUrl = '';

// Format earnings as tokens
function formatEarnings(amount) {
  const num = parseFloat(amount) || 0;
  return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Format task count
function formatTasks(count) {
  const num = parseInt(count) || 0;
  return num.toLocaleString();
}

// Navigate between pages
function showPage(pageId) {
  [mainPage, settingsPage, aboutPage].forEach(page => {
    if (page) page.classList.remove('active');
  });
  const targetPage = document.getElementById(pageId);
  if (targetPage) targetPage.classList.add('active');
  
  // Update settings icon state
  settingsBtn.classList.toggle('active', pageId === 'settingsPage');
}

// Show/hide setup overlay
function updateSetupOverlay(status) {
  const { setupPhase, setupProgress } = status;
  
  if (setupPhase) {
    setupOverlay.classList.add('active');
    
    let title = 'Setting Up AI';
    let subtitle = 'This may take a few minutes on first run';
    let progressText = 'Preparing...';
    
    switch (setupPhase) {
      case 'downloading-ollama':
        title = 'Downloading AI Engine';
        subtitle = 'Installing Ollama for local AI processing';
        progressText = setupProgress ? `${setupProgress}% complete` : 'Starting download...';
        break;
      case 'extracting':
        title = 'Installing AI Engine';
        subtitle = 'Extracting files...';
        progressText = 'Almost done...';
        break;
      case 'downloading-model':
        title = 'Downloading AI Model';
        subtitle = 'This enables local AI responses';
        progressText = setupProgress ? `${setupProgress}% complete` : 'Starting download...';
        break;
      case 'starting-service':
        title = 'Starting AI Service';
        subtitle = 'Preparing to process tasks';
        progressText = 'Starting...';
        break;
    }
    
    setupTitle.textContent = title;
    setupSubtitle.textContent = subtitle;
    setupProgressFill.style.width = `${setupProgress || 0}%`;
    setupProgressText.textContent = progressText;
  } else {
    setupOverlay.classList.remove('active');
  }
}

// Show/hide error banner
function updateErrorBanner(lastError) {
  if (lastError) {
    errorBanner.classList.add('visible');
    errorMessage.textContent = lastError;
  } else {
    errorBanner.classList.remove('visible');
  }
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
}

// Update UI with status
function updateUI(status) {
  isOnline = status.isOnline;
  currentConfig = status.config;
  
  // Update setup overlay
  updateSetupOverlay(status);
  
  // Update error banner
  updateErrorBanner(status.lastError);
  
  // Update online status indicator
  if (isOnline) {
    statusDot.classList.add('online');
    statusText.textContent = status.stats.status || 'Online';
    onlineToggleBtn.textContent = 'Go Offline';
    onlineToggleBtn.classList.remove('go-online');
    onlineToggleBtn.classList.add('go-offline');
  } else {
    statusDot.classList.remove('online');
    statusText.textContent = status.stats.status || 'Offline';
    onlineToggleBtn.textContent = 'Go Online';
    onlineToggleBtn.classList.remove('go-offline');
    onlineToggleBtn.classList.add('go-online');
  }
  
  // Disable online button if no API key
  onlineToggleBtn.disabled = !currentConfig.apiKey || status.setupPhase;
  
  // Update stats with formatting
  earnings.textContent = formatEarnings(status.stats.earnings);
  tasksCompleted.textContent = formatTasks(status.stats.tasksCompleted);
  
  // Update Ollama status
  updateOllamaUI(status.stats.ollamaStatus || 'checking...', status.ollamaDownloadProgress);
  
  // Update settings toggles
  autoStartSwitch.classList.toggle('active', currentConfig.autoStart);
  startMinimizedSwitch.classList.toggle('active', currentConfig.startMinimized);
  minimizeToTraySwitch.classList.toggle('active', currentConfig.minimizeToTray);
}

// Check Ollama status
async function checkOllamaStatus() {
  const installed = await window.electronAPI.checkOllama();
  updateOllamaUI(installed ? 'AI Ready' : 'AI not installed', 0);
}

// Update Ollama UI
function updateOllamaUI(status, progress = 0) {
  // Show AI status in a user-friendly way
  let displayStatus = status;
  if (status === 'checking...') displayStatus = 'Checking AI...';
  else if (status === 'not installed') displayStatus = 'AI not installed';
  else if (status === 'installed' || status === 'ready' || status === 'AI Ready') displayStatus = 'AI Ready';
  else if (status === 'AI Engine Installed') displayStatus = 'AI Engine Installed';
  else if (status.includes('ready')) displayStatus = 'AI Ready';
  else if (status.includes('Downloading')) displayStatus = status;
  else if (status.includes('Extracting')) displayStatus = status;
  
  ollamaStatus.textContent = displayStatus;
  
  // Show/hide progress bar
  if (progress > 0 && progress < 100) {
    ollamaProgress.style.display = 'block';
    ollamaProgressFill.style.width = `${progress}%`;
  } else {
    ollamaProgress.style.display = 'none';
  }
  
  if (status === 'installed' || status.includes('Ready') || status.includes('ready') || status === 'AI Engine Installed') {
    ollamaDot.classList.add('ready');
    ollamaDot.classList.remove('error');
  } else if (status.includes('failed') || status.includes('error')) {
    ollamaDot.classList.remove('ready');
    ollamaDot.classList.add('error');
  } else if (status.includes('Downloading') || status.includes('Extracting') || status.includes('Starting')) {
    ollamaDot.classList.remove('ready', 'error');
  } else {
    ollamaDot.classList.remove('ready', 'error');
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

// Event handlers - Error banner
errorDismiss.addEventListener('click', () => {
  errorBanner.classList.remove('visible');
});

// Event handlers - Main Page
saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  
  await window.electronAPI.saveConfig({
    apiKey: apiKey.value || currentConfig.apiKey?.replace(/\*/g, ''),
    autoStart: currentConfig.autoStart,
    minimizeToTray: currentConfig.minimizeToTray,
    startMinimized: currentConfig.startMinimized
  });
  
  saveBtn.textContent = 'Saved!';
  setTimeout(() => {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }, 1500);
  
  // Refresh status to update button state
  const status = await window.electronAPI.getStatus();
  updateUI(status);
});

// Online toggle button
onlineToggleBtn.addEventListener('click', async () => {
  onlineToggleBtn.disabled = true;
  
  // Save config first if API key entered
  if (apiKey.value) {
    await window.electronAPI.saveConfig({
      apiKey: apiKey.value,
      autoStart: currentConfig.autoStart,
      minimizeToTray: currentConfig.minimizeToTray,
      startMinimized: currentConfig.startMinimized
    });
  }
  
  await window.electronAPI.toggleOnline();
  
  onlineToggleBtn.disabled = false;
});

// Navigation
settingsBtn.addEventListener('click', () => {
  showPage('settingsPage');
});

backBtn.addEventListener('click', () => {
  showPage('mainPage');
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
  if (confirm('This will reset all settings and clear stored data including AI models. Continue?')) {
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
