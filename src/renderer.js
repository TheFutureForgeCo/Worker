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
const benchmarkResultSD15 = document.getElementById('benchmarkResultSD15');
const benchmarkResultSDXL = document.getElementById('benchmarkResultSDXL');
const retryBenchmarkBtn = document.getElementById('retryBenchmarkBtn');
const toggleBenchmarkLogsBtn = document.getElementById('toggleBenchmarkLogsBtn');
const benchmarkLogsContainer = document.getElementById('benchmarkLogsContainer');
const benchmarkLogsContent = document.getElementById('benchmarkLogsContent');
const clearBenchmarkLogsBtn = document.getElementById('clearBenchmarkLogsBtn');
const copyBenchmarkLogsBtn = document.getElementById('copyBenchmarkLogsBtn');

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
const copyLogsBtn = document.getElementById('copyLogsBtn');
const openLogsFolderBtn = document.getElementById('openLogsFolderBtn');
const logsContent = document.getElementById('logsContent');
const logsPath = document.getElementById('logsPath');

// Pages
const mainPage = document.getElementById('mainPage');
const settingsPage = document.getElementById('settingsPage');
const aboutPage = document.getElementById('aboutPage');
const logsPage = document.getElementById('logsPage');
const chatPage = document.getElementById('chatPage');

// DOM Elements - Mode Tab Toggle
const chatTabBtn = document.getElementById('chatTabBtn');
const workerTabBtn = document.getElementById('workerTabBtn');

// DOM Elements - Maximum Privacy Mode (Settings)
const maxPrivacyToggle = document.getElementById('maxPrivacyToggle');
const maxPrivacySwitch = document.getElementById('maxPrivacySwitch');
const privacyModeBanner = document.getElementById('privacyModeBanner');
const openPrivateChatBtn = document.getElementById('openPrivateChatBtn');

// DOM Elements - Local Processing Toggle (Chat)
const localProcessingToggle = document.getElementById('localProcessingToggle');
const localProcessingSwitch = document.getElementById('localProcessingSwitch');
const chatPrivacyBadge = document.getElementById('chatPrivacyBadge');
const chatWelcomeText = document.getElementById('chatWelcomeText');

// DOM Elements - Chat Page
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');
const chatModelSelect = document.getElementById('chatModelSelect');
const chatImageBtn = document.getElementById('chatImageBtn');
const chatClearBtn = document.getElementById('chatClearBtn');
const chatSidebar = document.getElementById('chatSidebar');
const chatSidebarToggle = document.getElementById('chatSidebarToggle');
const chatSidebarList = document.getElementById('chatSidebarList');
const chatNewBtn = document.getElementById('chatNewBtn');
const chatTitle = document.getElementById('chatTitle');

// Chat state
let chatHistory = [];
let conversations = [];
let currentConversationId = null;
let isGeneratingChat = false;
let serverStreamActive = false;
let imageMode = false;
let imageQuality = 'standard'; // 'standard' or 'high' (SDXL-Turbo)
let chatTemperature = 0.7;
let maxPrivacyMode = false;
let localProcessingMode = false;
let currentMode = 'chat'; // 'chat' or 'worker'

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
  [mainPage, settingsPage, aboutPage, logsPage, chatPage].forEach(page => {
    if (page) page.classList.remove('active');
  });
  const targetPage = document.getElementById(pageId);
  if (targetPage) targetPage.classList.add('active');
  
  // Update settings icon state
  settingsBtn.classList.toggle('active', pageId === 'settingsPage');
  
  // Update tab states
  if (chatTabBtn) chatTabBtn.classList.toggle('active', pageId === 'chatPage');
  if (workerTabBtn) workerTabBtn.classList.toggle('active', pageId === 'mainPage');
  
  // Track current mode
  if (pageId === 'chatPage') currentMode = 'chat';
  if (pageId === 'mainPage') currentMode = 'worker';
  
  // Load logs when showing logs page
  if (pageId === 'logsPage') {
    loadLogs();
  }
  
  // Load chat history when showing chat page
  if (pageId === 'chatPage') {
    loadChatHistory();
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
  
  // Load chat history since Chat is now the default page
  loadChatHistory();
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
  
  // Update resource monitor
  if (status.resourceStats) {
    updateResourceMonitor(status.resourceStats, status.aiModelState);
  }
}

