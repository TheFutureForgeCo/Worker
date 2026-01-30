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

// DOM Elements - Image AI Section
const imageAiToggle = document.getElementById('imageAiToggle');
const imageAiSwitch = document.getElementById('imageAiSwitch');
const imageAiStatus = document.getElementById('imageAiStatus');
const downloadImageAiBtn = document.getElementById('downloadImageAiBtn');
const imageAiDownloadStatus = document.getElementById('imageAiDownloadStatus');
const imageAiProgress = document.getElementById('imageAiProgress');
const imageAiProgressFill = document.getElementById('imageAiProgressFill');
const imageAiProgressText = document.getElementById('imageAiProgressText');
const uninstallImageAiBtn = document.getElementById('uninstallImageAiBtn');
const imageBenchmarkStatus = document.getElementById('imageBenchmarkStatus');
const benchmarkResult = document.getElementById('benchmarkResult');

// DOM Elements - Image AI Warning Modal
const imageAiWarningModal = document.getElementById('imageAiWarningModal');
const imageAiWarningCancel = document.getElementById('imageAiWarningCancel');
const imageAiWarningConfirm = document.getElementById('imageAiWarningConfirm');

// DOM Elements - About Page
const aboutBackBtn = document.getElementById('aboutBackBtn');
const openGithubBtn = document.getElementById('openGithubBtn');

// DOM Elements - Logs Page
const viewLogsBtn = document.getElementById('viewLogsBtn');
const logsBackBtn = document.getElementById('logsBackBtn');
const refreshLogsBtn = document.getElementById('refreshLogsBtn');
const openLogsFolderBtn = document.getElementById('openLogsFolderBtn');
const logsContent = document.getElementById('logsContent');
const logsPath = document.getElementById('logsPath');

// Pages
const mainPage = document.getElementById('mainPage');
const settingsPage = document.getElementById('settingsPage');
const aboutPage = document.getElementById('aboutPage');
const logsPage = document.getElementById('logsPage');

let isOnline = false;
let currentConfig = {};
let serverUrl = '';


// Format task count
function formatTasks(count) {
  const num = parseInt(count) || 0;
  return num.toLocaleString();
}

