const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Window controls
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  
  // Notifications
  showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
  
  // File operations
  openFile: () => ipcRenderer.invoke('open-file'),
  saveFile: (data, filename) => ipcRenderer.invoke('save-file', { data, filename }),
  
  // System
  isOnline: () => navigator.onLine,
  getPlatform: () => process.platform,
  
  // Events
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback)
});

// Log when preload script runs
console.log('Kinntegraa Desktop: Preload script loaded');