// Update resource monitor UI
function updateResourceMonitor(stats, aiState) {
  const cpuBarFill = document.getElementById('cpuBarFill');
  const cpuValue = document.getElementById('cpuValue');
  const gpuRow = document.getElementById('gpuRow');
  const gpuBarFill = document.getElementById('gpuBarFill');
  const gpuValue = document.getElementById('gpuValue');
  const memBarFill = document.getElementById('memBarFill');
  const memValue = document.getElementById('memValue');
  const vramRow = document.getElementById('vramRow');
  const vramBarFill = document.getElementById('vramBarFill');
  const vramValue = document.getElementById('vramValue');
  const aiModelBadge = document.getElementById('aiModelBadge');
  
  if (!cpuBarFill) return;
  
  // CPU
  const cpuPct = Math.round(stats.cpu?.usagePercent || 0);
  cpuBarFill.style.width = cpuPct + '%';
  cpuBarFill.classList.toggle('high', cpuPct > 85);
  cpuValue.textContent = cpuPct + '%';
  
  // Memory
  const memPct = Math.round(stats.memory?.usagePercent || 0);
  memBarFill.style.width = memPct + '%';
  memBarFill.classList.toggle('high', memPct > 85);
  const memUsedGb = (stats.memory?.usedGb || 0).toFixed(1);
  const memTotalGb = (stats.memory?.totalGb || 0).toFixed(1);
  memValue.textContent = memPct + '%';
  memValue.title = memUsedGb + ' / ' + memTotalGb + ' GB';
  
  // GPU vendor info
  const gpuVendorInfo = document.getElementById('gpuVendorInfo');
  
  // GPU (show if available - including estimated-only mode)
  if (stats.gpu) {
    const isEstimated = stats.gpu.estimatedOnly;
    const vendor = stats.gpu.vendor || '';
    const gpuName = stats.gpu.name || '';
    
    // Show vendor info line with GPU name and VRAM tier
    if (gpuVendorInfo) {
      const vramTotal = stats.gpu.vramTotalMb || 0;
      let infoText = gpuName;
      if (vramTotal > 0) {
        const vramGb = (vramTotal / 1024).toFixed(0);
        infoText += ' (' + vramGb + ' GB';
        if (stats.vramTier && stats.vramTier !== 'none') {
          const tierLabels = { tiny: 'Conservative', small: 'Moderate', standard: 'Standard', large: 'Relaxed', huge: 'Maximum', unknown: 'Conservative' };
          infoText += ' \u2022 ' + (tierLabels[stats.vramTier] || stats.vramTier);
        }
        infoText += ')';
      }
      if (isEstimated) infoText += ' [est.]';
      gpuVendorInfo.textContent = infoText;
      gpuVendorInfo.style.display = 'block';
    }
    
    if (isEstimated) {
      // No live usage data - show GPU row but with static info
      gpuRow.style.display = 'flex';
      gpuBarFill.style.width = '0%';
      gpuValue.textContent = '--';
      gpuValue.title = 'Live monitoring not available for ' + vendor + ' GPUs on this system';
      
      // VRAM - show total if known, no usage data
      const vramTotal = stats.gpu.vramTotalMb || 0;
      if (vramTotal > 0) {
        vramRow.style.display = 'flex';
        vramBarFill.style.width = '0%';
        if (vramTotal >= 1024) {
          vramValue.textContent = (vramTotal / 1024).toFixed(0) + ' GB';
          vramValue.title = 'Total VRAM: ' + (vramTotal / 1024).toFixed(1) + ' GB (estimated)';
        } else {
          vramValue.textContent = vramTotal + ' MB';
          vramValue.title = 'Total VRAM: ' + vramTotal + ' MB (estimated)';
        }
      } else {
        vramRow.style.display = 'none';
      }
    } else {
      // Live monitoring available
      gpuRow.style.display = 'flex';
      const gpuPct = Math.round(stats.gpu.usagePercent || 0);
      gpuBarFill.style.width = gpuPct + '%';
      gpuBarFill.classList.toggle('high', gpuPct > 85);
      gpuValue.textContent = gpuPct + '%';
      gpuValue.title = stats.gpu.tempC ? stats.gpu.tempC + '\u00B0C' : '';
      
      // VRAM
      vramRow.style.display = 'flex';
      const vramUsed = stats.gpu.vramUsedMb || 0;
      const vramTotal = stats.gpu.vramTotalMb || 0;
      const vramPct = vramTotal > 0 ? Math.round((vramUsed / vramTotal) * 100) : 0;
      vramBarFill.style.width = vramPct + '%';
      vramBarFill.classList.toggle('high', vramPct > 85);
      if (vramTotal >= 1024) {
        vramValue.textContent = (vramUsed / 1024).toFixed(1) + ' GB';
        vramValue.title = (vramUsed / 1024).toFixed(1) + ' / ' + (vramTotal / 1024).toFixed(1) + ' GB';
      } else {
        vramValue.textContent = vramUsed + ' MB';
        vramValue.title = vramUsed + ' / ' + vramTotal + ' MB';
      }
    }
  } else {
    gpuRow.style.display = 'none';
    vramRow.style.display = 'none';
    if (gpuVendorInfo) gpuVendorInfo.style.display = 'none';
  }
  
  // AI Model Badge
  if (aiState && aiModelBadge) {
    const status = aiState.chatModelStatus || 'unloaded';
    aiModelBadge.className = 'ai-model-badge';
    if (status === 'warm') {
      aiModelBadge.textContent = 'AI: Warm';
      aiModelBadge.classList.add('warm');
    } else if (status === 'active') {
      aiModelBadge.textContent = 'AI: Active';
      aiModelBadge.classList.add('active');
    } else if (status === 'loading') {
      aiModelBadge.textContent = 'AI: Loading';
      aiModelBadge.classList.add('loading');
    } else if (status === 'timed_out') {
      aiModelBadge.textContent = 'AI: Idle';
      aiModelBadge.classList.add('timed-out');
    } else {
      aiModelBadge.textContent = 'AI: --';
    }
  }
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
    
    // Get SDXL benchmark time from status data
    const sdxlBenchmarkTimeMs = data.sdxlBenchmarkTimeMs;
    
    if (imageBenchmarkTimeMs) {
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
      benchmarkResult.textContent = tierText;
      
      // Update individual model benchmark times
      if (benchmarkResultSD15) {
        const sd15Seconds = (imageBenchmarkTimeMs / 1000).toFixed(1);
        benchmarkResultSD15.textContent = `SD 1.5: ${sd15Seconds}s`;
        benchmarkResultSD15.style.color = '#0af';
      }
      if (benchmarkResultSDXL) {
        if (sdxlBenchmarkTimeMs) {
          const sdxlSeconds = (sdxlBenchmarkTimeMs / 1000).toFixed(1);
          benchmarkResultSDXL.textContent = `SDXL-Turbo: ${sdxlSeconds}s`;
          benchmarkResultSDXL.style.color = '#0af';
        } else {
          benchmarkResultSDXL.textContent = 'SDXL-Turbo: Not tested';
          benchmarkResultSDXL.style.color = '#888';
        }
      }
    } else {
      // No benchmark result
      if (imageQualityTier === 'banned') {
        benchmarkResult.textContent = 'Benchmark failed - Using fallback tier';
      } else if (imageQualityTier) {
        benchmarkResult.textContent = `Using fallback: ${imageQualityTier} tier`;
      } else {
        benchmarkResult.textContent = 'Benchmark not run yet';
      }
      
      // Reset individual model displays
      if (benchmarkResultSD15) {
        benchmarkResultSD15.textContent = 'SD 1.5: --';
        benchmarkResultSD15.style.color = '#888';
      }
      if (benchmarkResultSDXL) {
        benchmarkResultSDXL.textContent = 'SDXL-Turbo: --';
        benchmarkResultSDXL.style.color = '#888';
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

// Helper function to strip ANSI escape codes from text
function stripAnsiCodes(text) {
  // Remove ANSI escape sequences (colors, formatting, etc.)
  // Handles both ESC-prefixed sequences and bare bracket sequences from logs
  // eslint-disable-next-line no-control-regex
  return text
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')  // Standard ESC[...X sequences
    .replace(/\x1B\][^\x07]*\x07/g, '')     // OSC sequences (ESC]...BEL)
    .replace(/\[[0-9;]*m/g, '')             // Bare bracket color codes like [0;93m, [1;34m, [39m, [m
    .replace(/\x1B/g, '');                  // Any remaining ESC characters
}

// Copy benchmark logs to clipboard
if (copyBenchmarkLogsBtn) {
  copyBenchmarkLogsBtn.addEventListener('click', async () => {
    if (benchmarkLogsContent && benchmarkLogsContent.textContent) {
      try {
        // Strip ANSI escape codes and copy full text
        const cleanText = stripAnsiCodes(benchmarkLogsContent.textContent);
        await navigator.clipboard.writeText(cleanText);
        const originalText = copyBenchmarkLogsBtn.textContent;
        copyBenchmarkLogsBtn.textContent = 'Copied!';
        copyBenchmarkLogsBtn.style.color = '#0f0';
        setTimeout(() => {
          copyBenchmarkLogsBtn.textContent = originalText;
          copyBenchmarkLogsBtn.style.color = '#0af';
        }, 1500);
      } catch (err) {
        console.error('Failed to copy:', err);
        copyBenchmarkLogsBtn.textContent = 'Failed';
        setTimeout(() => {
          copyBenchmarkLogsBtn.textContent = 'Copy';
          copyBenchmarkLogsBtn.style.color = '#0af';
        }, 1500);
      }
    }
  });
}

// Copy general logs to clipboard
if (copyLogsBtn) {
  copyLogsBtn.addEventListener('click', async () => {
    if (logsContent && logsContent.textContent) {
      try {
        // Strip ANSI escape codes and copy full text
        const cleanText = stripAnsiCodes(logsContent.textContent);
        await navigator.clipboard.writeText(cleanText);
        const originalText = copyLogsBtn.textContent;
        copyLogsBtn.innerHTML = '&#10003; Copied';
        setTimeout(() => {
          copyLogsBtn.innerHTML = '&#128203; Copy';
        }, 1500);
      } catch (err) {
        console.error('Failed to copy:', err);
        copyLogsBtn.textContent = 'Failed';
        setTimeout(() => {
          copyLogsBtn.innerHTML = '&#128203; Copy';
        }, 1500);
      }
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

// Listen for benchmark complete (single model - for backward compatibility)
if (window.electronAPI.onImageAiBenchmarkComplete) {
  window.electronAPI.onImageAiBenchmarkComplete((data) => {
    console.log('[Renderer] Benchmark complete received:', data);
    isDownloadingImageAi = false;
    currentImageAiPhase = 'idle';
    imageAiProgress.style.display = 'none';
    imageAiInstalled = true;
    
    // Update the benchmark state variables so updateImageAiUI has correct data
    // Handle both old format (single time) and new format (useSDXL flag)
    if (!data.useSDXL) {
      imageBenchmarkTimeMs = data.time;
    }
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
      benchmarkResult.textContent = tierLabels[data.tier] || data.tier;
    }
    
    // Update individual model results based on which model was tested
    const seconds = (data.time / 1000).toFixed(1);
    if (data.useSDXL) {
      if (benchmarkResultSDXL) {
        benchmarkResultSDXL.textContent = `SDXL-Turbo: ${seconds}s`;
        benchmarkResultSDXL.style.color = '#0af';
      }
    } else {
      if (benchmarkResultSD15) {
        benchmarkResultSD15.textContent = `SD 1.5: ${seconds}s`;
        benchmarkResultSD15.style.color = '#0af';
      }
    }
    
    // Update the status text to reflect the tier
    if (imageAiStatus && imageAiEnabled) {
      imageAiStatus.textContent = `Enabled - ${data.tier} tier`;
    }
    
    // Show re-run benchmark button and logs button after single benchmark completes
    if (retryBenchmarkBtn) {
      retryBenchmarkBtn.style.display = 'inline-block';
      retryBenchmarkBtn.disabled = false;
      retryBenchmarkBtn.textContent = 'Re-run';
    }
    if (toggleBenchmarkLogsBtn) {
      toggleBenchmarkLogsBtn.style.display = 'inline-block';
    }
  });
}

// Listen for dual benchmark complete (both SD 1.5 and SDXL)
if (window.electronAPI.onImageAiDualBenchmarkComplete) {
  window.electronAPI.onImageAiDualBenchmarkComplete((data) => {
    console.log('[Renderer] Dual benchmark complete received:', data);
    isDownloadingImageAi = false;
    currentImageAiPhase = 'idle';
    imageAiProgress.style.display = 'none';
    imageAiInstalled = true;
    
    // Update state variables
    imageBenchmarkTimeMs = data.sd15Time;
    imageQualityTier = data.tier;
    
    if (downloadImageAiBtn) {
      downloadImageAiBtn.style.display = 'none';
    }
    if (uninstallImageAiBtn) {
      uninstallImageAiBtn.style.display = 'flex';
    }
    
    // Show benchmark status section
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
      benchmarkResult.textContent = tierLabels[data.tier] || data.tier;
    }
    
    // Update both model results
    if (benchmarkResultSD15 && data.sd15Time) {
      const sd15Seconds = (data.sd15Time / 1000).toFixed(1);
      benchmarkResultSD15.textContent = `SD 1.5: ${sd15Seconds}s`;
      benchmarkResultSD15.style.color = '#0af';
    }
    if (benchmarkResultSDXL) {
      if (data.sdxlTime) {
        const sdxlSeconds = (data.sdxlTime / 1000).toFixed(1);
        benchmarkResultSDXL.textContent = `SDXL-Turbo: ${sdxlSeconds}s`;
        benchmarkResultSDXL.style.color = '#0af';
      } else {
        benchmarkResultSDXL.textContent = 'SDXL-Turbo: Failed';
        benchmarkResultSDXL.style.color = '#f44';
      }
    }
    
    // Update the status text
    if (imageAiStatus && imageAiEnabled) {
      imageAiStatus.textContent = `Enabled - ${data.tier} tier`;
    }
    
    // Show re-run benchmark button after benchmark completes
    if (retryBenchmarkBtn) {
      retryBenchmarkBtn.style.display = 'inline-block';
      retryBenchmarkBtn.disabled = false;
      retryBenchmarkBtn.textContent = 'Re-run';
    }
    if (toggleBenchmarkLogsBtn) {
      toggleBenchmarkLogsBtn.style.display = 'inline-block';
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
      // Show shortened error in status, point user to logs for full details
      const shortError = error.length > 80 ? error.substring(0, 80) + '...' : error;
      imageAiDownloadStatus.textContent = `Benchmark failed - See logs for details`;
      imageAiDownloadStatus.style.color = '#f44';
    }
    
    // Add full error to benchmark logs for easy copying
    if (benchmarkLogsContent) {
      benchmarkLogsContent.textContent += '\n=== FULL ERROR ===\n' + error + '\n==================\n';
      benchmarkLogsContent.scrollTop = benchmarkLogsContent.scrollHeight;
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
    // Auto-show logs panel when error occurs
    if (benchmarkLogsContainer) {
      benchmarkLogsContainer.style.display = 'block';
    }
    if (toggleBenchmarkLogsBtn) {
      toggleBenchmarkLogsBtn.textContent = 'Hide';
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

// ========== MAXIMUM PRIVACY MODE & LOCAL CHAT ==========

// Update privacy mode UI
async function updatePrivacyModeUI() {
  try {
    maxPrivacyMode = await window.electronAPI.getMaxPrivacyMode();
    
    // Update toggle switch
    if (maxPrivacySwitch) {
      maxPrivacySwitch.classList.toggle('active', maxPrivacyMode);
    }
    
    // Show/hide privacy banner on main page
    if (privacyModeBanner) {
      privacyModeBanner.classList.toggle('visible', maxPrivacyMode);
    }
    
    // Show/hide chat button in header
    if (chatBtn) {
      chatBtn.style.display = maxPrivacyMode ? 'flex' : 'none';
    }
    
    // Disable network features in max privacy mode
    if (onlineToggleBtn) {
      onlineToggleBtn.disabled = maxPrivacyMode;
      if (maxPrivacyMode) {
        onlineToggleBtn.title = 'Disabled in Maximum Privacy Mode';
      } else {
        onlineToggleBtn.title = '';
      }
    }
    
    // Force local processing mode when max privacy is enabled
    if (maxPrivacyMode && !localProcessingMode) {
      localProcessingMode = true;
      if (localProcessingSwitch) localProcessingSwitch.classList.add('active');
      if (localProcessingToggle) localProcessingToggle.classList.add('active');
      if (chatPrivacyBadge) chatPrivacyBadge.style.display = 'flex';
      if (chatModelSelect) chatModelSelect.style.display = 'block';
      if (chatImageBtn) chatImageBtn.style.display = 'inline-flex';
    }
  } catch (err) {
    console.error('Failed to update privacy mode UI:', err);
  }
}

// Toggle maximum privacy mode
if (maxPrivacyToggle) {
  maxPrivacyToggle.addEventListener('click', async () => {
    const newValue = !maxPrivacyMode;
    
    // If turning OFF maximum privacy mode, warn user about local chat deletion
    if (!newValue && conversations.length > 0) {
      const confirmDelete = confirm(
        'Disabling Maximum Privacy Mode will delete all local conversations for your privacy. Continue?'
      );
      if (!confirmDelete) {
        return;
      }
      // Delete all local conversations
      conversations = [];
      chatHistory = [];
      currentConversationId = null;
      await window.electronAPI.saveLocalConversations([]);
      renderChatMessages();
      renderSidebar();
    }
    
    await window.electronAPI.setMaxPrivacyMode(newValue);
    await updatePrivacyModeUI();
    
    // If turning on max privacy and worker is online, go offline
    if (newValue && isOnline) {
      await window.electronAPI.toggleOnline();
      const status = await window.electronAPI.getStatus();
      updateUI(status);
    }
  });
}

// Mode tab toggle - Chat tab
if (chatTabBtn) {
  chatTabBtn.addEventListener('click', () => showPage('chatPage'));
}

// Mode tab toggle - Worker tab
if (workerTabBtn) {
  workerTabBtn.addEventListener('click', () => showPage('mainPage'));
}

// Local Processing Toggle in Chat
if (localProcessingToggle) {
  localProcessingToggle.addEventListener('click', async () => {
    localProcessingMode = !localProcessingMode;
    
    // Update UI
    if (localProcessingSwitch) {
      localProcessingSwitch.classList.toggle('active', localProcessingMode);
    }
    if (localProcessingToggle) {
      localProcessingToggle.classList.toggle('active', localProcessingMode);
    }
    if (chatPrivacyBadge) {
      chatPrivacyBadge.style.display = localProcessingMode ? 'flex' : 'none';
    }
    if (chatWelcomeText) {
      chatWelcomeText.textContent = localProcessingMode 
        ? 'Your conversations are 100% local. Nothing is sent to any server.'
        : 'Chat with AI powered by the ComputeGrid network. Toggle Local Processing for 100% offline mode.';
    }
    
    // Show/hide model selector, image button, and temperature control based on mode
    if (chatModelSelect) {
      chatModelSelect.style.display = localProcessingMode ? 'block' : 'none';
    }
    if (chatImageBtn) {
      chatImageBtn.style.display = localProcessingMode ? 'inline-flex' : 'none';
    }
    const tempControl = document.getElementById('chatTemperatureControl');
    if (tempControl) {
      tempControl.style.display = (localProcessingMode && !imageMode) ? 'flex' : 'none';
    }
    
    // Update chat title to reflect mode
    const chatTitle = document.querySelector('.chat-title');
    if (chatTitle) {
      chatTitle.textContent = localProcessingMode ? 'AI Chat (Local)' : 'AI Chat';
    }
    
    console.log('Local Processing Mode:', localProcessingMode ? 'ON' : 'OFF');
  });
}

// Open private chat button (from privacy banner on worker page)
if (openPrivateChatBtn) {
  openPrivateChatBtn.addEventListener('click', () => {
    localProcessingMode = true;
    if (localProcessingSwitch) localProcessingSwitch.classList.add('active');
    if (localProcessingToggle) localProcessingToggle.classList.add('active');
    if (chatPrivacyBadge) chatPrivacyBadge.style.display = 'flex';
    showPage('chatPage');
  });
}

// Load chat history from local storage
async function loadChatHistory() {
  try {
    const loadedConversations = await window.electronAPI.loadLocalConversations();
    
    // Handle migration from old format (array of messages) to new format (array of conversations)
    if (Array.isArray(loadedConversations) && loadedConversations.length > 0) {
      if (loadedConversations[0].role) {
        // Old format - migrate to new format
        conversations = [{
          id: 'conv_migrated',
          title: 'Previous Chat',
          messages: loadedConversations,
          createdAt: new Date().toISOString()
        }];
        currentConversationId = 'conv_migrated';
        chatHistory = loadedConversations;
      } else if (loadedConversations[0].id) {
        // New format
        conversations = loadedConversations;
        if (conversations.length > 0) {
          currentConversationId = conversations[0].id;
          chatHistory = conversations[0].messages || [];
        }
      }
    } else {
      conversations = [];
      chatHistory = [];
    }
    
    renderChatMessages();
    renderSidebar();
    
    // Re-add thinking indicator if still generating (user switched tabs and came back)
    if (isGeneratingChat) {
      addThinkingIndicator();
    }
  } catch (err) {
    console.error('Failed to load chat history:', err);
    conversations = [];
    chatHistory = [];
  }
}

// Save chat history to local storage (wrapper for compatibility)
async function saveChatHistory() {
  await saveAllConversations();
}

// Render chat messages
function renderChatMessages() {
  if (!chatMessages) return;
  
  const welcomeTitle = localProcessingMode ? 'Private AI Assistant' : 'AI Assistant';
  const welcomeText = localProcessingMode 
    ? 'Your conversations are 100% local. Nothing is sent to any server. Start chatting!'
    : 'Chat with AI powered by the ComputeGrid network. Toggle Local Processing for 100% offline mode.';
  
  if (chatHistory.length === 0) {
    chatMessages.innerHTML = `
      <div class="chat-welcome">
        <div class="chat-welcome-icon">🤖</div>
        <div class="chat-welcome-title">${welcomeTitle}</div>
        <div class="chat-welcome-text">${welcomeText}</div>
      </div>
    `;
    return;
  }
  
  chatMessages.innerHTML = chatHistory.map((msg, idx) => {
    const imageHtml = msg.image 
      ? `<div class="chat-message-image-wrapper">
          <img class="chat-message-image" src="file://${msg.image}" alt="Generated image">
          <button class="chat-image-download" data-path="${msg.image}" title="Save image">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
        </div>` 
      : '';
    
    return `
    <div class="chat-message ${msg.role}" data-idx="${idx}">
      <div class="chat-message-avatar">${msg.role === 'user' ? '👤' : '🤖'}</div>
      <div class="chat-message-content">
        ${formatChatContent(msg.content)}
        ${imageHtml}
      </div>
      <button class="chat-message-delete" data-idx="${idx}" title="Delete message">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
        </svg>
      </button>
    </div>`;
  }).join('');
  
  // Add delete handlers
  chatMessages.querySelectorAll('.chat-message-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      deleteMessage(idx);
    });
  });
  
  // Add right-click context menu on messages
  chatMessages.querySelectorAll('.chat-message').forEach(msgEl => {
    msgEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const idx = parseInt(msgEl.dataset.idx);
      showMessageContextMenu(e.clientX, e.clientY, idx);
    });
  });
  
  // Add image download handlers
  chatMessages.querySelectorAll('.chat-image-download').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const imagePath = btn.dataset.path;
      try {
        const result = await window.electronAPI.saveImageToDownloads(imagePath);
        if (result.success) {
          showToast('Image saved to Downloads');
        } else {
          showToast('Failed to save image');
        }
      } catch (err) {
        console.error('Failed to save image:', err);
        showToast('Failed to save image');
      }
    });
  });
  
  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Show context menu for a message
function showMessageContextMenu(x, y, idx) {
  // Remove any existing context menu
  const existing = document.querySelector('.chat-context-menu');
  if (existing) existing.remove();
  
  const msg = chatHistory[idx];
  if (!msg) return;
  
  const menu = document.createElement('div');
  menu.className = 'chat-context-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  
  let menuItems = '';
  
  // Copy text option
  menuItems += `
    <button class="chat-context-menu-item" data-action="copy">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2"></rect>
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
      </svg>
      Copy text
    </button>`;
  
  // Save image option (if message has an image)
  if (msg.image) {
    menuItems += `
      <button class="chat-context-menu-item" data-action="save-image">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Save image
      </button>`;
  }
  
  // Delete option
  menuItems += `
    <button class="chat-context-menu-item danger" data-action="delete">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
      </svg>
      Delete message
    </button>`;
  
  menu.innerHTML = menuItems;
  document.body.appendChild(menu);
  
  // Keep menu in viewport
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${window.innerWidth - rect.width - 8}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${window.innerHeight - rect.height - 8}px`;
  }
  
  // Handle menu item clicks
  menu.querySelectorAll('.chat-context-menu-item').forEach(item => {
    item.addEventListener('click', async () => {
      const action = item.dataset.action;
      menu.remove();
      
      if (action === 'copy') {
        try {
          await navigator.clipboard.writeText(msg.content || '');
          showToast('Copied to clipboard');
        } catch (err) {
          console.error('Copy failed:', err);
        }
      } else if (action === 'save-image' && msg.image) {
        try {
          const result = await window.electronAPI.saveImageToDownloads(msg.image);
          if (result.success) {
            showToast('Image saved to Downloads');
          } else {
            showToast('Failed to save image');
          }
        } catch (err) {
          showToast('Failed to save image');
        }
      } else if (action === 'delete') {
        deleteMessage(idx);
      }
    });
  });
  
  // Close menu on click outside
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };
  setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

// Show a toast notification
function showToast(message) {
  // Remove existing toast
  const existing = document.querySelector('.chat-toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = 'chat-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });
  
  // Auto-dismiss
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// Delete a single message
function deleteMessage(idx) {
  if (idx < 0 || idx >= chatHistory.length) return;
  chatHistory.splice(idx, 1);
  renderChatMessages();
  saveChatHistory();
}

// Format chat content (handle code blocks, etc.)
function formatChatContent(content) {
  if (!content) return '';
  
  // Escape HTML
  let formatted = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Handle code blocks
  formatted = formatted.replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>');
  
  // Handle inline code
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Handle line breaks
  formatted = formatted.replace(/\n/g, '<br>');
  
  return formatted;
}

// Add thinking indicator
function addThinkingIndicator() {
  // Don't add duplicate thinking indicators
  if (document.getElementById('chatThinking')) return;
  
  const thinkingHtml = `
    <div class="chat-message assistant" id="chatThinking">
      <div class="chat-message-avatar">🤖</div>
      <div class="chat-message-content">
        <div class="chat-thinking">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>
  `;
  chatMessages.insertAdjacentHTML('beforeend', thinkingHtml);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Remove thinking indicator
function removeThinkingIndicator() {
  const thinking = document.getElementById('chatThinking');
  if (thinking) thinking.remove();
}

// Send chat message
async function sendChatMessage() {
  const message = chatInput.value.trim();
  if (!message || isGeneratingChat) return;
  
  isGeneratingChat = true;
  chatSendBtn.disabled = true;
  chatInput.value = '';
  
  // Add user message to history
  chatHistory.push({ role: 'user', content: message });
  renderChatMessages();
  
  // Add thinking indicator
  addThinkingIndicator();
  
  try {
    const model = chatModelSelect.value;
    
    if (imageMode) {
      // Generate image (always local for now)
      const imgOptions = {};
      const negPromptEl = document.getElementById('imgNegativePrompt');
      const stepsEl = document.getElementById('imgSteps');
      const guidanceEl = document.getElementById('imgGuidance');
      const aspectEl = document.getElementById('imgAspectRatio');
      const seedEl = document.getElementById('imgSeed');
      
      if (negPromptEl && negPromptEl.value.trim()) imgOptions.negativePrompt = negPromptEl.value.trim();
      if (aspectEl) imgOptions.aspectRatio = aspectEl.value;
      if (seedEl && seedEl.value) imgOptions.seed = parseInt(seedEl.value);
      
      // SDXL-Turbo requires guidance_scale=0.0 and 1-4 steps - enforce limits
      if (imageQuality === 'high') {
        imgOptions.steps = Math.min(Math.max(parseInt(stepsEl?.value || 4), 1), 4);
        imgOptions.guidanceScale = 0.0;
      } else {
        if (stepsEl) imgOptions.steps = parseInt(stepsEl.value);
        if (guidanceEl) imgOptions.guidanceScale = parseFloat(guidanceEl.value);
      }
      
      const result = await window.electronAPI.localImageGenerate(message, imageQuality, imgOptions);
      removeThinkingIndicator();
      
      if (result.success) {
        const notes = [];
        if (result.used_tiling) notes.push('tiled generation');
        if (result.sdxl_fallback_to_sd15) notes.push('used standard quality - high quality model too large for your GPU');
        const noteStr = notes.length > 0 ? ` (${notes.join(', ')})` : '';
        chatHistory.push({ role: 'assistant', content: `Here's your generated image${noteStr}:`, image: result.path });
        resetImageSettingsToDefaults();
      } else {
        chatHistory.push({ role: 'assistant', content: `Failed to generate image: ${parseImageError(result.error)}` });
      }
    } else if (localProcessingMode) {
      // Local Processing Mode: Use local Ollama
      const conversationForOllama = chatHistory.slice(-10);
      const localResult = await window.electronAPI.localChatStream(message, model, conversationForOllama.slice(0, -1), {
        temperature: chatTemperature
      });
      if (localResult && !localResult.success) {
        removeThinkingIndicator();
        const streamingEl = document.getElementById('chatStreaming');
        if (streamingEl) streamingEl.remove();
        let errorMsg = localResult.error || 'Unknown error';
        if (errorMsg.includes('fetch') || errorMsg.includes('ECONNREFUSED')) {
          errorMsg = 'Could not connect to local AI. Make sure Ollama is running and try again.';
        }
        chatHistory.push({ role: 'assistant', content: errorMsg });
        renderChatMessages();
      }
    } else {
      // Server Mode: Use ComputeGrid network API with streaming
      // The main process sends local-chat-token events during streaming,
      // which are handled by the global onLocalChatToken listener.
      // Set up a flag so the token handler knows we're in server-stream mode.
      serverStreamActive = true;
      try {
        const result = await window.electronAPI.serverChatSend(message, chatHistory.slice(-10));
        serverStreamActive = false;
        removeThinkingIndicator();
        
        if (result.success) {
          // If streaming already populated the last message, just update content
          const lastMsg = chatHistory[chatHistory.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && lastMsg._streaming) {
            lastMsg.content = result.content;
            delete lastMsg._streaming;
          } else if (!lastMsg || lastMsg.role !== 'assistant') {
            chatHistory.push({ role: 'assistant', content: result.content });
          }
        } else {
          console.log('Server chat failed, falling back to local:', result.error);
          chatHistory.push({ role: 'assistant', content: `Server error: ${result.error}. Enable Local Processing for offline mode.` });
        }
        renderChatMessages();
      } catch (serverErr) {
        serverStreamActive = false;
        removeThinkingIndicator();
        chatHistory.push({ role: 'assistant', content: `Network error. Enable Local Processing for offline mode.` });
        renderChatMessages();
      }
    }
  } catch (err) {
    removeThinkingIndicator();
    chatHistory.push({ role: 'assistant', content: `Error: ${err.message}` });
    renderChatMessages();
  }
  
  isGeneratingChat = false;
  chatSendBtn.disabled = false;
  await saveChatHistory();
}

