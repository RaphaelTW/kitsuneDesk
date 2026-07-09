const handleRequest = require('./handleRequest');

function registerCacheHandlers(ipcMain, cacheController) {
  const handle = (channel, action) => {
    ipcMain.handle(channel, (_event, payload) => handleRequest('CACHE', () => action(payload)));
  };
  handle('cache:image', (payload) => cacheController.image(payload));
  handle('cache:stats', () => cacheController.stats());
  handle('cache:clear', () => cacheController.clear());
  handle('avatars:get', (payload) => cacheController.avatar(payload));
  handle('avatars:styles', () => cacheController.avatarStyles());
}

module.exports = { registerCacheHandlers };
