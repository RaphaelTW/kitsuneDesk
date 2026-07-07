const { contextBridge, ipcRenderer } = require('electron');

const channels = Object.freeze({
  appGetInfo: 'app:get-info',
  appPing: 'app:ping',
  authLogin: 'auth:login',
  authLogout: 'auth:logout',
  authChangePassword: 'auth:change-password',
  animesSearch: 'animes:search',
  animesDetails: 'animes:details',
  animesEpisodes: 'animes:episodes',
  playerPlay: 'player:play',
  playerInstallDependencies: 'player:install-dependencies',
  playerPause: 'player:pause',
  playerResume: 'player:resume',
  playerNext: 'player:next',
  playerPrevious: 'player:previous',
  playerStop: 'player:stop',
  playerStatus: 'player:status',
  historyList: 'history:list',
  historyRemove: 'history:remove',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update'
});

/**
 * Invoca um canal IPC permitido sem expor ipcRenderer ao renderer.
 *
 * @param {string} channel
 * @param {unknown} payload
 * @returns {Promise<unknown>}
 */
function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload);
}

const animeDeskApi = Object.freeze({
  app: Object.freeze({
    getInfo: () => invoke(channels.appGetInfo),
    ping: () => invoke(channels.appPing)
  }),
  auth: Object.freeze({
    login: (credentials) => invoke(channels.authLogin, credentials),
    logout: () => invoke(channels.authLogout),
    changePassword: (payload) => invoke(channels.authChangePassword, payload)
  }),
  animes: Object.freeze({
    search: (filters) => invoke(channels.animesSearch, filters),
    details: (animeId, language) => invoke(channels.animesDetails, { animeId, language }),
    episodes: (animeId, language) => invoke(channels.animesEpisodes, { animeId, language })
  }),
  player: Object.freeze({
    play: (payload) => invoke(channels.playerPlay, payload),
    installDependencies: () => invoke(channels.playerInstallDependencies),
    pause: () => invoke(channels.playerPause),
    resume: () => invoke(channels.playerResume),
    next: () => invoke(channels.playerNext),
    previous: () => invoke(channels.playerPrevious),
    stop: () => invoke(channels.playerStop),
    status: () => invoke(channels.playerStatus)
  }),
  history: Object.freeze({
    list: (filters) => invoke(channels.historyList, filters),
    remove: (historyId) => invoke(channels.historyRemove, { historyId })
  }),
  settings: Object.freeze({
    get: () => invoke(channels.settingsGet),
    update: (payload) => invoke(channels.settingsUpdate, payload)
  })
});

contextBridge.exposeInMainWorld('animeDesk', animeDeskApi);
