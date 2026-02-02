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
  
  // Bundle management (pre-packaged AI assets)
  checkBundleStatus: () => ipcRenderer.invoke('check-bundle-status'),
  getBundlePaths: () => ipcRenderer.invoke('get-bundle-paths'),
  installBundle: () => ipcRenderer.invoke('install-bundle'),
  
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
  }
});
