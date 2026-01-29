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
  
  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // Event listeners
  onStatusUpdate: (callback) => {
    ipcRenderer.on('status-update', (event, data) => callback(data));
  },
  onNavigate: (callback) => {
    ipcRenderer.on('navigate', (event, page) => callback(page));
  },
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (event, data) => callback(data));
  }
});
