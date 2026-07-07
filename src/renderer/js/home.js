import { animeDesk, hasAnimeDeskApi } from './api.js';
import { showToast } from './components/toast.js';

const platformNames = Object.freeze({
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux'
});

document.addEventListener('DOMContentLoaded', () => {
  enableTooltips();
  hydrateAppInfo();
  bindHealthCheck();
});

function enableTooltips() {
  document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((element) => {
    new bootstrap.Tooltip(element);
  });
}

async function hydrateAppInfo() {
  const preloadStatus = document.getElementById('preload-status');
  const healthCheckButton = document.getElementById('health-check-button');

  if (!hasAnimeDeskApi()) {
    preloadStatus.textContent = 'API local indisponivel';
    healthCheckButton.disabled = true;
    showToast({
      title: 'Preload',
      message: 'A API segura nao foi encontrada no renderer.',
      variant: 'error'
    });
    return;
  }

  try {
    const appInfo = await animeDesk.app.getInfo();
    const platform = platformNames[appInfo.platform] ?? appInfo.platform;

    document.getElementById('app-version').textContent = `v${appInfo.version}`;
    document.getElementById('app-platform').textContent = platform;
    preloadStatus.textContent = appInfo.isPackaged
      ? 'API local empacotada'
      : 'API local em desenvolvimento';
  } catch (error) {
    preloadStatus.textContent = 'Falha ao consultar API local';
    showToast({
      title: 'Aplicacao',
      message: error.message || 'Nao foi possivel ler as informacoes da aplicacao.',
      variant: 'error'
    });
  }
}

function bindHealthCheck() {
  const button = document.getElementById('health-check-button');

  button.addEventListener('click', async () => {
    button.disabled = true;

    try {
      const result = await animeDesk.app.ping();
      showToast({
        title: 'Comunicacao local',
        message: result.ok
          ? `Resposta recebida em ${formatTime(result.checkedAt)}.`
          : 'Sem resposta.',
        variant: result.ok ? 'success' : 'warning'
      });
    } catch (error) {
      showToast({
        title: 'Comunicacao local',
        message: error.message || 'Nao foi possivel consultar o processo principal.',
        variant: 'error'
      });
    } finally {
      button.disabled = false;
    }
  });
}

/**
 * @param {string} isoDate
 * @returns {string}
 */
function formatTime(isoDate) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(isoDate));
}
