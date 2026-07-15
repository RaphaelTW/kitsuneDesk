const { contextBridge, ipcRenderer } = require('electron');

const channels = Object.freeze({
  appGetInfo: 'app:get-info',
  appPing: 'app:ping',
  authSetupStatus: 'auth:setup-status',
  authCreateInitialAdmin: 'auth:create-initial-admin',
  authLogin: 'auth:login',
  authLogout: 'auth:logout',
  authSession: 'auth:session',
  authChangePassword: 'auth:change-password',
  usersList: 'users:list',
  usersCreate: 'users:create',
  usersUpdate: 'users:update',
  usersResetPassword: 'users:reset-password',
  animesSearch: 'animes:search',
  animesEpisodes: 'animes:episodes',
  playerPlay: 'player:play',
  playerPlayEpisode: 'player:play-episode',
  playerOpenLegacy: 'player:open-legacy',
  playerOpenTool: 'player:open-tool',
  playerInstallDependencies: 'player:install-dependencies',
  playerCancelInstallation: 'player:cancel-installation',
  playerInstallationProgress: 'player:installation-progress',
  playerPause: 'player:pause',
  playerResume: 'player:resume',
  playerTogglePause: 'player:toggle-pause',
  playerSeek: 'player:seek',
  playerSetVolume: 'player:set-volume',
  playerNext: 'player:next',
  playerPrevious: 'player:previous',
  playerStop: 'player:stop',
  playerStatus: 'player:status',
  playerPlaybackState: 'player:playback-state',
  playerQueue: 'player:queue',
  playerReorderQueue: 'player:reorder-queue',
  playerStateChanged: 'player:state-changed',
  playerPlaybackStarted: 'player:playback-started',
  playerSourceProgress: 'player:source-progress',
  providersHealth: 'providers:health',
  libraryDashboard: 'library:dashboard',
  libraryContinue: 'library:continue',
  libraryCollectionState: 'library:collection-state',
  historyList: 'history:list',
  historyExportCsv: 'history:export-csv',
  historyRemove: 'history:remove',
  historyClear: 'history:clear',
  historyMarkCompleted: 'history:mark-completed',
  favoritesList: 'favorites:list',
  favoritesToggle: 'favorites:toggle',
  watchlistList: 'watchlist:list',
  watchlistToggle: 'watchlist:toggle',
  reportsCreate: 'reports:create',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsSetParentalPin: 'settings:set-parental-pin',
  settingsVerifyParentalPin: 'settings:verify-parental-pin',
  diagnosticsRun: 'diagnostics:run',
  diagnosticsRepairNative: 'diagnostics:repair-native',
  diagnosticsClearCache: 'diagnostics:clear-cache',
  diagnosticsRestoreComponents: 'diagnostics:restore-components',
  diagnosticsRecordFailure: 'diagnostics:record-failure',
  diagnosticsRecordStartupPerformance: 'diagnostics:record-startup-performance',
  diagnosticsStartupPerformance: 'diagnostics:startup-performance',
  diagnosticsListFailures: 'diagnostics:list-failures',
  diagnosticsRemoveFailures: 'diagnostics:remove-failures',
  diagnosticsExportFailures: 'diagnostics:export-failures',
  diagnosticsClearFailures: 'diagnostics:clear-failures',
  diagnosticsExport: 'diagnostics:export',
  diagnosticsProgress: 'diagnostics:progress',
  updatesCheck: 'updates:check',
  updatesInstall: 'updates:install',
  updatesStatus: 'updates:status',
  updatesStateChanged: 'updates:state-changed',
  cacheImage: 'cache:image',
  cacheStats: 'cache:stats',
  cacheClear: 'cache:clear',
  cacheWarmImages: 'cache:warm-images',
  avatarsGet: 'avatars:get',
  avatarsStyles: 'avatars:styles',
  backupExportLibrary: 'backup:export-library',
  backupImportLibrary: 'backup:import-library',
  backupExportProfiles: 'backup:export-profiles',
  backupImportProfiles: 'backup:import-profiles',
  backupValidateProfiles: 'backup:validate-profiles',
  backupListSchedules: 'backup:list-schedules',
  backupScheduleProfiles: 'backup:schedule-profiles',
  backupRunScheduledProfiles: 'backup:run-scheduled-profiles',
  backupRunDue: 'backup:run-due'
});

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload);
}

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const animeDeskApi = Object.freeze({
  app: Object.freeze({
    getInfo: () => invoke(channels.appGetInfo),
    ping: () => invoke(channels.appPing)
  }),
  auth: Object.freeze({
    setupStatus: () => invoke(channels.authSetupStatus),
    createInitialAdmin: (payload) => invoke(channels.authCreateInitialAdmin, payload),
    login: (credentials) => invoke(channels.authLogin, credentials),
    logout: () => invoke(channels.authLogout),
    session: () => invoke(channels.authSession),
    changePassword: (payload) => invoke(channels.authChangePassword, payload)
  }),
  users: Object.freeze({
    list: () => invoke(channels.usersList),
    create: (payload) => invoke(channels.usersCreate, payload),
    update: (payload) => invoke(channels.usersUpdate, payload),
    resetPassword: (payload) => invoke(channels.usersResetPassword, payload)
  }),
  animes: Object.freeze({
    search: (filters) => invoke(channels.animesSearch, filters),
    episodes: (payload) => invoke(channels.animesEpisodes, payload)
  }),
  player: Object.freeze({
    play: (payload) => invoke(channels.playerPlay, payload),
    playEpisode: (payload) => invoke(channels.playerPlayEpisode, payload),
    openLegacy: (payload) => invoke(channels.playerOpenLegacy, payload),
    openTool: (payload) => invoke(channels.playerOpenTool, payload),
    installDependencies: (provider) => invoke(channels.playerInstallDependencies, { provider }),
    cancelInstallation: (jobId) => invoke(channels.playerCancelInstallation, { jobId }),
    onInstallationProgress: (callback) => subscribe(channels.playerInstallationProgress, callback),
    pause: () => invoke(channels.playerPause),
    resume: () => invoke(channels.playerResume),
    togglePause: () => invoke(channels.playerTogglePause),
    seek: (seconds, mode = 'relative') => invoke(channels.playerSeek, { seconds, mode }),
    setVolume: (volume) => invoke(channels.playerSetVolume, { volume }),
    next: () => invoke(channels.playerNext),
    previous: () => invoke(channels.playerPrevious),
    stop: () => invoke(channels.playerStop),
    status: () => invoke(channels.playerStatus),
    playbackState: () => invoke(channels.playerPlaybackState),
    queue: () => invoke(channels.playerQueue),
    reorderQueue: (payload) => invoke(channels.playerReorderQueue, payload),
    onStateChanged: (callback) => subscribe(channels.playerStateChanged, callback),
    onPlaybackStarted: (callback) => subscribe(channels.playerPlaybackStarted, callback),
    onSourceProgress: (callback) => subscribe(channels.playerSourceProgress, callback)
  }),
  providers: Object.freeze({
    health: () => invoke(channels.providersHealth)
  }),
  library: Object.freeze({
    dashboard: () => invoke(channels.libraryDashboard),
    continueWatching: () => invoke(channels.libraryContinue),
    collectionState: (payload) => invoke(channels.libraryCollectionState, payload)
  }),
  history: Object.freeze({
    list: (filters) => invoke(channels.historyList, filters),
    exportCsv: (filters) => invoke(channels.historyExportCsv, filters),
    remove: (historyId) => invoke(channels.historyRemove, { historyId }),
    clear: () => invoke(channels.historyClear),
    markCompleted: (historyId, completed) =>
      invoke(channels.historyMarkCompleted, { historyId, completed })
  }),
  favorites: Object.freeze({
    list: () => invoke(channels.favoritesList),
    toggle: (payload) => invoke(channels.favoritesToggle, payload)
  }),
  watchlist: Object.freeze({
    list: () => invoke(channels.watchlistList),
    toggle: (payload) => invoke(channels.watchlistToggle, payload)
  }),
  reports: Object.freeze({
    create: (payload) => invoke(channels.reportsCreate, payload)
  }),
  settings: Object.freeze({
    get: () => invoke(channels.settingsGet),
    update: (payload) => invoke(channels.settingsUpdate, payload),
    setParentalPin: (pin) => invoke(channels.settingsSetParentalPin, { pin }),
    verifyParentalPin: (pin) => invoke(channels.settingsVerifyParentalPin, { pin })
  }),
  diagnostics: Object.freeze({
    run: () => invoke(channels.diagnosticsRun),
    repairNative: () => invoke(channels.diagnosticsRepairNative),
    clearCache: () => invoke(channels.diagnosticsClearCache),
    restoreComponents: () => invoke(channels.diagnosticsRestoreComponents),
    recordFailure: (payload) => invoke(channels.diagnosticsRecordFailure, payload),
    recordStartupPerformance: (payload) =>
      invoke(channels.diagnosticsRecordStartupPerformance, payload),
    startupPerformance: () => invoke(channels.diagnosticsStartupPerformance),
    listFailures: (filters) => invoke(channels.diagnosticsListFailures, filters),
    removeFailures: (ids) => invoke(channels.diagnosticsRemoveFailures, { ids }),
    exportFailures: (format, filters) =>
      invoke(channels.diagnosticsExportFailures, { format, filters }),
    clearFailures: () => invoke(channels.diagnosticsClearFailures),
    export: () => invoke(channels.diagnosticsExport),
    onProgress: (callback) => subscribe(channels.diagnosticsProgress, callback)
  }),
  updates: Object.freeze({
    check: () => invoke(channels.updatesCheck),
    install: () => invoke(channels.updatesInstall),
    status: () => invoke(channels.updatesStatus),
    onStateChanged: (callback) => subscribe(channels.updatesStateChanged, callback)
  }),
  cache: Object.freeze({
    image: (url, kind = 'covers') => invoke(channels.cacheImage, { url, kind }),
    stats: () => invoke(channels.cacheStats),
    clear: () => invoke(channels.cacheClear),
    warmImages: (urls, kind = 'covers') => invoke(channels.cacheWarmImages, { urls, kind })
  }),
  avatars: Object.freeze({
    get: (payload) => invoke(channels.avatarsGet, payload),
    styles: () => invoke(channels.avatarsStyles)
  }),
  backup: Object.freeze({
    exportLibrary: () => invoke(channels.backupExportLibrary),
    importLibrary: (mode = 'merge') => invoke(channels.backupImportLibrary, { mode }),
    exportProfiles: (password) => invoke(channels.backupExportProfiles, { password }),
    importProfiles: (password) => invoke(channels.backupImportProfiles, { password }),
    validateProfiles: (password) => invoke(channels.backupValidateProfiles, { password }),
    listSchedules: () => invoke(channels.backupListSchedules),
    scheduleProfiles: (payload) => invoke(channels.backupScheduleProfiles, payload),
    runScheduledProfiles: (scheduleId) =>
      invoke(channels.backupRunScheduledProfiles, { scheduleId }),
    runDue: () => invoke(channels.backupRunDue)
  })
});

contextBridge.exposeInMainWorld('animeDesk', animeDeskApi);
