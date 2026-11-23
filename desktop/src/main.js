const { app, BrowserWindow, ipcMain, desktopCapturer, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let inputInjector = null;

function initInputInjector() {
  const injectorPath = path.join(__dirname, 'native', 'InputInjector.exe');
  try {
    inputInjector = spawn(injectorPath, [], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    inputInjector.stdout.on('data', (data) => {
      console.log(`[InputInjector] ${data.toString().trim()}`);
    });

    inputInjector.stderr.on('data', (data) => {
      console.error(`[InputInjector Error] ${data.toString().trim()}`);
    });

    inputInjector.on('close', (code) => {
      console.log(`[InputInjector Closed] Exit code ${code}`);
      inputInjector = null;
    });
  } catch (err) {
    console.error('[InputInjector Failed to start]', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: 'Remote Desk',
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('get-screen-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  return sources.map((s) => ({
    id: s.id,
    name: s.name
  }));
});

ipcMain.handle('get-screen-dimensions', () => {
  const primary = screen.getPrimaryDisplay();
  return {
    width: primary.bounds.width,
    height: primary.bounds.height
  };
});

ipcMain.on('inject-input', (event, command) => {
  if (inputInjector && inputInjector.stdin && !inputInjector.stdin.destroyed) {
    try {
      inputInjector.stdin.write(`${command}\n`);
    } catch (err) {
      console.error('[Input Write Error]', err);
    }
  }
});

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('updater-status', {
        status: 'available',
        version: info.version,
        message: `Versi baru (${info.version}) tersedia. Mengunduh pembaruan...`
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version);
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('updater-status', {
        status: 'ready',
        version: info.version,
        message: `Pembaruan v${info.version} siap dipasang.`
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.log('[AutoUpdater Info]', err.message);
  });

  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.log('[AutoUpdater check skipped]', err.message);
      });
    }, 4000);
  }
}

ipcMain.on('restart-app-for-update', () => {
  autoUpdater.quitAndInstall();
});

app.whenReady().then(() => {
  initInputInjector();
  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (inputInjector) {
    try {
      inputInjector.stdin.write('exit\n');
      inputInjector.kill();
    } catch (e) {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
