const handleRequest = require('./handleRequest');

function registerAuthHandlers(ipcMain, authController) {
  const handle = (channel, action) => {
    ipcMain.handle(channel, (_event, payload) => handleRequest('AUTH', () => action(payload)));
  };

  handle('auth:setup-status', () => authController.setupStatus());
  handle('auth:create-initial-admin', (payload) => authController.createInitialAdmin(payload));
  handle('auth:login', (payload) => authController.login(payload));
  handle('auth:logout', () => authController.logout());
  handle('auth:session', () => authController.session());
  handle('auth:change-password', (payload) => authController.changePassword(payload));
  handle('users:list', () => authController.listUsers());
  handle('users:create', (payload) => authController.createUser(payload));
  handle('users:update', (payload) => authController.updateUser(payload));
  handle('users:reset-password', (payload) => authController.resetUserPassword(payload));
}

module.exports = { registerAuthHandlers };
