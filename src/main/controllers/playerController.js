class PlayerController {
  /**
   * @param {import('../services/playerService')} playerService
   */
  constructor(playerService) {
    this.playerService = playerService;
  }

  /** @param {unknown} payload */
  searchAnimes(payload) {
    return this.playerService.searchAnimes(payload);
  }

  /** @param {unknown} payload */
  listEpisodes(payload) {
    return this.playerService.listEpisodes(payload);
  }

  /** @param {unknown} payload */
  playEpisode(payload) {
    return this.playerService.playEpisode(payload);
  }

  /**
   * Abre apenas provedores legados que ainda usam terminal.
   * @param {unknown} payload
   */
  openLegacy(payload) {
    return this.playerService.play(payload);
  }

  /** Compatibilidade com a API anterior. @param {unknown} payload */
  play(payload) {
    return this.openLegacy(payload);
  }

  installDependencies(payload) {
    return this.playerService.installDependencies(payload);
  }

  pause() {
    return this.playerService.pause();
  }

  resume() {
    return this.playerService.resume();
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
    return this.playerService.status();
  }
}

module.exports = PlayerController;
