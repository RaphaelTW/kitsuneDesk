class AuthController {
  constructor(authService) {
    this.authService = authService;
  }

  setupStatus() {
    return this.authService.setupStatus();
  }

  createInitialAdmin(payload) {
    return this.authService.createInitialAdmin(payload);
  }

  login(payload) {
    return this.authService.login(payload);
  }

  logout() {
    return this.authService.logout();
  }

  session() {
    return this.authService.session();
  }

  changePassword(payload) {
    return this.authService.changePassword(payload);
  }

  listUsers() {
    return this.authService.listUsers();
  }

  createUser(payload) {
    return this.authService.createUser(payload);
  }

  updateUser(payload) {
    return this.authService.updateUser(payload);
  }

  resetUserPassword(payload) {
    return this.authService.resetUserPassword(payload);
  }
}

module.exports = AuthController;
