const UPDATE_ERROR_MESSAGES = Object.freeze({
  incompleteRelease:
    'A versão publicada no GitHub está sem os arquivos necessários para atualização. Tente novamente mais tarde ou instale a versão mais recente manualmente.',
  network:
    'Não foi possível acessar o servidor de atualizações. Verifique sua conexão com a internet e tente novamente.',
  generic: 'Não foi possível verificar atualizações agora. Tente novamente mais tarde.'
});

function createUpdateErrorPayload(error, extra = {}) {
  const technicalMessage = error?.stack || error?.message || String(error);
  const normalized = String(technicalMessage || '').toLowerCase();
  let code = 'UPDATE_CHECK_FAILED';
  let message = UPDATE_ERROR_MESSAGES.generic;

  if (
    normalized.includes('latest.yml') ||
    normalized.includes('cannot find latest') ||
    normalized.includes('httperror: 404')
  ) {
    code = 'UPDATE_RELEASE_INCOMPLETE';
    message = UPDATE_ERROR_MESSAGES.incompleteRelease;
  } else if (
    /enotfound|econnreset|econnrefused|etimedout|err_internet|err_network|network error/.test(
      normalized
    )
  ) {
    code = 'UPDATE_NETWORK_ERROR';
    message = UPDATE_ERROR_MESSAGES.network;
  }

  return {
    ...extra,
    code,
    message,
    technicalMessage
  };
}

module.exports = { createUpdateErrorPayload, UPDATE_ERROR_MESSAGES };
