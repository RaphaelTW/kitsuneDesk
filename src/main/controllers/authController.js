class AuthController {
  /**
   * @param {import('../services/authService')} authService
   */
  constructor(authService) {
    this.authService = authService;
  }

  /**
   * @param {unknown} payload
   * @returns {Promise<object>}
   */
  login(payload) {
    return this.authService.login(payload);
  }

  logout() {
    return this.authService.logout();
  }

  /**
   * @param {unknown} payload
   * @returns {Promise<object>}
   */
  changePassword(payload) {
    return this.authService.changePassword(payload);
  }
}

module.exports = AuthController;
