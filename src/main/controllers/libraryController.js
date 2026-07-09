class LibraryController {
  constructor(libraryService) {
    this.libraryService = libraryService;
  }

  dashboard() {
    return this.libraryService.dashboard();
  }

  continueWatching() {
    return this.libraryService.continueWatching();
  }

  history(payload) {
    return this.libraryService.history(payload);
  }

  exportHistoryCsv(payload) {
    return this.libraryService.exportHistoryCsv(payload);
  }

  favorites() {
    return this.libraryService.favorites();
  }

  watchlist() {
    return this.libraryService.watchlist();
  }

  toggleFavorite(payload) {
    return this.libraryService.toggleFavorite(payload);
  }

  toggleWatchlist(payload) {
    return this.libraryService.toggleWatchlist(payload);
  }

  collectionState(payload) {
    return this.libraryService.collectionState(payload);
  }

  removeHistory(payload) {
    return this.libraryService.removeHistory(payload);
  }

  clearHistory() {
    return this.libraryService.clearHistory();
  }

  markCompleted(payload) {
    return this.libraryService.markCompleted(payload);
  }

  report(payload) {
    return this.libraryService.report(payload);
  }
}

module.exports = LibraryController;
