const handleRequest = require('./handleRequest');

function registerLibraryHandlers(ipcMain, libraryController) {
  const handle = (channel, action) => {
    ipcMain.handle(channel, (_event, payload) => handleRequest('LIBRARY', () => action(payload)));
  };

  handle('library:dashboard', () => libraryController.dashboard());
  handle('library:continue', () => libraryController.continueWatching());
  handle('history:list', (payload) => libraryController.history(payload));
  handle('history:export-csv', (payload) => libraryController.exportHistoryCsv(payload));
  handle('history:remove', (payload) => libraryController.removeHistory(payload));
  handle('history:clear', () => libraryController.clearHistory());
  handle('history:mark-completed', (payload) => libraryController.markCompleted(payload));
  handle('favorites:list', () => libraryController.favorites());
  handle('favorites:toggle', (payload) => libraryController.toggleFavorite(payload));
  handle('watchlist:list', () => libraryController.watchlist());
  handle('watchlist:toggle', (payload) => libraryController.toggleWatchlist(payload));
  handle('library:collection-state', (payload) => libraryController.collectionState(payload));
  handle('reports:create', (payload) => libraryController.report(payload));
}

module.exports = { registerLibraryHandlers };