// Chat send button
if (chatSendBtn) {
  chatSendBtn.addEventListener('click', sendChatMessage);
}

// Chat input enter key
if (chatInput) {
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
  
  // Auto-resize textarea
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  });
}

// Toggle image mode
const imageQualityToggle = document.getElementById('imageQualityToggle');
const qualityStandard = document.getElementById('qualityStandard');
const qualityHigh = document.getElementById('qualityHigh');

function updateQualitySelection(quality) {
  imageQuality = quality;
  
  // Update UI
  if (qualityStandard && qualityHigh) {
    qualityStandard.classList.toggle('selected', quality === 'standard');
    qualityHigh.classList.toggle('selected', quality === 'high');
    qualityStandard.querySelector('.quality-radio').classList.toggle('selected', quality === 'standard');
    qualityHigh.querySelector('.quality-radio').classList.toggle('selected', quality === 'high');
  }
  
  // Update advanced control defaults for the selected quality
  if (typeof updateImageControlDefaults === 'function') {
    updateImageControlDefaults(quality);
  }
}

if (qualityStandard) {
  qualityStandard.addEventListener('click', () => updateQualitySelection('standard'));
}

if (qualityHigh) {
  qualityHigh.addEventListener('click', () => updateQualitySelection('high'));
}

if (chatImageBtn) {
  chatImageBtn.addEventListener('click', () => {
    imageMode = !imageMode;
    chatImageBtn.classList.toggle('active', imageMode);
    chatInput.placeholder = imageMode ? 'Describe the image you want...' : 'Type a message...';
    
    // Show/hide quality toggle when image mode is active
    if (imageQualityToggle) {
      imageQualityToggle.style.display = imageMode ? 'flex' : 'none';
    }
    
    // Show/hide advanced toggle, assistant button, enhance button, and temperature control
    const advToggle = document.getElementById('imageAdvancedToggle');
    const advPanel = document.getElementById('imageAdvancedPanel');
    const tempControl = document.getElementById('chatTemperatureControl');
    const assistBtn = document.getElementById('imageAssistantBtn');
    const assistPanel = document.getElementById('imageAssistantPanel');
    const enhPromptBtn = document.getElementById('enhancePromptBtn');
    if (advToggle) advToggle.style.display = imageMode ? 'flex' : 'none';
    if (assistBtn) assistBtn.style.display = imageMode ? 'flex' : 'none';
    if (enhPromptBtn) enhPromptBtn.style.display = imageMode ? 'flex' : 'none';
    if (!imageMode) {
      if (advPanel) advPanel.classList.remove('visible');
      if (advToggle) advToggle.classList.remove('active');
      if (assistPanel) assistPanel.classList.remove('visible');
      if (assistBtn) assistBtn.classList.remove('active');
    }
    if (tempControl) tempControl.style.display = imageMode ? 'none' : (localProcessingMode ? 'flex' : 'none');
  });
}

