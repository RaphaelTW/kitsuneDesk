class PlayerController {
  /**
   * @param {import('../services/playerService')} playerService
   */
  constructor(playerService) {
    this.playerService = playerService;
  }

  /**
   * @param {unknown} payload
   * @returns {object}
   */
  play(payload) {
    return this.playerService.play(payload);
  }

  installDependencies() {
    return this.playerService.installDependencies();
  }

  pause() {
    return this.playerService.notImplemented('Pausar pelo MPV entra na etapa de JSON IPC.');
  }

  resume() {
    return this.playerService.notImplemented('Continuar pelo MPV entra na etapa de JSON IPC.');
  }

  next() {
    return this.playerService.notImplemented('Proximo episodio entra na etapa de controle do MPV.');
  }

  previous() {
    return this.playerService.notImplemented(
      'Episodio anterior entra na etapa de controle do MPV.'
    );
  }

  stop() {
    return this.playerService.notImplemented('Parar pelo app entra na etapa de controle do MPV.');
  }

  status() {
    return this.playerService.status();
  }
}

module.exports = PlayerController;
