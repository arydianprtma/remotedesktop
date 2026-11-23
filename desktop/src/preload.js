const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  getScreenDimensions: () => ipcRenderer.invoke('get-screen-dimensions'),
  injectInput: (command) => ipcRenderer.send('inject-input', command),
  onUpdaterEvent: (callback) => ipcRenderer.on('updater-event', (event, data) => callback(data)),
  startDownloadUpdate: () => ipcRenderer.send('start-download-update'),
  restartForUpdate: () => ipcRenderer.send('restart-app-for-update'),
  setFullscreen: (flag) => ipcRenderer.send('set-fullscreen', flag)
});