// Temperature slider
const chatTempSlider = document.getElementById('chatTemperature');
const chatTempValue = document.getElementById('chatTempValue');
if (chatTempSlider) {
  chatTempSlider.addEventListener('input', () => {
    chatTemperature = parseFloat(chatTempSlider.value);
    if (chatTempValue) chatTempValue.textContent = chatTemperature.toFixed(1);
  });
}

// Image advanced toggle
const imgAdvToggle = document.getElementById('imageAdvancedToggle');
const imgAdvPanel = document.getElementById('imageAdvancedPanel');
if (imgAdvToggle) {
  imgAdvToggle.addEventListener('click', () => {
    imgAdvToggle.classList.toggle('active');
    if (imgAdvPanel) imgAdvPanel.classList.toggle('visible');
  });
}

// Image steps slider
const imgStepsSlider = document.getElementById('imgSteps');
const imgStepsValue = document.getElementById('imgStepsValue');
if (imgStepsSlider) {
  imgStepsSlider.addEventListener('input', () => {
    if (imgStepsValue) imgStepsValue.textContent = imgStepsSlider.value;
  });
}

// Image guidance slider
const imgGuidanceSlider = document.getElementById('imgGuidance');
const imgGuidanceValue = document.getElementById('imgGuidanceValue');
if (imgGuidanceSlider) {
  imgGuidanceSlider.addEventListener('input', () => {
    if (imgGuidanceValue) imgGuidanceValue.textContent = parseFloat(imgGuidanceSlider.value).toFixed(1);
  });
}