// Navigate between pages
function showPage(pageId) {
  [mainPage, settingsPage, aboutPage, logsPage].forEach(page => {
    if (page) page.classList.remove('active');
  });
  const targetPage = document.getElementById(pageId);
  if (targetPage) targetPage.classList.add('active');
  
  // Update settings icon state
  settingsBtn.classList.toggle('active', pageId === 'settingsPage');
  
  // Load logs when showing logs page
  if (pageId === 'logsPage') {
    loadLogs();
  }
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
  if (status === 'idle') displayStatus = 'Ready to connect';
  else if (status === 'checking...') displayStatus = 'Checking AI...';
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

// Logs page
async function loadLogs() {
  if (logsContent) {
    logsContent.textContent = 'Loading logs...';
  }
  try {
    const result = await window.electronAPI.getLogs();
    if (result.success) {
      if (logsContent) logsContent.textContent = result.logs || 'No logs yet.';
      if (logsPath) logsPath.textContent = result.path || '-';
      // Scroll to bottom
      const container = document.querySelector('.logs-container');
      if (container) container.scrollTop = container.scrollHeight;
    } else {
      if (logsContent) logsContent.textContent = 'Error loading logs: ' + (result.error || 'Unknown');
    }
  } catch (err) {
    if (logsContent) logsContent.textContent = 'Failed to load logs: ' + err.message;
  }
}

if (viewLogsBtn) {
  viewLogsBtn.addEventListener('click', () => {
    showPage('logsPage');
  });
}

if (logsBackBtn) {
  logsBackBtn.addEventListener('click', () => {
    showPage('settingsPage');
  });
}

if (refreshLogsBtn) {
  refreshLogsBtn.addEventListener('click', loadLogs);
}

if (openLogsFolderBtn) {
  openLogsFolderBtn.addEventListener('click', () => {
    window.electronAPI.openLogsFolder();
  });
}

// ============================================================
// IMAGE AI SECTION
// ============================================================

let imageAiEnabled = false;
let imageAiInstalled = false;
let imageBenchmarkTimeMs = null;
let imageQualityTier = 'none';

// Update Image AI UI based on status
function updateImageAiUI(status) {
  imageAiInstalled = status.imageAiInstalled || false;
  imageAiEnabled = status.imageAiEnabled || false;
  imageBenchmarkTimeMs = status.imageBenchmarkTimeMs || null;
  imageQualityTier = status.imageQualityTier || 'none';
  
  // Update status text
  if (imageAiStatus) {
    if (imageAiEnabled && imageAiInstalled) {
      if (imageQualityTier === 'none' || !imageBenchmarkTimeMs) {
        imageAiStatus.textContent = 'Enabled - benchmark pending';
      } else {
        imageAiStatus.textContent = `Enabled - ${imageQualityTier} tier`;
      }
    } else if (imageAiEnabled && !imageAiInstalled) {
      imageAiStatus.textContent = 'Download model to continue';
    } else {
      imageAiStatus.textContent = 'Accept image generation tasks from the network';
    }
  }
  
  // Update toggle switch
  if (imageAiSwitch) {
    imageAiSwitch.classList.toggle('active', imageAiEnabled);
  }
  
  // Show/hide download button
  if (downloadImageAiBtn) {
    downloadImageAiBtn.style.display = (imageAiEnabled && !imageAiInstalled) ? 'flex' : 'none';
  }
  
  // Show/hide uninstall button
  if (uninstallImageAiBtn) {
    uninstallImageAiBtn.style.display = imageAiInstalled ? 'flex' : 'none';
  }
  
  // Show/hide benchmark status
  if (imageBenchmarkStatus) {
    imageBenchmarkStatus.style.display = imageAiInstalled ? 'flex' : 'none';
  }
  
  // Update benchmark result
  if (benchmarkResult && imageAiInstalled) {
    if (imageBenchmarkTimeMs) {
      const seconds = (imageBenchmarkTimeMs / 1000).toFixed(1);
      let tierText = '';
      if (imageQualityTier === 'fast') {
        tierText = 'Fast - All quality levels';
      } else if (imageQualityTier === 'medium') {
        tierText = 'Medium - Up to 512px';
      } else if (imageQualityTier === 'slow') {
        tierText = 'Slow - 256px only';
      } else if (imageQualityTier === 'banned') {
        tierText = 'Too slow - Image generation disabled';
      } else {
        tierText = 'Pending tier assignment';
      }
      benchmarkResult.textContent = `${seconds}s - ${tierText}`;
    } else {
      benchmarkResult.textContent = 'Benchmark will run after first image task';
    }
  }
  
  // Update download status
  if (imageAiDownloadStatus && imageAiInstalled) {
    imageAiDownloadStatus.textContent = 'Installed';
  }
}

// Show warning modal when enabling image AI
function showImageAiWarningModal() {
  if (imageAiWarningModal) {
    imageAiWarningModal.classList.add('active');
  }
}

function hideImageAiWarningModal() {
  if (imageAiWarningModal) {
    imageAiWarningModal.classList.remove('active');
  }
}

// Modal button handlers
if (imageAiWarningCancel) {
  imageAiWarningCancel.addEventListener('click', () => {
    hideImageAiWarningModal();
  });
}

if (imageAiWarningConfirm) {
  imageAiWarningConfirm.addEventListener('click', async () => {
    hideImageAiWarningModal();
    
    // Enable image AI
    imageAiEnabled = true;
    if (imageAiSwitch) {
      imageAiSwitch.classList.toggle('active', true);
    }
    
    await window.electronAPI.setImageAiEnabled(true);
    
    // Re-fetch status to update UI
    const status = await window.electronAPI.getStatus();
    updateImageAiUI(status);
  });
}

// Toggle Image AI - shows warning modal when enabling
if (imageAiToggle) {
  imageAiToggle.addEventListener('click', async () => {
    if (imageAiEnabled) {
      // Disabling - no warning needed
      imageAiEnabled = false;
      if (imageAiSwitch) {
        imageAiSwitch.classList.toggle('active', false);
      }
      await window.electronAPI.setImageAiEnabled(false);
      
      const status = await window.electronAPI.getStatus();
      updateImageAiUI(status);
    } else {
      // Enabling - show warning modal
      showImageAiWarningModal();
    }
  });
}

// Download Image AI
let isDownloadingImageAi = false;

if (downloadImageAiBtn) {
  downloadImageAiBtn.addEventListener('click', async () => {
    if (isDownloadingImageAi) {
      // Cancel download
      await window.electronAPI.cancelImageAiDownload();
      isDownloadingImageAi = false;
      imageAiProgress.style.display = 'none';
      downloadImageAiBtn.style.display = 'flex';
      if (imageAiDownloadStatus) {
        imageAiDownloadStatus.textContent = '~4GB - Stable Diffusion';
      }
      return;
    }
    
    // Start download
    isDownloadingImageAi = true;
    downloadImageAiBtn.style.display = 'none';
    imageAiProgress.style.display = 'flex';
    
    try {
      const result = await window.electronAPI.downloadImageAi();
      if (!result) {
        // Download failed
        isDownloadingImageAi = false;
        imageAiProgress.style.display = 'none';
        downloadImageAiBtn.style.display = 'flex';
        if (imageAiDownloadStatus) {
          imageAiDownloadStatus.textContent = 'Download failed - try again';
        }
      }
    } catch (err) {
      isDownloadingImageAi = false;
      imageAiProgress.style.display = 'none';
      downloadImageAiBtn.style.display = 'flex';
      if (imageAiDownloadStatus) {
        imageAiDownloadStatus.textContent = 'Download failed - try again';
      }
    }
  });
}

// Uninstall Image AI
if (uninstallImageAiBtn) {
  uninstallImageAiBtn.addEventListener('click', async () => {
    if (confirm('This will remove the Image AI model and free up ~4GB of space. Continue?')) {
      await window.electronAPI.uninstallImageAi();
      imageAiInstalled = false;
      uninstallImageAiBtn.style.display = 'none';
      if (imageAiDownloadStatus) {
        imageAiDownloadStatus.textContent = '~4GB - Stable Diffusion';
      }
      if (imageAiEnabled && downloadImageAiBtn) {
        downloadImageAiBtn.style.display = 'flex';
      }
    }
  });
}

// Track current installation phase
let currentImageAiPhase = 'idle';
const phaseLabels = {
  'python': 'Downloading Python runtime...',
  'deps': 'Installing AI dependencies...',
  'model': 'Downloading Stable Diffusion model...',
  'benchmark': 'Running performance benchmark...'
};

// Listen for Image AI phase changes
if (window.electronAPI.onImageAiPhase) {
  window.electronAPI.onImageAiPhase((phase) => {
    currentImageAiPhase = phase;
    if (imageAiDownloadStatus) {
      imageAiDownloadStatus.textContent = phaseLabels[phase] || phase;
    }
    // Reset progress bar for new phase
    if (imageAiProgressFill) {
      imageAiProgressFill.style.width = '0%';
    }
    if (imageAiProgressText) {
      if (phase === 'benchmark') {
        imageAiProgressText.textContent = 'Generating test image...';
      } else if (phase === 'deps') {
        imageAiProgressText.textContent = 'Installing packages...';
      } else {
        imageAiProgressText.textContent = '0%';
      }
    }
  });
}

// Listen for Image AI download progress
if (window.electronAPI.onImageAiProgress) {
  window.electronAPI.onImageAiProgress((data) => {
    // Handle both old (number) and new (object) format
    let progress, phase;
    if (typeof data === 'number') {
      progress = data;
      phase = currentImageAiPhase;
    } else {
      progress = data.progress;
      phase = data.phase || currentImageAiPhase;
    }
    
    if (imageAiProgressFill) {
      imageAiProgressFill.style.width = `${progress}%`;
    }
    if (imageAiProgressText) {
      const downloaded = data?.downloaded ? `${Math.round(data.downloaded / 1024 / 1024)}MB` : '';
      const total = data?.total ? `${Math.round(data.total / 1024 / 1024)}MB` : '';
      if (downloaded && total) {
        imageAiProgressText.textContent = `${progress}% (${downloaded} / ${total})`;
      } else {
        imageAiProgressText.textContent = `${progress}%`;
      }
    }
  });
}

// Listen for deps installation progress
if (window.electronAPI.onImageAiDepsProgress) {
  window.electronAPI.onImageAiDepsProgress((message) => {
    if (imageAiProgressText) {
      // Show abbreviated message
      const short = message.length > 40 ? message.substring(0, 40) + '...' : message;
      imageAiProgressText.textContent = short;
    }
  });
}

// Listen for benchmark start
if (window.electronAPI.onImageAiBenchmarkStart) {
  window.electronAPI.onImageAiBenchmarkStart(() => {
    if (imageAiProgressText) {
      imageAiProgressText.textContent = 'Generating test image...';
    }
    if (imageAiDownloadStatus) {
      imageAiDownloadStatus.textContent = 'Running performance benchmark...';
    }
  });
}

// Listen for benchmark complete
if (window.electronAPI.onImageAiBenchmarkComplete) {
  window.electronAPI.onImageAiBenchmarkComplete((data) => {
    isDownloadingImageAi = false;
    currentImageAiPhase = 'idle';
    imageAiProgress.style.display = 'none';
    imageAiInstalled = true;
    
    if (downloadImageAiBtn) {
      downloadImageAiBtn.style.display = 'none';
    }
    if (uninstallImageAiBtn) {
      uninstallImageAiBtn.style.display = 'flex';
    }
    
    const tierLabels = {
      'fast': 'Fast (all sizes)',
      'medium': 'Medium (up to 512px)',
      'slow': 'Slow (256px only)',
      'banned': 'Too slow for image tasks'
    };
    
    if (imageAiDownloadStatus) {
      imageAiDownloadStatus.textContent = 'Installed and ready';
    }
    if (benchmarkResult) {
      const seconds = (data.time / 1000).toFixed(1);
      benchmarkResult.textContent = `${seconds}s - ${tierLabels[data.tier] || data.tier}`;
    }
  });
}

// Listen for benchmark error
if (window.electronAPI.onImageAiBenchmarkError) {
  window.electronAPI.onImageAiBenchmarkError((error) => {
    isDownloadingImageAi = false;
    currentImageAiPhase = 'idle';
    imageAiProgress.style.display = 'none';
    
    if (downloadImageAiBtn) {
      downloadImageAiBtn.style.display = 'flex';
    }
    if (imageAiDownloadStatus) {
      imageAiDownloadStatus.textContent = `Benchmark failed: ${error.substring(0, 30)}...`;
    }
  });
}

// Listen for Image AI download errors
if (window.electronAPI.onImageAiError) {
  window.electronAPI.onImageAiError((error) => {
    isDownloadingImageAi = false;
    currentImageAiPhase = 'idle';
    imageAiProgress.style.display = 'none';
    if (downloadImageAiBtn) {
      downloadImageAiBtn.style.display = 'flex';
    }
    if (imageAiDownloadStatus) {
      imageAiDownloadStatus.textContent = `Error: ${error.substring(0, 40)}...`;
    }
  });
}

// Listen for status updates from main process
window.electronAPI.onStatusUpdate((status) => {
  updateUI(status);
  updateImageAiUI(status);
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
