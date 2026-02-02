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
const imageAiProgressTitle = document.getElementById('imageAiProgressTitle');
const pauseImageAiBtn = document.getElementById('pauseImageAiBtn');
const imageAiPaused = document.getElementById('imageAiPaused');
const imageAiPausedStatus = document.getElementById('imageAiPausedStatus');
const resumeImageAiBtn = document.getElementById('resumeImageAiBtn');
const uninstallImageAiBtn = document.getElementById('uninstallImageAiBtn');
const deleteImageAiFilesBtn = document.getElementById('deleteImageAiFilesBtn');
const deleteImageAiStatus = document.getElementById('deleteImageAiStatus');
const imageBenchmarkStatus = document.getElementById('imageBenchmarkStatus');
const benchmarkResult = document.getElementById('benchmarkResult');
const retryBenchmarkBtn = document.getElementById('retryBenchmarkBtn');
const toggleBenchmarkLogsBtn = document.getElementById('toggleBenchmarkLogsBtn');
const benchmarkLogsContainer = document.getElementById('benchmarkLogsContainer');
const benchmarkLogsContent = document.getElementById('benchmarkLogsContent');
const clearBenchmarkLogsBtn = document.getElementById('clearBenchmarkLogsBtn');

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
  
  // Show version - try IPC invoke first, but also listen for pushed version
  try {
    if (window.electronAPI && window.electronAPI.getVersion) {
      const version = await window.electronAPI.getVersion();
      console.log('[Renderer] Got version via IPC invoke:', version);
      if (versionBadge && version) {
        versionBadge.textContent = `v${version}`;
      } else {
        console.log('[Renderer] versionBadge or version missing:', { versionBadge: !!versionBadge, version });
      }
    } else {
      console.log('[Renderer] getVersion not available on electronAPI');
    }
  } catch (err) {
    console.error('[Renderer] Error getting version:', err);
  }
  
  // Also listen for pushed version (more reliable in packaged builds)
  if (window.electronAPI && window.electronAPI.onAppVersion) {
    window.electronAPI.onAppVersion((version) => {
      console.log('[Renderer] Received pushed version:', version);
      if (versionBadge && version) {
        versionBadge.textContent = `v${version}`;
      }
    });
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
  
  // Show/hide download button - but ONLY if not currently downloading
  if (downloadImageAiBtn && !isDownloadingImageAi) {
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
  
  // Update benchmark result and retry button
  if (benchmarkResult && imageAiInstalled) {
    // Show retry button if: no benchmark time OR tier is banned (benchmark failed or too slow)
    const benchmarkOk = imageBenchmarkTimeMs && imageQualityTier && imageQualityTier !== 'banned';
    const showRetryBtn = !benchmarkOk;
    
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
      // No benchmark result
      if (imageQualityTier === 'banned') {
        benchmarkResult.textContent = 'Benchmark failed - Using fallback tier';
      } else if (imageQualityTier) {
        benchmarkResult.textContent = `Using fallback: ${imageQualityTier} tier`;
      } else {
        benchmarkResult.textContent = 'Benchmark not run yet';
      }
    }
    
    // Always show re-run button when Image AI is installed (for manual retesting)
    if (retryBenchmarkBtn) {
      retryBenchmarkBtn.style.display = 'inline-block';
    }
    // Always show logs button when Image AI is installed
    if (toggleBenchmarkLogsBtn) {
      toggleBenchmarkLogsBtn.style.display = 'inline-block';
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

// Delete Image AI Files button (always visible, for cleanup of failed/partial installs)
if (deleteImageAiFilesBtn) {
  deleteImageAiFilesBtn.addEventListener('click', async () => {
    if (confirm('This will delete ALL Image AI files including Python, dependencies, and any models. Use this to cleanup failed or partial installations. Continue?')) {
      if (deleteImageAiStatus) {
        deleteImageAiStatus.textContent = 'Deleting files...';
      }
      const result = await window.electronAPI.deleteImageAiFiles();
      if (result.success) {
        // Reset all state variables
        imageAiInstalled = false;
        imageAiEnabled = false;
        isDownloadingImageAi = false;
        currentImageAiPhase = 'idle';
        
        if (deleteImageAiStatus) {
          deleteImageAiStatus.textContent = 'Files deleted successfully!';
          setTimeout(() => {
            deleteImageAiStatus.textContent = 'Remove all downloaded files (cleanup failed installs)';
          }, 3000);
        }
        
        // Update UI to reflect clean state - hide all download-related UI
        if (uninstallImageAiBtn) {
          uninstallImageAiBtn.style.display = 'none';
        }
        if (imageAiProgress) {
          imageAiProgress.style.display = 'none';
        }
        if (imageAiPaused) {
          imageAiPaused.style.display = 'none';
        }
        if (imageAiDownloadStatus) {
          imageAiDownloadStatus.textContent = '~4GB - Stable Diffusion';
        }
        if (imageAiSwitch) {
          imageAiSwitch.classList.remove('active');
        }
        // Note: download button will be shown when user enables image AI again
      } else {
        if (deleteImageAiStatus) {
          deleteImageAiStatus.textContent = `Error: ${result.error}`;
        }
      }
    }
  });
}

// Pause Image AI download button
if (pauseImageAiBtn) {
  pauseImageAiBtn.addEventListener('click', async () => {
    console.log('[Renderer] Pause Image AI download requested');
    const result = await window.electronAPI.pauseImageAiDownload();
    if (result.success) {
      // UI will be updated by the phase event
      console.log('[Renderer] Pause request sent');
    }
  });
}

// Resume Image AI download button
if (resumeImageAiBtn) {
  resumeImageAiBtn.addEventListener('click', async () => {
    console.log('[Renderer] Resume Image AI download requested');
    // Hide paused state, show progress
    if (imageAiPaused) {
      imageAiPaused.style.display = 'none';
    }
    if (imageAiProgress) {
      imageAiProgress.style.display = 'flex';
    }
    if (imageAiProgressTitle) {
      imageAiProgressTitle.textContent = 'Resuming download...';
    }
    // Clear the paused flag first
    await window.electronAPI.resumeImageAiDownload();
    // Then trigger download again - it will resume from where it left off due to .tmp files and Range headers
    const result = await window.electronAPI.downloadImageAi();
    if (!result.success && !result.paused) {
      // Handle error
      if (imageAiProgress) {
        imageAiProgress.style.display = 'none';
      }
      if (downloadImageAiBtn) {
        downloadImageAiBtn.style.display = 'flex';
      }
      if (imageAiDownloadStatus) {
        imageAiDownloadStatus.textContent = `Error: ${result.error}`;
      }
    }
  });
}

// Retry Benchmark button
if (retryBenchmarkBtn) {
  retryBenchmarkBtn.addEventListener('click', async () => {
    console.log('[Renderer] Re-run benchmark requested');
    
    // Disable button and show loading state
    retryBenchmarkBtn.disabled = true;
    retryBenchmarkBtn.textContent = 'Running...';
    
    // Clear old logs and show log panel
    if (benchmarkLogsContent) {
      benchmarkLogsContent.textContent = '';
    }
    if (benchmarkLogsContainer) {
      benchmarkLogsContainer.style.display = 'block';
    }
    if (toggleBenchmarkLogsBtn) {
      toggleBenchmarkLogsBtn.textContent = 'Hide';
    }
    
    if (benchmarkResult) {
      benchmarkResult.textContent = 'Running benchmark...';
    }
    
    try {
      const result = await window.electronAPI.retryImageBenchmark();
      console.log('[Renderer] Benchmark result:', result);
      
      if (result.success) {
        // Success - UI will update via status change, keep button visible for re-testing
        retryBenchmarkBtn.textContent = 'Re-run';
      } else {
        // Failed - show error
        retryBenchmarkBtn.textContent = 'Re-run';
        if (benchmarkResult) {
          benchmarkResult.textContent = `Error: ${result.error}`;
        }
      }
    } catch (err) {
      console.error('[Renderer] Benchmark re-run failed:', err);
      retryBenchmarkBtn.textContent = 'Re-run';
      if (benchmarkResult) {
        benchmarkResult.textContent = `Error: ${err.message}`;
      }
    } finally {
      retryBenchmarkBtn.disabled = false;
    }
  });
}

// Benchmark logs toggle
if (toggleBenchmarkLogsBtn) {
  toggleBenchmarkLogsBtn.addEventListener('click', () => {
    if (benchmarkLogsContainer) {
      const isVisible = benchmarkLogsContainer.style.display !== 'none';
      benchmarkLogsContainer.style.display = isVisible ? 'none' : 'block';
      toggleBenchmarkLogsBtn.textContent = isVisible ? 'Logs' : 'Hide';
    }
  });
}

// Clear benchmark logs
if (clearBenchmarkLogsBtn) {
  clearBenchmarkLogsBtn.addEventListener('click', () => {
    if (benchmarkLogsContent) {
      benchmarkLogsContent.textContent = '';
    }
  });
}

// Listen for benchmark logs from main process
if (window.electronAPI.onBenchmarkLog) {
  window.electronAPI.onBenchmarkLog((logLine) => {
    if (benchmarkLogsContent) {
      benchmarkLogsContent.textContent += logLine + '\n';
      // Auto-scroll to bottom
      benchmarkLogsContent.scrollTop = benchmarkLogsContent.scrollHeight;
    }
    // Show the logs button when there are logs
    if (toggleBenchmarkLogsBtn) {
      toggleBenchmarkLogsBtn.style.display = 'inline-block';
    }
  });
}

// Track current installation phase
let currentImageAiPhase = 'idle';
const phaseLabels = {
  'python': 'Downloading Python runtime...',
  'deps': 'Installing AI dependencies...',
  'model': 'Downloading Stable Diffusion model...',
  'benchmark': 'Running performance benchmark...',
  'paused': 'Download paused',
  'resuming': 'Resuming download...'
};

// Listen for Image AI phase changes
if (window.electronAPI.onImageAiPhase) {
  window.electronAPI.onImageAiPhase((phase) => {
    currentImageAiPhase = phase;
    console.log('[Renderer] Image AI phase changed to:', phase);
    
    if (imageAiDownloadStatus) {
      imageAiDownloadStatus.textContent = phaseLabels[phase] || phase;
    }
    
    // Handle paused state
    if (phase === 'paused') {
      if (imageAiProgress) {
        imageAiProgress.style.display = 'none';
      }
      if (imageAiPaused) {
        imageAiPaused.style.display = 'flex';
      }
      return;
    }
    
    // For any other phase, hide paused state and show progress
    if (phase !== 'idle') {
      if (imageAiPaused) {
        imageAiPaused.style.display = 'none';
      }
      if (imageAiProgress) {
        imageAiProgress.style.display = 'flex';
      }
    }
    
    // Update progress title based on phase
    if (imageAiProgressTitle) {
      imageAiProgressTitle.textContent = phaseLabels[phase] || 'Downloading Image AI...';
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
    // Clear old logs and show log panel during initial benchmark
    if (benchmarkLogsContent) {
      benchmarkLogsContent.textContent = '';
    }
    if (benchmarkLogsContainer) {
      benchmarkLogsContainer.style.display = 'block';
    }
    if (toggleBenchmarkLogsBtn) {
      toggleBenchmarkLogsBtn.style.display = 'inline-block';
      toggleBenchmarkLogsBtn.textContent = 'Hide';
    }
    if (imageBenchmarkStatus) {
      imageBenchmarkStatus.style.display = 'flex';
    }
  });
}

// Listen for benchmark complete
if (window.electronAPI.onImageAiBenchmarkComplete) {
  window.electronAPI.onImageAiBenchmarkComplete((data) => {
    console.log('[Renderer] Benchmark complete received:', data);
    isDownloadingImageAi = false;
    currentImageAiPhase = 'idle';
    imageAiProgress.style.display = 'none';
    imageAiInstalled = true;
    
    // Update the benchmark state variables so updateImageAiUI has correct data
    imageBenchmarkTimeMs = data.time;
    imageQualityTier = data.tier;
    
    if (downloadImageAiBtn) {
      downloadImageAiBtn.style.display = 'none';
    }
    if (uninstallImageAiBtn) {
      uninstallImageAiBtn.style.display = 'flex';
    }
    
    // Show benchmark status section now that we have results
    if (imageBenchmarkStatus) {
      imageBenchmarkStatus.style.display = 'flex';
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
    
    // Update the status text to reflect the tier
    if (imageAiStatus && imageAiEnabled) {
      imageAiStatus.textContent = `Enabled - ${data.tier} tier`;
    }
  });
}

// Listen for benchmark error
if (window.electronAPI.onImageAiBenchmarkError) {
  window.electronAPI.onImageAiBenchmarkError((error) => {
    console.log('[Renderer] Benchmark error:', error);
    isDownloadingImageAi = false;
    currentImageAiPhase = 'idle';
    imageAiProgress.style.display = 'none';
    
    if (downloadImageAiBtn) {
      downloadImageAiBtn.style.display = 'flex';
    }
    if (imageAiDownloadStatus) {
      // Show full error message for debugging
      imageAiDownloadStatus.textContent = `Benchmark failed: ${error}`;
      imageAiDownloadStatus.style.wordBreak = 'break-word';
      imageAiDownloadStatus.style.whiteSpace = 'normal';
      imageAiDownloadStatus.style.maxHeight = '200px';
      imageAiDownloadStatus.style.overflowY = 'auto';
    }
    // Show benchmark status and logs button even on error
    if (imageBenchmarkStatus) {
      imageBenchmarkStatus.style.display = 'flex';
    }
    if (toggleBenchmarkLogsBtn) {
      toggleBenchmarkLogsBtn.style.display = 'inline-block';
    }
    if (retryBenchmarkBtn) {
      retryBenchmarkBtn.style.display = 'inline-block';
    }
  });
}

// Listen for benchmark fallback (when benchmark fails but setup proceeds anyway)
if (window.electronAPI.onImageAiBenchmarkFallback) {
  window.electronAPI.onImageAiBenchmarkFallback((data) => {
    console.log('[Renderer] Benchmark fallback received:', data);
    isDownloadingImageAi = false;
    currentImageAiPhase = 'idle';
    imageAiProgress.style.display = 'none';
    imageAiInstalled = true;
    
    // Update state with fallback tier
    imageBenchmarkTimeMs = null;
    imageQualityTier = data.tier;
    
    // Show the benchmark status section
    if (imageBenchmarkStatus) {
      imageBenchmarkStatus.style.display = 'flex';
    }
    if (benchmarkResult) {
      benchmarkResult.textContent = `Quality tier: ${data.tier} (auto-detected based on GPU)`;
    }
    
    // Hide download button, show installed controls
    if (downloadImageAiBtn) {
      downloadImageAiBtn.style.display = 'none';
    }
    if (uninstallImageAiBtn) {
      uninstallImageAiBtn.style.display = 'flex';
    }
    if (imageAiToggleContainer) {
      imageAiToggleContainer.style.display = 'block';
    }
    
    if (imageAiDownloadStatus) {
      imageAiDownloadStatus.textContent = `Setup complete - using ${data.tier} tier`;
    }
    
    // Update the status text
    if (imageAiStatus && imageAiEnabled) {
      imageAiStatus.textContent = `Enabled - ${data.tier} tier`;
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
  console.log('[Renderer] Update status:', data);
  if (data.status === 'checking') {
    updateStatus.textContent = 'Checking for updates...';
  } else if (data.status === 'downloading') {
    if (data.progress !== undefined && data.progress > 0) {
      const totalMB = data.total ? Math.round(data.total / 1024 / 1024) : '?';
      const downloadedMB = data.transferred ? Math.round(data.transferred / 1024 / 1024) : '?';
      updateStatus.textContent = `Downloading ${data.version || 'update'}... ${data.progress}% (${downloadedMB}/${totalMB} MB)`;
    } else {
      updateStatus.textContent = `Downloading ${data.version || 'update'}...`;
    }
  } else if (data.status === 'ready') {
    updateStatus.textContent = `${data.version} ready - restart to install`;
  } else if (data.status === 'up-to-date') {
    updateStatus.textContent = 'Up to date';
  } else if (data.status === 'error') {
    const errorMsg = data.error ? data.error.substring(0, 60) : 'Unknown error';
    updateStatus.textContent = `Update failed: ${errorMsg}`;
    console.error('[Renderer] Update error:', data.error);
  }
});

// Listen for download reset (called when files are deleted to clear UI state)
if (window.electronAPI.onImageAiDownloadReset) {
  window.electronAPI.onImageAiDownloadReset(() => {
    console.log('[Renderer] Image AI download state reset received');
    // Reset all download-related UI state
    isDownloadingImageAi = false;
    currentImageAiPhase = 'idle';
    
    // Hide progress and paused states
    if (imageAiProgress) {
      imageAiProgress.style.display = 'none';
    }
    if (imageAiPaused) {
      imageAiPaused.style.display = 'none';
    }
    
    // Show download button again (if image AI is enabled)
    if (downloadImageAiBtn && imageAiEnabled && !imageAiInstalled) {
      downloadImageAiBtn.style.display = 'flex';
    }
    
    // Reset status text
    if (imageAiDownloadStatus) {
      imageAiDownloadStatus.textContent = '~4GB - Stable Diffusion';
    }
    
    // Reset progress bar
    if (imageAiProgressFill) {
      imageAiProgressFill.style.width = '0%';
    }
    if (imageAiProgressText) {
      imageAiProgressText.textContent = '0%';
    }
  });
}

// Listen for Ollama setup completion
if (window.electronAPI.onOllamaSetupComplete) {
  window.electronAPI.onOllamaSetupComplete(async () => {
    console.log('[Renderer] Ollama setup complete received');
    // Force refresh status and Ollama UI
    const status = await window.electronAPI.getStatus();
    updateUI(status);
    updateOllamaUI('AI Ready', 0);
  });
}

// Initialize on load
init();