// Update defaults when quality changes
function updateImageControlDefaults(quality) {
  if (quality === 'high') {
    // SDXL-Turbo: max 4 steps, guidance must be 0
    if (imgStepsSlider) { imgStepsSlider.value = 4; imgStepsSlider.max = 4; imgStepsSlider.min = 1; if (imgStepsValue) imgStepsValue.textContent = '4'; }
    if (imgGuidanceSlider) { imgGuidanceSlider.value = 0; imgGuidanceSlider.disabled = true; if (imgGuidanceValue) imgGuidanceValue.textContent = '0.0'; }
  } else {
    // SD 1.5: up to 50 steps, adjustable guidance
    if (imgStepsSlider) { imgStepsSlider.value = 35; imgStepsSlider.max = 50; imgStepsSlider.min = 5; if (imgStepsValue) imgStepsValue.textContent = '35'; }
    if (imgGuidanceSlider) { imgGuidanceSlider.value = 7.5; imgGuidanceSlider.disabled = false; if (imgGuidanceValue) imgGuidanceValue.textContent = '7.5'; }
  }
}

// ============ IMAGE ASSISTANT ============

let imageAssistantHistory = [];
let isAssistantThinking = false;

// Image Assistant toggle button
const imageAssistantBtn = document.getElementById('imageAssistantBtn');
const imageAssistantPanel = document.getElementById('imageAssistantPanel');
const imageAssistantClose = document.getElementById('imageAssistantClose');
const imageAssistantInput = document.getElementById('imageAssistantInput');
const imageAssistantSend = document.getElementById('imageAssistantSend');
const imageAssistantMessages = document.getElementById('imageAssistantMessages');

