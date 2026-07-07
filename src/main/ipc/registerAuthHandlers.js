const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {import('../controllers/authController')} authController
 */
function registerAuthHandlers(ipcMain, authController) {
  ipcMain.handle('auth:login', (_event, payload) =>
    handleRequest(() => authController.login(payload))
  );
  ipcMain.handle('auth:logout', () => handleRequest(() => authController.logout()));
  ipcMain.handle('auth:change-password', (_event, payload) =>
    handleRequest(() => authController.changePassword(payload))
  );
}

/**
 * @param {() => Promise<object> | object} action
 * @returns {Promise<{ok: boolean, data?: object, error?: object}>}
 */
async function handleRequest(action) {
  try {
    const data = await action();
    return { ok: true, data };
  } catch (error) {
    const appError = normalizeError(error);

    logger.warning('IPC_AUTH_ERROR', appError.publicMessage, {
      code: appError.code,
      status: appError.status
    });

    return {
      ok: false,
      error: {
        code: appError.code,
        message: appError.publicMessage,
        status: appError.status
      }
    };
  }
}

/**
 * @param {unknown} error
 * @returns {AppError}
 */
function normalizeError(error) {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError('UNKNOWN_ERROR', 'Nao foi possivel concluir a operacao.', {
    status: 500,
    technicalMessage: error?.message ?? String(error)
  });
}

module.exports = {
  registerAuthHandlers
};
