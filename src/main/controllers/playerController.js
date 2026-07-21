class PlayerController {
  constructor(playerService) {
    this.playerService = playerService;
  }

  searchAnimes(payload) {
    return this.playerService.searchAnimes(payload);
  }

  listEpisodes(payload) {
    return this.playerService.listEpisodes(payload);
  }

  playEpisode(payload) {
    return this.playerService.playEpisode(payload);
  }

  openLegacy(payload) {
    return this.playerService.play(payload);
  }

  play(payload) {
    return this.openLegacy(payload);
  }

  openTool(payload) {
    return this.playerService.openTool(payload);
  }

  installDependencies(payload, webContents) {
    return this.playerService.installDependencies(payload, webContents);
  }

  cancelInstallation(payload) {
    return this.playerService.cancelInstallation(payload);
  }

  pause() {
    return this.playerService.pause();
  }

  resume() {
    return this.playerService.resume();
  }

  togglePause() {
    return this.playerService.togglePause();
  }

  seek(payload) {
    return this.playerService.seek(payload);
  }

  setVolume(payload) {
    return this.playerService.setVolume(payload);
  }

  next() {
    return this.playerService.next();
  }

  previous() {
    return this.playerService.previous();
  }

  stop() {
    return this.playerService.stop();
  }

  status() {
    return this.playerService.statusAsync();
  }

  playbackState() {
    return this.playerService.playbackState();
  }

  queue() {
    return this.playerService.queue();
  }

  reorderQueue(payload) {
    return this.playerService.reorderQueue(payload);
  }

  providerHealth() {
    return this.playerService.providerHealth();
  }

  on(eventName, listener) {
    this.playerService.on(eventName, listener);
  }
}

module.exports = PlayerController;