function toggleImageAssistant(show) {
  if (imageAssistantPanel) {
    imageAssistantPanel.classList.toggle('visible', show);
  }
  if (imageAssistantBtn) {
    imageAssistantBtn.classList.toggle('active', show);
  }
  if (show && imageAssistantInput) {
    imageAssistantInput.focus();
  }
}

if (imageAssistantBtn) {
  imageAssistantBtn.addEventListener('click', () => {
    const isVisible = imageAssistantPanel?.classList.contains('visible');
    toggleImageAssistant(!isVisible);
  });
}

if (imageAssistantClose) {
  imageAssistantClose.addEventListener('click', () => {
    toggleImageAssistant(false);
  });
}

function addAssistantMessage(role, text) {
  if (!imageAssistantMessages) return;
  const div = document.createElement('div');
  div.className = `ia-msg ${role}`;
  div.textContent = text;
  imageAssistantMessages.appendChild(div);
  imageAssistantMessages.scrollTop = imageAssistantMessages.scrollHeight;
}

function showAssistantThinking() {
  if (!imageAssistantMessages) return;
  const div = document.createElement('div');
  div.className = 'ia-thinking';
  div.id = 'iaThinking';
  div.innerHTML = '<span></span><span></span><span></span>';
  imageAssistantMessages.appendChild(div);
  imageAssistantMessages.scrollTop = imageAssistantMessages.scrollHeight;
}

function removeAssistantThinking() {
  const el = document.getElementById('iaThinking');
  if (el) el.remove();
}

function getCurrentImageSettings() {
  return {
    prompt: chatInput?.value || '',
    negative_prompt: document.getElementById('imgNegativePrompt')?.value || '',
    steps: parseInt(document.getElementById('imgSteps')?.value || '35'),
    guidance_scale: parseFloat(document.getElementById('imgGuidance')?.value || '7.5'),
    aspect_ratio: document.getElementById('imgAspectRatio')?.value || '1:1',
    seed: document.getElementById('imgSeed')?.value || '',
    quality: imageQuality
  };
}

