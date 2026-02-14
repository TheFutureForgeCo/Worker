const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls (frameless window)
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  
  // Status and config
  getStatus: () => ipcRenderer.invoke('get-status'),
  getServerUrl: () => ipcRenderer.invoke('get-server-url'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  
  // Worker control
  startWorker: () => ipcRenderer.invoke('start-worker'),
  stopWorker: () => ipcRenderer.invoke('stop-worker'),
  toggleOnline: () => ipcRenderer.invoke('toggle-online'),
  
  // Ollama management
  checkOllama: () => ipcRenderer.invoke('check-ollama'),
  installOllama: () => ipcRenderer.invoke('install-ollama'),
  getOllamaModels: () => ipcRenderer.invoke('get-ollama-models'),
  pullModel: (modelName) => ipcRenderer.invoke('pull-model', modelName),
  deleteModel: (modelName) => ipcRenderer.invoke('delete-model', modelName),
  
  // App management
  getVersion: () => ipcRenderer.invoke('get-version'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  clearData: () => ipcRenderer.invoke('clear-data'),
  uninstallApp: () => ipcRenderer.invoke('uninstall-app'),
  
  // Logging
  getLogs: () => ipcRenderer.invoke('get-logs'),
  openLogsFolder: () => ipcRenderer.invoke('open-logs-folder'),
  
  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // Image AI management
  setImageAiEnabled: (enabled) => ipcRenderer.invoke('set-image-ai-enabled', enabled),
  downloadImageAi: () => ipcRenderer.invoke('download-image-ai'),
  pauseImageAiDownload: () => ipcRenderer.invoke('pause-image-ai-download'),
  resumeImageAiDownload: () => ipcRenderer.invoke('resume-image-ai-download'),
  cancelImageAiDownload: () => ipcRenderer.invoke('cancel-image-ai-download'),
  uninstallImageAi: () => ipcRenderer.invoke('uninstall-image-ai'),
  deleteImageAiFiles: () => ipcRenderer.invoke('delete-image-ai-files'),
  reportBenchmark: (benchmarkTimeMs) => ipcRenderer.invoke('report-benchmark', benchmarkTimeMs),
  retryImageBenchmark: () => ipcRenderer.invoke('retry-image-benchmark'),
  generateImage: (params) => ipcRenderer.invoke('generate-image', params),
  saveImageToDownloads: (imagePath) => ipcRenderer.invoke('save-image-to-downloads', imagePath),
  
  // Bundle management (pre-packaged AI assets)
  checkBundleStatus: () => ipcRenderer.invoke('check-bundle-status'),
  getBundlePaths: () => ipcRenderer.invoke('get-bundle-paths'),
  installBundle: () => ipcRenderer.invoke('install-bundle'),
  
  // Maximum Privacy Mode & Local Chat
  setMaxPrivacyMode: (enabled) => ipcRenderer.invoke('set-max-privacy-mode', enabled),
  getMaxPrivacyMode: () => ipcRenderer.invoke('get-max-privacy-mode'),
  getLogPath: () => ipcRenderer.invoke('get-log-path'),
  
  // Local chat (direct Ollama communication)
  localChatSend: (message, model, conversationHistory) => ipcRenderer.invoke('local-chat-send', message, model, conversationHistory),
  localChatStream: (message, model, conversationHistory, options) => ipcRenderer.invoke('local-chat-stream', message, model, conversationHistory, options),
  localImageGenerate: (prompt, quality, imageOptions) => ipcRenderer.invoke('local-image-generate', prompt, quality, imageOptions),
  imageAssistantChat: (message, conversationHistory, currentSettings) => ipcRenderer.invoke('image-assistant-chat', message, conversationHistory, currentSettings),
  enhanceField: (fieldName, currentValue, context) => ipcRenderer.invoke('enhance-field', fieldName, currentValue, context),
  
  // Server chat (ComputeGrid network API)
  serverChatSend: (message, conversationHistory) => ipcRenderer.invoke('server-chat-send', message, conversationHistory),
  
  // Local conversation storage
  saveLocalConversations: (conversations) => ipcRenderer.invoke('save-local-conversations', conversations),
  loadLocalConversations: () => ipcRenderer.invoke('load-local-conversations'),
  clearLocalConversations: () => ipcRenderer.invoke('clear-local-conversations'),
  
  // Event listeners
  onStatusUpdate: (callback) => {
    ipcRenderer.on('status-update', (event, data) => callback(data));
  },
  onNavigate: (callback) => {
    ipcRenderer.on('navigate', (event, page) => callback(page));
  },
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (event, data) => callback(data));
  },
  onImageAiProgress: (callback) => {
    ipcRenderer.on('image-ai-progress', (event, progress) => callback(progress));
  },
  onImageAiPhase: (callback) => {
    ipcRenderer.on('image-ai-phase', (event, phase) => callback(phase));
  },
  onImageAiDepsProgress: (callback) => {
    ipcRenderer.on('image-ai-deps-progress', (event, message) => callback(message));
  },
  onImageAiBenchmarkStart: (callback) => {
    ipcRenderer.on('image-ai-benchmark-start', (event) => callback());
  },
  onImageAiBenchmarkComplete: (callback) => {
    ipcRenderer.on('image-ai-benchmark-complete', (event, data) => callback(data));
  },
  onImageAiDualBenchmarkComplete: (callback) => {
    ipcRenderer.on('image-ai-dual-benchmark-complete', (event, data) => callback(data));
  },
  onImageAiBenchmarkError: (callback) => {
    ipcRenderer.on('image-ai-benchmark-error', (event, error) => callback(error));
  },
  onImageAiBenchmarkFallback: (callback) => {
    ipcRenderer.on('image-ai-benchmark-fallback', (event, data) => callback(data));
  },
  onBenchmarkLog: (callback) => {
    ipcRenderer.on('benchmark-log', (event, logLine) => callback(logLine));
  },
  onImageAiError: (callback) => {
    ipcRenderer.on('image-ai-error', (event, error) => callback(error));
  },
  onImageAiDownloadReset: (callback) => {
    ipcRenderer.on('image-ai-download-reset', (event) => callback());
  },
  onAppVersion: (callback) => {
    ipcRenderer.on('app-version', (event, version) => callback(version));
  },
  onOllamaSetupComplete: (callback) => {
    ipcRenderer.on('ollama-setup-complete', (event) => callback());
  },
  
  // Bundle events
  onBundleProgress: (callback) => {
    ipcRenderer.on('bundle-progress', (event, progress) => callback(progress));
  },
  onBundleStatus: (callback) => {
    ipcRenderer.on('bundle-status', (event, status) => callback(status));
  },
  
  // Local chat streaming events
  onLocalChatToken: (callback) => {
    ipcRenderer.on('local-chat-token', (event, token) => callback(token));
  },
  onLocalChatComplete: (callback) => {
    ipcRenderer.on('local-chat-complete', (event, response) => callback(response));
  },
  onLocalChatError: (callback) => {
    ipcRenderer.on('local-chat-error', (event, error) => callback(error));
  },
  onLocalImageComplete: (callback) => {
    ipcRenderer.on('local-image-complete', (event, imagePath) => callback(imagePath));
  },
  onLocalImageError: (callback) => {
    ipcRenderer.on('local-image-error', (event, error) => callback(error));
  }
});
