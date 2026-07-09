const fs = require('fs');
const { app, BrowserWindow, ipcMain } = require('electron');
const AuthController = require('./controllers/authController');
const DiagnosticsController = require('./controllers/diagnosticsController');
const LibraryController = require('./controllers/libraryController');
const PlayerController = require('./controllers/playerController');
const SettingsController = require('./controllers/settingsController');
const { closeDatabase } = require('./database/connection');
const { registerAuthHandlers } = require('./ipc/registerAuthHandlers');
const { registerDiagnosticsHandlers } = require('./ipc/registerDiagnosticsHandlers');
const { registerLibraryHandlers } = require('./ipc/registerLibraryHandlers');
const { registerPlayerHandlers } = require('./ipc/registerPlayerHandlers');
const { registerSettingsHandlers } = require('./ipc/registerSettingsHandlers');
const LibraryRepository = require('./repositories/libraryRepository');
const SecurityRepository = require('./repositories/securityRepository');
const SessionRepository = require('./repositories/sessionRepository');
const SettingsRepository = require('./repositories/settingsRepository');
const UserRepository = require('./repositories/userRepository');
const AuthService = require('./services/authService');
const DiagnosticsService = require('./services/diagnosticsService');
const { initializeFirstRun } = require('./services/firstRunService');
const LibraryService = require('./services/libraryService');
const PlayerService = require('./services/playerService');
const SettingsService = require('./services/settingsService');
const UpdateService = require('./services/updateService');
const { createMainWindow } = require('./windowManager');

let mainWindow = null;
let updateService = null;

if (process.env.KITSUNEDESK_USER_DATA_DIR) {
  fs.mkdirSync(process.env.KITSUNEDESK_USER_DATA_DIR, { recursive: true });
  app.setPath('userData', process.env.KITSUNEDESK_USER_DATA_DIR);
}

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

function registerDomainHandlers(database) {
  const userRepository = new UserRepository(database);
  const sessionRepository = new SessionRepository();
  const securityRepository = new SecurityRepository(database);
  const settingsRepository = new SettingsRepository(database);
  const libraryRepository = new LibraryRepository(database);

  const settingsService = new SettingsService({ settingsRepository, sessionRepository });
  const libraryService = new LibraryService({ libraryRepository, sessionRepository });
  const authService = new AuthService({
    userRepository,
    sessionRepository,
    securityRepository,
    settingsRepository
  });
  const playerService = new PlayerService({ settingsService, libraryService });
  const diagnosticsService = new DiagnosticsService({ app, database, playerService });
  updateService = new UpdateService({ app });
  updateService.configure();

  const authController = new AuthController(authService);
  const settingsController = new SettingsController(settingsService);
  const libraryController = new LibraryController(libraryService);
  const playerController = new PlayerController(playerService);
  const diagnosticsController = new DiagnosticsController({ diagnosticsService, updateService });

  registerAuthHandlers(ipcMain, authController);
  registerSettingsHandlers(ipcMain, settingsController);
  registerLibraryHandlers(ipcMain, libraryController);
  registerPlayerHandlers(ipcMain, playerController);
  registerDiagnosticsHandlers(ipcMain, diagnosticsController);

  const broadcast = (channel, payload) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(channel, payload);
    }
  };

  playerController.on('state', (state) => broadcast('player:state-changed', state));
  playerController.on('playback-started', (state) => broadcast('player:playback-started', state));
  playerController.on('source-progress', (state) => broadcast('player:source-progress', state));
  updateService.on('state', (state) => broadcast('updates:state-changed', state));
}

function focusExistingWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
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
      if (mainWindow === null) openMainWindow();
    });
  });

  app.on('before-quit', () => {
    closeDatabase();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