function applyImageSettings(settings) {
  if (!settings) return;
  
  const applied = [];
  
  // Normalize keys: accept both snake_case and camelCase
  const s = {};
  for (const [k, v] of Object.entries(settings)) {
    s[k] = v;
    if (k === 'guidance_scale') s.guidanceScale = v;
    if (k === 'guidanceScale') s.guidance_scale = v;
    if (k === 'negative_prompt') s.negativePrompt = v;
    if (k === 'negativePrompt') s.negative_prompt = v;
    if (k === 'aspect_ratio') s.aspectRatio = v;
    if (k === 'aspectRatio') s.aspect_ratio = v;
    if (k === 'num_steps') s.steps = v;
    if (k === 'inference_steps') s.steps = v;
  }
  
  // Apply quality FIRST so that steps/guidance limits are correct
  if (s.quality && (s.quality === 'standard' || s.quality === 'high')) {
    updateQualitySelection(s.quality);
    applied.push(`Quality: ${s.quality}`);
  }
  
  // Apply prompt
  if (s.prompt && chatInput) {
    chatInput.value = s.prompt;
    chatInput.style.height = 'auto';
    chatInput.style.height = chatInput.scrollHeight + 'px';
    applied.push('Prompt');
  }
  
  // Apply negative prompt
  const negVal = s.negative_prompt || s.negativePrompt;
  if (negVal) {
    const negEl = document.getElementById('imgNegativePrompt');
    if (negEl) {
      negEl.value = negVal;
      applied.push('Negative prompt');
    }
  }
  
  // Apply steps - use the currently active quality (may have just changed above)
  if (s.steps != null) {
    const stepsEl = document.getElementById('imgSteps');
    const stepsValEl = document.getElementById('imgStepsValue');
    if (stepsEl) {
      const isHigh = imageQuality === 'high';
      const minSteps = isHigh ? 1 : 5;
      const maxSteps = isHigh ? 4 : 50;
      const val = Math.min(Math.max(parseInt(s.steps), minSteps), maxSteps);
      stepsEl.value = val;
      if (stepsValEl) stepsValEl.textContent = val;
      applied.push(`Steps: ${val}`);
    }
  }
  
  // Apply guidance (SDXL-Turbo must stay at 0)
  const guidanceVal = s.guidance_scale != null ? s.guidance_scale : s.guidanceScale;
  if (guidanceVal != null) {
    const guidanceEl = document.getElementById('imgGuidance');
    const guidanceValEl = document.getElementById('imgGuidanceValue');
    if (guidanceEl && !guidanceEl.disabled) {
      guidanceEl.value = guidanceVal;
      if (guidanceValEl) guidanceValEl.textContent = parseFloat(guidanceVal).toFixed(1);
      applied.push(`Guidance: ${parseFloat(guidanceVal).toFixed(1)}`);
    }
  }
  
  // Apply aspect ratio
  const aspectVal = s.aspect_ratio || s.aspectRatio;
  if (aspectVal) {
    const aspectEl = document.getElementById('imgAspectRatio');
    if (aspectEl) {
      const validRatios = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'];
      if (validRatios.includes(aspectVal)) {
        aspectEl.value = aspectVal;
        applied.push(`Aspect ratio: ${aspectVal}`);
      }
    }
  }
  
  // Apply seed
  if (s.seed != null && s.seed !== '') {
    const seedEl = document.getElementById('imgSeed');
    if (seedEl) {
      seedEl.value = s.seed;
      applied.push(`Seed: ${s.seed}`);
    }
  }
  
  // Open advanced panel so user can see the configured settings
  const advPanel = document.getElementById('imageAdvancedPanel');
  const advToggle = document.getElementById('imageAdvancedToggle');
  if (advPanel && !advPanel.classList.contains('visible')) {
    advPanel.classList.add('visible');
    if (advToggle) advToggle.classList.add('active');
  }
  
  // Show a system message confirming which settings were applied
  const summary = applied.length > 0 
    ? `Settings applied: ${applied.join(', ')}. Review them below and hit Send to generate.`
    : 'Settings applied! Review them below and hit Send to generate.';
  addAssistantMessage('system', summary);
}

function resetImageSettingsToDefaults() {
  const negEl = document.getElementById('imgNegativePrompt');
  const stepsEl = document.getElementById('imgSteps');
  const stepsValEl = document.getElementById('imgStepsValue');
  const guidanceEl = document.getElementById('imgGuidance');
  const guidanceValEl = document.getElementById('imgGuidanceValue');
  const aspectEl = document.getElementById('imgAspectRatio');
  const seedEl = document.getElementById('imgSeed');
  
  if (negEl) negEl.value = '';
  if (seedEl) seedEl.value = '';
  if (aspectEl) aspectEl.value = '1:1';
  
  if (imageQuality === 'high') {
    if (stepsEl) stepsEl.value = 4;
    if (stepsValEl) stepsValEl.textContent = '4';
    if (guidanceEl) guidanceEl.value = 0;
    if (guidanceValEl) guidanceValEl.textContent = '0.0';
  } else {
    if (stepsEl) stepsEl.value = 20;
    if (stepsValEl) stepsValEl.textContent = '20';
    if (guidanceEl) guidanceEl.value = 7.5;
    if (guidanceValEl) guidanceValEl.textContent = '7.5';
  }
}

function parseImageError(rawError) {
  if (!rawError) return 'Unknown error';
  const err = String(rawError);
  if (err.includes('out of memory') || err.includes('OOM') || err.includes('CUDA out of memory') || err.includes('bad allocation')) {
    return 'GPU ran out of memory. Try a smaller image size or fewer steps.';
  }
  if (err.includes('ENOENT') || err.includes('No such file')) {
    return 'Image generation script not found. Try reinstalling the app.';
  }
  if (err.includes('model') && err.includes('not found')) {
    return 'AI model not downloaded yet. Go to Settings and run the benchmark first.';
  }
  if (err.includes('timeout') || err.includes('timed out')) {
    return 'Generation timed out. Try fewer steps or a simpler prompt.';
  }
  if (err.includes('Python') && err.includes('not found')) {
    return 'Python environment not set up. Try reinstalling the app.';
  }
  if (err.includes('the parameter is incorrect') || err.includes('non-zero status code returned while running')) {
    return 'GPU driver error during generation. The image size may be too large for your GPU. Try a smaller size.';
  }
  if (err.includes('onnxruntime') || err.includes('ort')) {
    return 'ONNX Runtime error. Try restarting the app or switching to CPU mode.';
  }
  const cleanErr = err.replace(/^Error:\s*/i, '').replace(/\n[\s\S]*/m, '').trim();
  return cleanErr.length > 200 ? cleanErr.substring(0, 200) + '...' : cleanErr;
}

async function sendAssistantMessage() {
  const msg = imageAssistantInput?.value?.trim();
  if (!msg || isAssistantThinking) return;
  
  isAssistantThinking = true;
  if (imageAssistantSend) imageAssistantSend.disabled = true;
  
  // Add user message
  addAssistantMessage('user', msg);
  imageAssistantHistory.push({ role: 'user', content: msg });
  imageAssistantInput.value = '';
  
  // Show thinking
  showAssistantThinking();
  
  try {
    const currentSettings = getCurrentImageSettings();
    const result = await window.electronAPI.imageAssistantChat(msg, imageAssistantHistory, currentSettings);
    
    removeAssistantThinking();
    
    if (result.success) {
      addAssistantMessage('assistant', result.message);
      imageAssistantHistory.push({ role: 'assistant', content: result.message });
      
      if (result.settings) {
        applyImageSettings(result.settings);
      }
    } else {
      addAssistantMessage('assistant', `Sorry, I couldn't process that: ${result.error}`);
    }
  } catch (err) {
    removeAssistantThinking();
    addAssistantMessage('assistant', 'Something went wrong. Make sure Ollama is running.');
  }
  
  isAssistantThinking = false;
  if (imageAssistantSend) imageAssistantSend.disabled = false;
  if (imageAssistantInput) imageAssistantInput.focus();
}

if (imageAssistantSend) {
  imageAssistantSend.addEventListener('click', sendAssistantMessage);
}

if (imageAssistantInput) {
  imageAssistantInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendAssistantMessage();
    }
  });
}

// ============ PER-FIELD ENHANCE BUTTONS ============

const enhancePromptBtn = document.getElementById('enhancePromptBtn');
const enhanceNegPromptBtn = document.getElementById('enhanceNegPromptBtn');

async function enhanceField(fieldName, inputEl, btn) {
  if (!inputEl || !btn) return;
  
  const currentValue = inputEl.value?.trim();
  if (!currentValue && fieldName === 'prompt') {
    showToast('Type something in the prompt first', 'warning');
    return;
  }
  
  btn.disabled = true;
  btn.classList.add('enhancing');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<svg class="sparkle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.4 7.4H22l-6.2 4.5L18.2 22 12 17.5 5.8 22l2.4-8.1L2 9.4h7.6z"/></svg> Working...';
  
  try {
    const context = { prompt: chatInput?.value || '' };
    const result = await window.electronAPI.enhanceField(fieldName, currentValue, context);
    
    if (result.success && result.enhanced) {
      inputEl.value = result.enhanced;
      if (inputEl.tagName === 'TEXTAREA') {
        inputEl.style.height = 'auto';
        inputEl.style.height = inputEl.scrollHeight + 'px';
      }
      showToast('Field enhanced!', 'success');
    } else {
      showToast(result.error || 'Enhancement failed', 'error');
    }
  } catch (err) {
    showToast('Make sure Ollama is running', 'error');
  }
  
  btn.disabled = false;
  btn.classList.remove('enhancing');
  btn.innerHTML = originalText;
}

