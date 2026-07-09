const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

async function handleRequest(scope, action) {
  try {
    const data = await action();
    return { ok: true, data };
  } catch (error) {
    const appError =
      error instanceof AppError
        ? error
        : new AppError('UNKNOWN_ERROR', 'Não foi possível concluir a operação.', {
            status: 500,
            technicalMessage: error?.message ?? String(error)
          });

    logger.warning(`IPC_${scope}_ERROR`, appError.publicMessage, {
      code: appError.code,
      status: appError.status,
      technicalMessage: appError.technicalMessage
    });

    return {
      ok: false,
      error: {
        code: appError.code,
        message: appError.publicMessage,
        status: appError.status,
        technicalMessage:
          process.env.NODE_ENV === 'development' ? appError.technicalMessage : undefined
      }
    };
  }
}

module.exports = handleRequest;
