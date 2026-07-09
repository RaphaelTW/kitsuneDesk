const handleRequest = require('./handleRequest');

function registerPlayerHandlers(ipcMain, playerController) {
  const handle = (channel, action) => {
    ipcMain.handle(channel, (event, payload) =>
      handleRequest('PLAYER', () => action(payload, event.sender))
    );
  };

  handle('animes:search', (payload) => playerController.searchAnimes(payload));
  handle('animes:episodes', (payload) => playerController.listEpisodes(payload));
  handle('player:play-episode', (payload) => playerController.playEpisode(payload));
  handle('player:open-legacy', (payload) => playerController.openLegacy(payload));
  handle('player:open-tool', (payload) => playerController.openTool(payload));
  handle('player:play', (payload) => playerController.play(payload));
  handle('player:install-dependencies', (payload, sender) =>
    playerController.installDependencies(payload, sender)
  );
  handle('player:cancel-installation', (payload) => playerController.cancelInstallation(payload));
  handle('player:pause', () => playerController.pause());
  handle('player:resume', () => playerController.resume());
  handle('player:toggle-pause', () => playerController.togglePause());
  handle('player:seek', (payload) => playerController.seek(payload));
  handle('player:set-volume', (payload) => playerController.setVolume(payload));
  handle('player:next', () => playerController.next());
  handle('player:previous', () => playerController.previous());
  handle('player:stop', () => playerController.stop());
  handle('player:status', () => playerController.status());
  handle('player:playback-state', () => playerController.playbackState());
  handle('providers:health', () => playerController.providerHealth());
}

module.exports = { registerPlayerHandlers };
