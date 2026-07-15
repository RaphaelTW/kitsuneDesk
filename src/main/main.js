const fs = require('fs');
const { app, BrowserWindow, ipcMain } = require('electron');
const AuthController = require('./controllers/authController');
const BackupController = require('./controllers/backupController');
const CacheController = require('./controllers/cacheController');
const DiagnosticsController = require('./controllers/diagnosticsController');
const LibraryController = require('./controllers/libraryController');
const PlayerController = require('./controllers/playerController');
const SettingsController = require('./controllers/settingsController');
const { closeDatabase } = require('./database/connection');
const { configureFailureTelemetry } = require('./ipc/handleRequest');
const { registerAuthHandlers } = require('./ipc/registerAuthHandlers');
const { registerBackupHandlers } = require('./ipc/registerBackupHandlers');
const { registerCacheHandlers } = require('./ipc/registerCacheHandlers');
const { registerDiagnosticsHandlers } = require('./ipc/registerDiagnosticsHandlers');
const { registerLibraryHandlers } = require('./ipc/registerLibraryHandlers');
const { registerPlayerHandlers } = require('./ipc/registerPlayerHandlers');
const { registerSettingsHandlers } = require('./ipc/registerSettingsHandlers');
const handleRequest = require('./ipc/handleRequest');
const CacheRepository = require('./repositories/cacheRepository');
const LibraryRepository = require('./repositories/libraryRepository');
const SecurityRepository = require('./repositories/securityRepository');
const SessionRepository = require('./repositories/sessionRepository');
const SettingsRepository = require('./repositories/settingsRepository');
const UserRepository = require('./repositories/userRepository');
const TelemetryRepository = require('./repositories/telemetryRepository');
const AuthService = require('./services/authService');
const AvatarService = require('./services/avatarService');
const BackupService = require('./services/backupService');
const CacheService = require('./services/cacheService');
const DiagnosticsService = require('./services/diagnosticsService');
const { initializeFirstRun } = require('./services/firstRunService');
const LibraryService = require('./services/libraryService');
const PlayerService = require('./services/playerService');
const SettingsService = require('./services/settingsService');
const UpdateService = require('./services/updateService');
const { createMainWindow } = require('./windowManager');

let mainWindow = null;
let updateService = null;
let databaseClosed = false;

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
  const telemetryRepository = new TelemetryRepository(database);
  const cacheRepository = new CacheRepository(database);

  const settingsService = new SettingsService({ settingsRepository, sessionRepository });
  const libraryService = new LibraryService({ libraryRepository, sessionRepository });
  const authService = new AuthService({
    userRepository,
    sessionRepository,
    securityRepository,
    settingsRepository
  });
  const cacheService = new CacheService({ app, cacheRepository });
  const avatarService = new AvatarService({ cacheService });
  const backupService = new BackupService({ app, database, sessionRepository });
  const playerService = new PlayerService({ settingsService, libraryService, cacheService });
  const diagnosticsService = new DiagnosticsService({
    app,
    database,
    playerService,
    telemetryRepository,
    sessionRepository,
    cacheService
  });
  updateService = new UpdateService({ app, focusApp: focusExistingWindow });
  updateService.configure();

  const recordFailure = (failure) => {
    try {
      const userId = Number(sessionRepository.getCurrent()?.user?.id || 0);
      void telemetryRepository.record(userId, failure).catch(() => {});
    } catch {
      // Falhas de telemetria local nao podem derrubar o app.
    }
  };
  configureFailureTelemetry(recordFailure);
  process.on('uncaughtExceptionMonitor', (error) => {
    recordFailure({
      scope: 'MAIN_PROCESS',
      event: 'UNCAUGHT_EXCEPTION',
      message: error?.message || String(error),
      metadata: { stack: error?.stack }
    });
  });
  process.on('unhandledRejection', (reason) => {
    recordFailure({
      scope: 'MAIN_PROCESS',
      event: 'UNHANDLED_REJECTION',
      message: reason?.message || String(reason),
      metadata: { stack: reason?.stack }
    });
  });

  const authController = new AuthController(authService);
  const backupController = new BackupController(backupService);
  const cacheController = new CacheController({ cacheService, avatarService });
  const settingsController = new SettingsController(settingsService);
  const libraryController = new LibraryController(libraryService);
  const playerController = new PlayerController(playerService);
  const diagnosticsController = new DiagnosticsController({ diagnosticsService, updateService });

  registerAuthHandlers(ipcMain, authController);
  registerBackupHandlers(ipcMain, backupController);
  registerCacheHandlers(ipcMain, cacheController);
  registerSettingsHandlers(ipcMain, settingsController);
  registerLibraryHandlers(ipcMain, libraryController);
  registerPlayerHandlers(ipcMain, playerController);
  registerDiagnosticsHandlers(ipcMain, diagnosticsController);
  ipcMain.handle('app:bootstrap', () =>
    handleRequest('BOOTSTRAP', async () => {
      const [settings, dashboard] = await Promise.all([
        settingsService.get(),
        libraryService.dashboard()
      ]);
      return {
        appInfo: {
          name: app.getName(),
          version: app.getVersion(),
          platform: process.platform,
          isPackaged: app.isPackaged
        },
        settings,
        dashboard
      };
    })
  );

  const broadcast = (channel, payload) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(channel, payload);
    }
  };

  playerController.on('state', (state) => broadcast('player:state-changed', state));
  playerController.on('playback-started', (state) => broadcast('player:playback-started', state));
  playerController.on('source-progress', (state) => broadcast('player:source-progress', state));
  updateService.on('state', (state) => broadcast('updates:state-changed', state));
  updateService.on('notification-click', (state) => {
    focusExistingWindow();
    broadcast('updates:state-changed', state);
  });
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
  } else {
    mainWindow.webContents.once('did-finish-load', () => {
      updateService?.startAutomaticChecks();
    });
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', focusExistingWindow);

  app.whenReady().then(async () => {
    const database = await initializeFirstRun(app);
    registerBaseHandlers();
    registerDomainHandlers(database);
    openMainWindow();

    app.on('activate', () => {
      if (mainWindow === null) openMainWindow();
    });
  });

  app.on('before-quit', (event) => {
    updateService?.stopAutomaticChecks();
    if (databaseClosed) return;
    event.preventDefault();
    void closeDatabase().finally(() => {
      databaseClosed = true;
      app.quit();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
