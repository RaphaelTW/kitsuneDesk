const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {import('../controllers/playerController')} playerController
 */
function registerPlayerHandlers(ipcMain, playerController) {
  ipcMain.handle('player:play', (_event, payload) =>
    handleRequest(() => playerController.play(payload))
  );
  ipcMain.handle('player:install-dependencies', (_event, payload) =>
    handleRequest(() => playerController.installDependencies(payload))
  );
  ipcMain.handle('player:pause', () => handleRequest(() => playerController.pause()));
  ipcMain.handle('player:resume', () => handleRequest(() => playerController.resume()));
  ipcMain.handle('player:next', () => handleRequest(() => playerController.next()));
  ipcMain.handle('player:previous', () => handleRequest(() => playerController.previous()));
  ipcMain.handle('player:stop', () => handleRequest(() => playerController.stop()));
  ipcMain.handle('player:status', () => handleRequest(() => playerController.status()));
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

    logger.warning('IPC_PLAYER_ERROR', appError.publicMessage, {
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

  return new AppError('UNKNOWN_ERROR', 'Nao foi possivel iniciar o player.', {
    status: 500,
    technicalMessage: error?.message ?? String(error)
  });
}

module.exports = {
  registerPlayerHandlers
};
