const { app, BrowserWindow, Menu, Tray, shell, ipcMain, Notification } = require('electron');
const path = require('path');

// Keep a global reference of the window object
let mainWindow;
let tray = null;

// Your deployed app URL - UPDATE THIS with your live deployment URL
const APP_URL = 'https://kinntegraa.com'; // Change to your actual domain

// Check if running in development
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true
    },
    titleBarStyle: 'default',
    show: false, // Don't show until ready
    backgroundColor: '#ffffff'
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(APP_URL);
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Show notification on first launch
    if (Notification.isSupported()) {
      new Notification({
        title: 'Kinntegraa',
        body: 'Application is ready!',
        icon: path.join(__dirname, 'icon.png')
      }).show();
    }
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle window close
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      
      // Show tray notification
      if (tray) {
        tray.displayBalloon({
          title: 'Kinntegraa',
          content: 'Application minimized to tray. Click the icon to restore.',
          icon: path.join(__dirname, 'icon.png')
        });
      }
    }
    return false;
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Create application menu
  createMenu();
  
  // Create system tray
  createTray();
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Refresh',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow.reload()
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.isQuitting = true;
            app.quit();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => {
            const currentZoom = mainWindow.webContents.getZoomFactor();
            mainWindow.webContents.setZoomFactor(currentZoom + 0.1);
          }
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            const currentZoom = mainWindow.webContents.getZoomFactor();
            mainWindow.webContents.setZoomFactor(Math.max(0.5, currentZoom - 0.1));
          }
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow.webContents.setZoomFactor(1)
        },
        { type: 'separator' },
        {
          label: 'Toggle Full Screen',
          accelerator: 'F11',
          click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen())
        },
        { type: 'separator' },
        {
          label: 'Developer Tools',
          accelerator: 'F12',
          click: () => mainWindow.webContents.toggleDevTools()
        }
      ]
    },
    {
      label: 'Navigate',
      submenu: [
        {
          label: 'Dashboard',
          click: () => mainWindow.loadURL(`${APP_URL}/broker/dashboard`)
        },
        {
          label: 'Opportunities',
          click: () => mainWindow.loadURL(`${APP_URL}/broker/opportunities`)
        },
        {
          label: 'Holdings',
          click: () => mainWindow.loadURL(`${APP_URL}/broker/holdings`)
        },
        {
          label: 'Reinv Tag',
          click: () => mainWindow.loadURL(`${APP_URL}/broker/reinvestment`)
        },
        {
          label: 'Logs',
          click: () => mainWindow.loadURL(`${APP_URL}/broker/logs`)
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Kinntegraa',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Kinntegraa',
              message: 'Kinntegraa Desktop',
              detail: 'Version 1.0.0\n\nNCD Exchange Platform for Brokers, Sub-Brokers, and Clients.\n\n© 2024 Kinntegraa. All rights reserved.',
              buttons: ['OK'],
              icon: path.join(__dirname, 'icon.png')
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Check for Updates',
          click: () => {
            shell.openExternal('https://kinntegraa.com/updates');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.png'));
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Kinntegraa',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    { type: 'separator' },
    {
      label: 'Dashboard',
      click: () => {
        mainWindow.show();
        mainWindow.loadURL(`${APP_URL}/broker/dashboard`);
      }
    },
    {
      label: 'Opportunities',
      click: () => {
        mainWindow.show();
        mainWindow.loadURL(`${APP_URL}/broker/opportunities`);
      }
    },
    {
      label: 'Holdings',
      click: () => {
        mainWindow.show();
        mainWindow.loadURL(`${APP_URL}/broker/holdings`);
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('Kinntegraa - Investment Platform');
  tray.setContextMenu(contextMenu);
  
  // Double-click to show window
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

// Handle certificate errors (for self-signed certs in dev)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (isDev) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}
