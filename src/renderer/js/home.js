import { animeDesk, hasAnimeDeskApi } from './api.js';
import { clearSession, requireSession } from './auth.js';
import { showToast } from './components/toast.js';

const platformNames = Object.freeze({
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux'
});

document.addEventListener('DOMContentLoaded', () => {
  const session = requireSession();

  if (!session) {
    return;
  }

  enableTooltips();
  hydrateSession(session);
  hydrateAppInfo();
  hydratePlayerStatus();
  bindAniCliForm();
  bindDependencyActions();
  bindHealthCheck();
  bindLogout();
});

/**
 * @param {object} session
 */
function hydrateSession(session) {
  document.getElementById('current-user').textContent = session.user.name;
}

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

async function hydratePlayerStatus() {
  const badge = document.getElementById('ani-cli-status');
  const alert = document.getElementById('dependency-alert');
  const actions = document.getElementById('dependency-actions');

  try {
    const result = await animeDesk.player.status();

    if (!result.ok) {
      setDependencyStatus({
        badge,
        alert,
        actions,
        ready: false,
        message: result.error?.message ?? 'Nao foi possivel verificar as dependencias.'
      });
      return;
    }

    const status = result.data;
    const missing = getMissingDependencies(status);

    setDependencyStatus({
      badge,
      alert,
      actions,
      ready: status.ready,
      message: status.ready
        ? 'ani-cli, Git Bash e MPV encontrados.'
        : `Faltando: ${missing.join(', ')}.\n\nInstale com:\n${status.installCommands.join('\n')}`
    });
  } catch (error) {
    setDependencyStatus({
      badge,
      alert,
      actions,
      ready: false,
      message: error.message || 'Nao foi possivel verificar as dependencias.'
    });
  }
}

function bindDependencyActions() {
  const installButton = document.getElementById('install-dependencies-button');
  const refreshButton = document.getElementById('refresh-dependencies-button');

  installButton.addEventListener('click', async () => {
    installButton.disabled = true;

    try {
      const result = await animeDesk.player.installDependencies();

      if (!result.ok) {
        showToast({
          title: 'Instalacao',
          message: result.error?.message ?? 'Nao foi possivel abrir o instalador.',
          variant: 'error'
        });
        return;
      }

      showToast({
        title: 'Instalacao',
        message: `Abrindo instalador no ${result.data.terminal}.`,
        variant: 'success'
      });
    } finally {
      installButton.disabled = false;
    }
  });

  refreshButton.addEventListener('click', hydratePlayerStatus);
}

function bindAniCliForm() {
  const form = document.getElementById('ani-cli-form');
  const button = document.getElementById('ani-cli-submit');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const query = String(formData.get('query') ?? '').trim();

    if (query.length < 2) {
      showToast({
        title: 'Pesquisa',
        message: 'Digite pelo menos dois caracteres.',
        variant: 'warning'
      });
      return;
    }

    button.disabled = true;

    try {
      const result = await animeDesk.player.play({
        query,
        language: formData.get('language'),
        quality: formData.get('quality')
      });

      if (!result.ok) {
        showToast({
          title: 'ani-cli',
          message: result.error?.message ?? 'Nao foi possivel abrir o ani-cli.',
          variant: 'error'
        });
        await hydratePlayerStatus();
        return;
      }

      showToast({
        title: 'ani-cli',
        message: `Abrindo no ${result.data.terminal}.`,
        variant: 'success'
      });
    } finally {
      button.disabled = false;
    }
  });
}

/**
 * @param {object} status
 * @returns {string[]}
 */
function getMissingDependencies(status) {
  const missing = [];

  if (!status.dependencies.aniCli.available) {
    missing.push('ani-cli');
  }

  if (!status.dependencies.gitBash.available) {
    missing.push('Git Bash');
  }

  if (!status.dependencies.mpv.available) {
    missing.push('MPV');
  }

  if (!status.dependencies.fzf.available) {
    missing.push('fzf');
  }

  if (!status.dependencies.ffmpeg.available) {
    missing.push('ffmpeg');
  }

  return missing;
}

/**
 * @param {{badge: HTMLElement, alert: HTMLElement, actions: HTMLElement, ready: boolean, message: string}} options
 */
function setDependencyStatus({ badge, alert, actions, ready, message }) {
  badge.textContent = ready ? 'ani-cli pronto' : 'Dependencias pendentes';
  badge.classList.toggle('is-ready', ready);
  badge.classList.toggle('is-missing', !ready);
  alert.textContent = message;
  alert.classList.toggle('d-none', ready);
  actions.classList.toggle('d-none', ready);
}

function bindLogout() {
  const button = document.getElementById('logout-button');

  button.addEventListener('click', async () => {
    button.disabled = true;

    try {
      await animeDesk.auth.logout();
    } finally {
      clearSession();
      window.location.href = './login.html';
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
