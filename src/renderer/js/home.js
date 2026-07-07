import { animeDesk, hasAnimeDeskApi } from './api.js';
import { clearSession, requireSession } from './auth.js';
import { showToast } from './components/toast.js';

const platformNames = Object.freeze({
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux'
});

let currentProviderStatus = null;

document.addEventListener('DOMContentLoaded', () => {
  const session = requireSession();

  if (!session) {
    return;
  }

  enableTooltips();
  hydrateSession(session);
  hydrateAppInfo();
  hydratePlayerStatus();
  bindProviderForm();
  bindProviderSelection();
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
  const healthCheckButton = document.getElementById('health-check-button');

  if (!hasAnimeDeskApi()) {
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
  } catch (error) {
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
  const badge = document.getElementById('provider-status');
  const alert = document.getElementById('dependency-alert');
  const installGoAnimeButton = document.getElementById('install-goanime-button');
  const installAniCliButton = document.getElementById('install-anicli-button');

  badge.textContent = 'Verificando provedores';
  badge.classList.remove('is-ready', 'is-missing', 'is-warning');

  try {
    const result = await animeDesk.player.status();

    if (!result.ok) {
      throw new Error(result.error?.message ?? 'Nao foi possivel verificar os provedores.');
    }

    const status = result.data;
    currentProviderStatus = status;

    updateProviderCards(status);

    installGoAnimeButton.classList.toggle('d-none', status.providers.goAnime.ready);
    installAniCliButton.classList.toggle('d-none', status.providers.aniCli.ready);

    if (status.providers.goAnime.ready) {
      badge.textContent = 'GoAnime pronto';
      badge.classList.add('is-ready');
      alert.classList.add('d-none');
      alert.textContent = '';
      return;
    }

    if (status.providers.aniCli.ready) {
      badge.textContent = 'ani-cli ativo';
      badge.classList.add('is-warning');
      alert.classList.remove('d-none');
      alert.textContent =
        'GoAnime ainda nao esta instalado. O modo automatico usara o ani-cli como fallback.\n\nUse o botao Instalar GoAnime para ativar o provedor recomendado.';
      return;
    }

    badge.textContent = 'Provedores pendentes';
    badge.classList.add('is-missing');
    alert.classList.remove('d-none');
    alert.textContent = buildMissingProvidersMessage(status);
  } catch (error) {
    currentProviderStatus = null;
    badge.textContent = 'Falha na verificacao';
    badge.classList.add('is-missing');
    alert.classList.remove('d-none');
    alert.textContent = error.message || 'Nao foi possivel verificar os provedores.';
  }
}

/**
 * @param {object} status
 */
function updateProviderCards(status) {
  const goAnimeStatus = document.getElementById('goanime-status');
  const mpvStatus = document.getElementById('mpv-status');
  const aniCliStatus = document.getElementById('anicli-status');

  goAnimeStatus.textContent = status.providers.goAnime.ready
    ? `Pronto em ${shortPath(status.dependencies.goAnime.path)}`
    : 'Nao instalado';

  mpvStatus.textContent = status.dependencies.mpv.available
    ? status.dependencies.mpv.bundledWithGoAnime
      ? 'Incluido no GoAnime'
      : `Encontrado em ${shortPath(status.dependencies.mpv.path)}`
    : 'Nao encontrado';

  aniCliStatus.textContent = status.providers.aniCli.ready
    ? 'Fallback pronto'
    : 'Fallback opcional nao configurado';
}

/**
 * @param {object} status
 * @returns {string}
 */
function buildMissingProvidersMessage(status) {
  const aniCliMissing = [];

  if (!status.dependencies.aniCli.available) aniCliMissing.push('ani-cli');
  if (!status.dependencies.gitBash.available) aniCliMissing.push('Git Bash');
  if (!status.dependencies.mpv.available) aniCliMissing.push('MPV');
  if (!status.dependencies.fzf.available) aniCliMissing.push('fzf');
  if (!status.dependencies.ffmpeg.available) aniCliMissing.push('ffmpeg');

  const fallbackDetails =
    aniCliMissing.length > 0
      ? `Fallback ani-cli faltando: ${aniCliMissing.join(', ')}.`
      : 'Fallback ani-cli pronto.';

  return [
    'GoAnime nao foi encontrado.',
    '',
    'Use o botao Instalar GoAnime. O instalador oficial inclui o MPV.',
    '',
    fallbackDetails
  ].join('\n');
}

function bindDependencyActions() {
  const installGoAnimeButton = document.getElementById('install-goanime-button');
  const installAniCliButton = document.getElementById('install-anicli-button');
  const refreshButton = document.getElementById('refresh-dependencies-button');

  installGoAnimeButton.addEventListener('click', () =>
    openProviderInstaller({
      button: installGoAnimeButton,
      provider: 'goanime',
      label: 'GoAnime'
    })
  );

  installAniCliButton.addEventListener('click', () =>
    openProviderInstaller({
      button: installAniCliButton,
      provider: 'ani-cli',
      label: 'ani-cli'
    })
  );

  refreshButton.addEventListener('click', async () => {
    refreshButton.disabled = true;

    try {
      await hydratePlayerStatus();
    } finally {
      refreshButton.disabled = false;
    }
  });
}

/**
 * @param {{button: HTMLButtonElement, provider: string, label: string}} options
 */
async function openProviderInstaller({ button, provider, label }) {
  button.disabled = true;

  try {
    const result = await animeDesk.player.installDependencies(provider);

    if (!result.ok) {
      showToast({
        title: 'Instalacao',
        message: result.error?.message ?? `Nao foi possivel abrir o instalador do ${label}.`,
        variant: 'error'
      });
      return;
    }

    showToast({
      title: 'Instalacao',
      message: `Instalador do ${label} aberto no ${result.data.terminal}.`,
      variant: 'success'
    });
  } finally {
    button.disabled = false;
  }
}

function bindProviderForm() {
  const form = document.getElementById('provider-form');
  const button = document.getElementById('provider-submit');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const query = String(formData.get('query') ?? '').trim();
    const provider = String(formData.get('provider') ?? 'auto');

    if (query.length < 2) {
      showToast({
        title: 'Pesquisa',
        message: 'Digite pelo menos dois caracteres.',
        variant: 'warning'
      });
      return;
    }

    if (!canUseProvider(provider)) {
      showToast({
        title: 'Provedor indisponivel',
        message: getUnavailableProviderMessage(provider),
        variant: 'warning'
      });
      return;
    }

    button.disabled = true;

    try {
      const result = await animeDesk.player.play({
        query,
        provider,
        language: formData.get('language'),
        quality: formData.get('quality')
      });

      if (!result.ok) {
        showToast({
          title: 'Reproducao',
          message: result.error?.message ?? 'Nao foi possivel abrir o provedor.',
          variant: 'error'
        });
        await hydratePlayerStatus();
        return;
      }

      showToast({
        title: result.data.providerName,
        message: `Abrindo no ${result.data.terminal}.`,
        variant: 'success'
      });
    } finally {
      button.disabled = false;
    }
  });
}

