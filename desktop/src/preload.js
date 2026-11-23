const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  getScreenDimensions: () => ipcRenderer.invoke('get-screen-dimensions'),
  injectInput: (command) => ipcRenderer.send('inject-input', command),
  onUpdaterStatus: (callback) => ipcRenderer.on('updater-status', (event, data) => callback(data)),
  restartForUpdate: () => ipcRenderer.send('restart-app-for-update')
});
