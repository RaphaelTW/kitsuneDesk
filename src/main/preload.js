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
  playerStateChanged: 'player:state-changed',
  playerPlaybackStarted: 'player:playback-started',
  playerSourceProgress: 'player:source-progress',
  providersHealth: 'providers:health',
  libraryDashboard: 'library:dashboard',
  libraryContinue: 'library:continue',
  libraryCollectionState: 'library:collection-state',
  historyList: 'history:list',
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
  diagnosticsExport: 'diagnostics:export',
  diagnosticsProgress: 'diagnostics:progress',
  updatesCheck: 'updates:check',
  updatesInstall: 'updates:install',
  updatesStatus: 'updates:status',
  updatesStateChanged: 'updates:state-changed'
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
    export: () => invoke(channels.diagnosticsExport),
    onProgress: (callback) => subscribe(channels.diagnosticsProgress, callback)
  }),
  updates: Object.freeze({
    check: () => invoke(channels.updatesCheck),
    install: () => invoke(channels.updatesInstall),
    status: () => invoke(channels.updatesStatus),
    onStateChanged: (callback) => subscribe(channels.updatesStateChanged, callback)
  })
});

contextBridge.exposeInMainWorld('animeDesk', animeDeskApi);
