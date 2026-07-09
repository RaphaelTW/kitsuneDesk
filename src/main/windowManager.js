const path = require('path');
const { BrowserWindow, shell } = require('electron');

/**
 * Cria a janela principal com as protecoes obrigatorias do Electron.
 *
 * @returns {BrowserWindow}
 */
function createMainWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  const startPage = path.join(__dirname, '..', 'renderer', 'pages', 'login.html');
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icons', 'icon.ico');

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    title: 'KitsuneDesk',
    icon: iconPath,
    backgroundColor: '#101216',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.loadFile(startPage);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttpUrl(url)) {
      shell.openExternal(url);
    }

    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
    }
  });

  return mainWindow;
}

/**
 * @param {string} url
 * @returns {boolean}
 */
function isExternalHttpUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:';
  } catch {
    return false;
  }
}

module.exports = {
  createMainWindow
};