function bindProviderSelection() {
  const providerSelect = document.getElementById('provider-filter');
  const languageSelect = document.getElementById('language-filter');
  const hint = document.getElementById('provider-hint');

  const updateHint = () => {
    const provider = providerSelect.value;
    const language = languageSelect.value;

    if (provider === 'ani-cli') {
      hint.textContent =
        'O ani-cli e o fallback. Ele abre no Git Bash e depende de fzf, ffmpeg, MPV e OpenSSL.';
      return;
    }

    if (language === 'dub') {
      hint.textContent =
        'No GoAnime, Dublado / PT-BR prioriza a fonte ptbr. A disponibilidade depende das fontes ativas.';
      return;
    }

    hint.textContent =
      'No GoAnime, Legendado pesquisa nas fontes ativas. A selecao do titulo e do episodio acontece na TUI aberta automaticamente.';
  };

  providerSelect.addEventListener('change', updateHint);
  languageSelect.addEventListener('change', updateHint);
  updateHint();
}

/**
 * @param {string} provider
 * @returns {boolean}
 */
function canUseProvider(provider) {
  if (!currentProviderStatus) {
    return true;
  }

  if (provider === 'goanime') {
    return currentProviderStatus.providers.goAnime.ready;
  }

  if (provider === 'ani-cli') {
    return currentProviderStatus.providers.aniCli.ready;
  }

  return currentProviderStatus.ready;
}

/**
 * @param {string} provider
 * @returns {string}
 */
function getUnavailableProviderMessage(provider) {
  if (provider === 'goanime') {
    return 'GoAnime nao esta instalado. Clique em Instalar GoAnime.';
  }

  if (provider === 'ani-cli') {
    return 'O fallback ani-cli ainda nao esta configurado.';
  }

  return 'Nenhum provedor esta pronto. Instale o GoAnime.';
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
 * @param {string | null} value
 * @returns {string}
 */
function shortPath(value) {
  if (!value) {
    return 'caminho desconhecido';
  }

  const parts = value.split(/[\\/]/);
  return parts.slice(-3).join('\\');
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
