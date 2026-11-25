const { app, BrowserWindow, ipcMain, desktopCapturer, screen, Menu, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let inputInjector = null;

function initInputInjector() {
  let injectorPath = path.join(__dirname, 'native', 'InputInjector.exe');

  if (app.isPackaged) {
    const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'native', 'InputInjector.exe');
    if (fs.existsSync(unpackedPath)) {
      injectorPath = unpackedPath;
    } else {
      const altPath = path.join(process.resourcesPath, 'src', 'native', 'InputInjector.exe');
      if (fs.existsSync(altPath)) {
        injectorPath = altPath;
      }
    }
  }

  if (!fs.existsSync(injectorPath)) {
    console.log('[InputInjector] Binary not found at', injectorPath, '- Host input will be inactive');
    return;
  }

  try {
    inputInjector = spawn(injectorPath, [], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    inputInjector.on('error', (err) => {
      console.warn('[InputInjector Spawn Error]', err.message);
      inputInjector = null;
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
    console.warn('[InputInjector Failed to start]', err);
    inputInjector = null;
  }
}

function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: 'Remote Desk',
    icon: path.join(__dirname, 'renderer', 'assets', 'icon.ico'),
    autoHideMenuBar: true,
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.setMenu(null);

  // Allow screen capture via getDisplayMedia / getUserMedia with chromeMediaSource
  mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      if (sources && sources.length > 0) {
        callback({ video: sources[0] });
      } else {
        callback({});
      }
    }).catch(() => {
      callback({});
    });
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

ipcMain.handle('get-tunnel-url', () => {
  const possiblePaths = [
    'H:\\Remote Desk\\tunnel.log',
    path.join(__dirname, '..', '..', 'tunnel.log'),
    path.join(process.cwd(), 'tunnel.log')
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8');
        const matches = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g);
        if (matches && matches.length > 0) {
          return matches[matches.length - 1];
        }
      }
    } catch (e) {}
  }
  return null;
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

ipcMain.on('set-fullscreen', (event, flag) => {
  if (mainWindow) {
    mainWindow.setFullScreen(Boolean(flag));
  }
});

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('updater-event', {
        type: 'available',
        version: info.version,
        releaseNotes: info.releaseNotes || 'Pembaruan performa dan fitur terbaru Remote Desk.'
      });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('updater-event', {
        type: 'progress',
        percent: Math.round(progressObj.percent),
        bytesPerSecond: progressObj.bytesPerSecond
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version);
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('updater-event', {
        type: 'downloaded',
        version: info.version
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.log('[AutoUpdater Info]', err.message);
  });

  ipcMain.on('start-download-update', () => {
    autoUpdater.downloadUpdate().catch((e) => console.error('[Download error]', e));
  });

  ipcMain.on('restart-app-for-update', () => {
    autoUpdater.quitAndInstall(true, true);
  });

  ipcMain.on('manual-check-update', () => {
    if (app.isPackaged) {
      autoUpdater.checkForUpdates().catch((err) => {
        console.log('[Manual check error]', err.message);
      });
    }
  });

  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.log('[AutoUpdater check skipped]', err.message);
      });
    }, 3000);

    // Periksa pembaruan otomatis setiap 60 detik
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 60000);
  }
}

app.whenReady().then(() => {
  try {
    powerSaveBlocker.start('prevent-app-suspension');
    powerSaveBlocker.start('prevent-display-sleep');
    console.log('[Power] Sleep and display suspension successfully blocked');
  } catch (e) {}

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
