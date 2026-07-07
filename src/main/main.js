const fs = require('fs');
const { app, ipcMain } = require('electron');
const AuthController = require('./controllers/authController');
const PlayerController = require('./controllers/playerController');
const SessionRepository = require('./repositories/sessionRepository');
const UserRepository = require('./repositories/userRepository');
const AuthService = require('./services/authService');
const { initializeFirstRun } = require('./services/firstRunService');
const PlayerService = require('./services/playerService');
const { registerAuthHandlers } = require('./ipc/registerAuthHandlers');
const { registerPlayerHandlers } = require('./ipc/registerPlayerHandlers');
const { createMainWindow } = require('./windowManager');

let mainWindow = null;

if (process.env.KITSUNEDESK_USER_DATA_DIR) {
  fs.mkdirSync(process.env.KITSUNEDESK_USER_DATA_DIR, { recursive: true });
  app.setPath('userData', process.env.KITSUNEDESK_USER_DATA_DIR);
}

/**
 * Registra os canais IPC disponiveis na etapa inicial.
 * Canais de dominio serao adicionados nas proximas etapas por controllers.
 */
function registerBaseHandlers() {
  ipcMain.handle('app:get-info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged
  }));

  ipcMain.handle('app:ping', () => ({
    ok: true,
    checkedAt: new Date().toISOString()
  }));
}

/**
 * @param {import('better-sqlite3').Database} database
 */
function registerDomainHandlers(database) {
  const userRepository = new UserRepository(database);
  const sessionRepository = new SessionRepository();
  const authService = new AuthService({ userRepository, sessionRepository });
  const authController = new AuthController(authService);
  const playerService = new PlayerService();
  const playerController = new PlayerController(playerService);

  registerAuthHandlers(ipcMain, authController);
  registerPlayerHandlers(ipcMain, playerController);
}

function focusExistingWindow() {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
}

function openMainWindow() {
  mainWindow = createMainWindow();
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.KITSUNEDESK_SMOKE_TEST === '1') {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => app.quit(), 250);
    });
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', focusExistingWindow);

  app.whenReady().then(() => {
    const database = initializeFirstRun(app);
    registerBaseHandlers();
    registerDomainHandlers(database);
    openMainWindow();

    app.on('activate', () => {
      if (mainWindow === null) {
        openMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