if (enhancePromptBtn) {
  enhancePromptBtn.addEventListener('click', () => {
    enhanceField('prompt', chatInput, enhancePromptBtn);
  });
}

if (enhanceNegPromptBtn) {
  enhanceNegPromptBtn.addEventListener('click', () => {
    const negEl = document.getElementById('imgNegativePrompt');
    enhanceField('negative_prompt', negEl, enhanceNegPromptBtn);
  });
}

// Listen for streaming chat tokens
if (window.electronAPI.onLocalChatToken) {
  let streamingContent = '';
  
  window.electronAPI.onLocalChatToken((token) => {
    removeThinkingIndicator();
    streamingContent += token;
    
    // Update or add streaming message
    const existingStreaming = document.getElementById('chatStreaming');
    if (existingStreaming) {
      existingStreaming.querySelector('.chat-message-content').innerHTML = formatChatContent(streamingContent);
    } else {
      const streamingHtml = `
        <div class="chat-message assistant" id="chatStreaming">
          <div class="chat-message-avatar">AI</div>
          <div class="chat-message-content">${formatChatContent(streamingContent)}</div>
        </div>
      `;
      chatMessages.insertAdjacentHTML('beforeend', streamingHtml);
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
  
  window.electronAPI.onLocalChatComplete((response) => {
    // Finalize the streaming message
    const streamingEl = document.getElementById('chatStreaming');
    if (streamingEl) {
      streamingEl.removeAttribute('id');
    }
    
    if (serverStreamActive) {
      // For server mode streaming, mark as _streaming so the await handler knows not to re-add
      chatHistory.push({ role: 'assistant', content: streamingContent, _streaming: true });
    } else {
      chatHistory.push({ role: 'assistant', content: streamingContent });
    }
    streamingContent = '';
    
    if (!serverStreamActive) {
      isGeneratingChat = false;
      chatSendBtn.disabled = false;
    }
    saveChatHistory();
  });
  
  window.electronAPI.onLocalChatError((error) => {
    removeThinkingIndicator();
    const streamingEl = document.getElementById('chatStreaming');
    if (streamingEl) {
      streamingEl.remove();
    }
    
    chatHistory.push({ role: 'assistant', content: `Error: ${error}` });
    renderChatMessages();
    
    isGeneratingChat = false;
    chatSendBtn.disabled = false;
    streamingContent = '';
    saveChatHistory();
  });
}

// Listen for image generation events
if (window.electronAPI.onLocalImageComplete) {
  window.electronAPI.onLocalImageComplete((imagePath) => {
    removeThinkingIndicator();
    chatHistory.push({ role: 'assistant', content: 'Here\'s your generated image:', image: imagePath });
    renderChatMessages();
    isGeneratingChat = false;
    chatSendBtn.disabled = false;
    saveChatHistory();
  });
}

if (window.electronAPI.onLocalImageError) {
  window.electronAPI.onLocalImageError((error) => {
    removeThinkingIndicator();
    chatHistory.push({ role: 'assistant', content: `Failed to generate image: ${error}` });
    renderChatMessages();
    isGeneratingChat = false;
    chatSendBtn.disabled = false;
    saveChatHistory();
  });
}

// ========== END MAXIMUM PRIVACY MODE ==========

// ========== CHAT SIDEBAR & CONVERSATION MANAGEMENT ==========

// Toggle sidebar visibility
if (chatSidebarToggle) {
  chatSidebarToggle.addEventListener('click', () => {
    if (chatSidebar) {
      chatSidebar.classList.toggle('collapsed');
    }
  });
}

// Create new conversation
if (chatNewBtn) {
  chatNewBtn.addEventListener('click', () => {
    createNewConversation();
  });
}

function createNewConversation() {
  const id = 'conv_' + Date.now();
  const newConv = {
    id: id,
    title: 'New Chat',
    messages: [],
    createdAt: new Date().toISOString()
  };
  conversations.unshift(newConv);
  currentConversationId = id;
  chatHistory = [];
  renderChatMessages();
  renderSidebar();
  saveAllConversations();
  
  // Update title
  if (chatTitle) {
    chatTitle.textContent = localProcessingMode ? 'AI Chat (Local)' : 'AI Chat';
  }
}

// Render sidebar with conversations
function renderSidebar() {
  if (!chatSidebarList) return;
  
  if (conversations.length === 0) {
    chatSidebarList.innerHTML = `
      <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 12px;">
        No conversations yet.<br>Start chatting to create one.
      </div>
    `;
    return;
  }
  
  chatSidebarList.innerHTML = conversations.map(conv => `
    <div class="chat-sidebar-item ${conv.id === currentConversationId ? 'active' : ''}" data-id="${conv.id}">
      <span class="chat-sidebar-item-title">${escapeHtml(conv.title || 'New Chat')}</span>
      <button class="chat-sidebar-item-delete" data-id="${conv.id}" title="Delete conversation">×</button>
    </div>
  `).join('');
  
  // Add click handlers
  chatSidebarList.querySelectorAll('.chat-sidebar-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('chat-sidebar-item-delete')) return;
      const id = item.dataset.id;
      switchConversation(id);
    });
  });
  
  // Add delete handlers
  chatSidebarList.querySelectorAll('.chat-sidebar-item-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      deleteConversation(id);
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function switchConversation(id) {
  // Save current conversation
  if (currentConversationId) {
    const currentConv = conversations.find(c => c.id === currentConversationId);
    if (currentConv) {
      currentConv.messages = [...chatHistory];
    }
  }
  
  // Switch to new conversation
  currentConversationId = id;
  const conv = conversations.find(c => c.id === id);
  if (conv) {
    chatHistory = conv.messages || [];
    if (chatTitle) {
      chatTitle.textContent = conv.title || (localProcessingMode ? 'AI Chat (Local)' : 'AI Chat');
    }
  }
  
  renderChatMessages();
  renderSidebar();
  saveAllConversations();
}

function deleteConversation(id) {
  const index = conversations.findIndex(c => c.id === id);
  if (index === -1) return;
  
  conversations.splice(index, 1);
  
  // If we deleted the current conversation, switch to first one or create new
  if (id === currentConversationId) {
    if (conversations.length > 0) {
      switchConversation(conversations[0].id);
    } else {
      createNewConversation();
    }
  } else {
    renderSidebar();
    saveAllConversations();
  }
}

// Clear current conversation messages
if (chatClearBtn) {
  chatClearBtn.addEventListener('click', () => {
    if (chatHistory.length === 0) return;
    
    chatHistory = [];
    renderChatMessages();
    
    // Update conversation in list
    if (currentConversationId) {
      const conv = conversations.find(c => c.id === currentConversationId);
      if (conv) {
        conv.messages = [];
        conv.title = 'New Chat';
      }
    }
    
    saveAllConversations();
  });
}

// Save all conversations to local storage
async function saveAllConversations() {
  try {
    // Update current conversation messages
    if (currentConversationId) {
      const conv = conversations.find(c => c.id === currentConversationId);
      if (conv) {
        conv.messages = [...chatHistory];
        // Auto-title based on first message
        if (chatHistory.length > 0 && conv.title === 'New Chat') {
          const firstMsg = chatHistory.find(m => m.role === 'user');
          if (firstMsg) {
            conv.title = firstMsg.content.substring(0, 30) + (firstMsg.content.length > 30 ? '...' : '');
          }
        }
      }
    }
    await window.electronAPI.saveLocalConversations(conversations);
    renderSidebar();
  } catch (err) {
    console.error('Failed to save conversations:', err);
  }
}

// ========== END CHAT SIDEBAR ==========

// Initialize on load
async function initPrivacyMode() {
  await updatePrivacyModeUI();
}

init();
initPrivacyMode();
