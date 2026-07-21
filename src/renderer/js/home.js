import { animeDesk, hasAnimeDeskApi } from './api.js';
import { clearSession, requireSession } from './auth.js';
import { showToast } from './components/toast.js';
import { applyInterfaceLanguage, translate } from './i18n.js';
import { createNavigationController } from './navigation.mjs';
import {
  debounce,
  deferTask,
  downloadTextFile,
  parseJson,
  readJsonStorage,
  writeJsonStorage
} from './utils/runtime.js';
import { formatBytes } from './views/formatters.js';
import { state } from './app/state.js';
import { viewMeta, viewModules } from './app/viewRegistry.js';

const fallbackCover = '../../../assets/icons/kitsunedesk-icon-512.png';
const STARTUP_SNAPSHOT_KEY = 'kitsunedesk.startup-snapshot.v1';
const STARTUP_MARKER_KEY = 'kitsunedesk.startup-marker.v1';
const AVATAR_SNAPSHOT_KEY = 'kitsunedesk.avatar-cache.v1';
const PROVIDER_STATUS_SNAPSHOT_KEY = 'kitsunedesk.provider-status.v1';
const SNAPSHOT_TTL_MS = 12 * 60 * 60 * 1000;
const AVATAR_SNAPSHOT_LIMIT = 80;
const startupStartedAt = performance.now();
let startupSnapshotRestored = false;
let startupType = 'cold';
let activeInterfaceLanguage = null;
const installationDefinitions = Object.freeze({
  goanime: ['GoAnime clássico', 'MPV', 'Runtime Go', 'Código GoAnime', 'Bridge gráfico'],
  'goanime-gui': ['GoAnime clássico', 'MPV', 'Runtime Go', 'Código GoAnime', 'Bridge gráfico'],
  'anime-cli-br': ['Python 3.12', 'VLC', 'Código anime-cli-br', 'Ambiente virtual'],
  'ani-cli': ['Git Bash', 'fzf', 'FFmpeg', 'MPV', 'OpenSSL', 'ani-cli'],
  'fast-anime-vsr': ['Python 3.10', 'FFmpeg', 'FAST Anime VSR', 'PyTorch', 'GPU/CUDA']
});

const modals = {};
const activatedFeatures = new Set();
const featureActivationPromises = new Map();
let navigationController = null;
let playerFeaturePromise = null;
let backupFeaturePromise = null;
let usersFeaturePromise = null;
let telemetryFeaturePromise = null;
let searchFeaturePromise = null;
let libraryFeaturePromise = null;
let maintenanceFeaturePromise = null;
const $ = (id) => document.getElementById(id);

function getPlayerFeature() {
  if (!playerFeaturePromise) {
    playerFeaturePromise = Promise.resolve(globalThis.kitsuneDeskPlayerComponentsReady)
      .then((ready) => {
        if (ready === false)
          throw new Error('Os componentes do player não puderam ser carregados.');
        return import('./views/player.js');
      })
      .then(({ createPlayerFeature }) => {
        const feature = createPlayerFeature({
          $,
          animeDesk,
          cleanEpisode,
          debounce,
          emptyState,
          fallbackCover,
          formatTime,
          getModal,
          iconButton,
          notifyResult,
          notifyResultError,
          openReportModal,
          state,
          translate,
          showToast
        });
        feature.bind();
        return feature;
      });
  }
  return playerFeaturePromise;
}

function getBackupFeature() {
  if (!backupFeaturePromise) {
    backupFeaturePromise = import('./views/backup.js').then(({ createBackupFeature }) =>
      createBackupFeature({
        $,
        animeDesk,
        applyTheme,
        formatBytes,
        hydrateDashboard,
        notifyResult,
        notifyResultError,
        showToast,
        state
      })
    );
  }
  return backupFeaturePromise;
}

function getUsersFeature() {
  if (!usersFeaturePromise) {
    usersFeaturePromise = import('./views/admin.js').then(({ createUsersFeature }) =>
      createUsersFeature({
        $,
        animeDesk,
        escapeHtml,
        getModal,
        notifyResultError,
        setCachedAvatar,
        setVisualAlert,
        showToast,
        state,
        updateUserAvatarPreview
      })
    );
  }
  return usersFeaturePromise;
}

function getTelemetryFeature() {
  if (!telemetryFeaturePromise) {
    telemetryFeaturePromise = import('./views/telemetry.js').then(({ createTelemetryFeature }) =>
      createTelemetryFeature({
        $,
        animeDesk,
        emptyState,
        escapeHtml,
        notifyResult,
        notifyResultError,
        showToast,
        state
      })
    );
  }
  return telemetryFeaturePromise;
}

function getSearchFeature() {
  if (!searchFeaturePromise) {
    searchFeaturePromise = import('./views/search.js').then(({ createSearchFeature }) =>
      createSearchFeature({
        $,
        animeDesk,
        badge,
        cleanEpisode,
        collectionPayload,
        createImage,
        deferTask,
        emptyState,
        fallbackCover,
        hideLoading,
        hydratePlayerStatus,
        isProtectedAnime,
        notifyError,
        parentalUnlocked,
        requestParentalUnlock,
        setCollectionButton,
        showLoading,
        showToast,
        startEmbeddedPlayback: async (result, payload) =>
          (await getPlayerFeature()).startEmbeddedPlayback(result, payload),
        state,
        stripHtml,
        unwrap,
        updateSelectedProviderStatus
      })
    );
  }
  return searchFeaturePromise;
}

function getLibraryFeature() {
  if (!libraryFeaturePromise) {
    libraryFeaturePromise = import('./views/library.js').then(({ createLibraryFeature }) =>
      createLibraryFeature({
        $,
        animeDesk,
        cleanEpisode,
        collectionPayload,
        createImage,
        debounce,
        downloadTextFile,
        emptyState,
        findEpisodeIndex,
        formatHours,
        hideLoading,
        hydrateDashboard,
        iconButton,
        notifyError,
        notifyResultError,
        parseJson,
        selectAnime: async (anime) => (await getSearchFeature()).selectAnime(anime),
        setCollectionButton,
        showLoading,
        showToast,
        showView,
        startEpisode: async (payload) => (await getSearchFeature()).launchEpisode(payload),
        state,
        unwrap
      })
    );
  }
  return libraryFeaturePromise;
}

function getMaintenanceFeature() {
  if (!maintenanceFeaturePromise) {
    maintenanceFeaturePromise = import('./views/maintenance.js').then(
      ({ createMaintenanceFeature }) =>
        createMaintenanceFeature({
          $,
          animeDesk,
          applyTheme,
          hydratePlayerStatus,
          notifyResult,
          notifyResultError,
          showToast,
          startInstallation,
          state
        })
    );
  }
  return maintenanceFeaturePromise;
}

function getModal(name, elementId) {
  if (!modals[name]) modals[name] = new bootstrap.Modal($(elementId));
  return modals[name];
}

document.addEventListener('kitsunedesk:language-changed', () => {
  const activeView = document.querySelector('.nav-item.is-active[data-view]')?.dataset.view;
  if (activeView && viewMeta[activeView]) navigationController?.updateHeading(activeView);
});

function bootstrapHome() {
  state.session = requireSession();
  if (!state.session || !hasAnimeDeskApi()) return;

  hydrateProfile();
  bindNavigation();
  bindMaintenanceActions();
  bindModals();
  bindFailureTelemetry();
  subscribeEvents();
  startupSnapshotRestored = restoreStartupSnapshot();
  startupType = detectStartupType(startupSnapshotRestored);
  const shellReadyMs = performance.now() - startupStartedAt;
  applyLanguage(state.settings?.interfaceLanguage || 'pt-BR');

  $('provider-health-dot').className = 'status-dot is-checking';
  $('provider-health-summary').textContent = 'Clique para verificar';
  updateSelectedProviderStatus();

  if (state.session.user.role === 'ADMIN') {
    $('admin-nav-button').classList.remove('d-none');
  } else {
    document
      .querySelectorAll('.admin-backup-action')
      .forEach((element) => element.classList.add('d-none'));
  }

  const coreTask = hydrateCoreData();

  void coreTask.finally(() => {
    persistStartupSnapshot();
    void recordStartupPerformance(shellReadyMs, performance.now() - startupStartedAt);
  });

  void coreTask
    .then(() => {
      deferTask(async () => {
        const maintenance = await getMaintenanceFeature();
        await maintenance.hydrateUpdateStatus();
        if (
          state.settings?.checkUpdates &&
          ['idle', 'not-available'].includes(state.update?.state || 'idle')
        ) {
          await maintenance.checkUpdates(false);
        }
      }, 1400);
      deferTask(async () => (await getPlayerFeature()).hydrate(), 150);
      if (state.session.user.role === 'ADMIN') {
        deferTask(async () => (await getBackupFeature()).runDue(), 2200);
      }
    })
    .catch(() => {
      // A tela continua funcional usando as preferências em cache.
    });
  if (state.session.user.role === 'ADMIN') {
    deferTask(async () => (await getUsersFeature()).hydrateAvatarStyles(), 1000);
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootstrapHome, { once: true });
} else {
  bootstrapHome();
}

function hydrateProfile() {
  const user = state.session.user;
  $('current-user').textContent = user.name;
  $('current-role').textContent = user.role === 'ADMIN' ? 'Administrador' : 'Usuário';
  void setCachedAvatar($('profile-avatar'), user);
  $('profile-avatar').style.backgroundColor = user.profileColor || '#6f5cff';
}

async function hydrateCoreData() {
  const result = await animeDesk.app.bootstrap();
  if (!result.ok) throw new Error(result.error?.message || 'Falha ao carregar dados principais.');
  const data = result.data || {};
  state.appInfo = data.appInfo || state.appInfo;
  state.settings = data.settings || state.settings;
  state.dashboard = data.dashboard || state.dashboard;
  if (state.appInfo?.version) $('app-version').textContent = `v${state.appInfo.version}`;
  if (state.settings) {
    applyTheme(state.settings.theme);
    applyLanguage(state.settings.interfaceLanguage || 'pt-BR');
    applySettingsToSearch();
  }
  if (state.dashboard) renderDashboardSnapshot(state.dashboard);
}

function applyLanguage(language) {
  const nextLanguage = language || 'pt-BR';
  if (activeInterfaceLanguage === nextLanguage) return;
  if (activeInterfaceLanguage === null && nextLanguage === 'pt-BR') {
    activeInterfaceLanguage = 'pt-BR';
    document.body.dataset.interfaceLanguage = 'pt-BR';
    return;
  }
  activeInterfaceLanguage = applyInterfaceLanguage(nextLanguage);
}

function bindNavigation() {
  navigationController = createNavigationController({
    $,
    activateView: activateViewFeatures,
    applyLanguage: applyInterfaceLanguage,
    getLanguage: () => activeInterfaceLanguage || 'pt-BR',
    hydrateView,
    showToast,
    translate,
    viewMeta
  });
  navigationController.bind();
  $('brand-home-button').addEventListener('click', () => showView('home'));
  $('logout-button').addEventListener('click', async () => {
    if (state.playback?.active) await animeDesk.player.stop();
    await animeDesk.auth.logout();
    clearSession();
    window.location.href = './login.html';
  });
}

function showView(view) {
  return navigationController?.showView(view);
}

async function activateViewFeatures(view) {
  const modulePath = viewModules[view];
  if (!modulePath) return;
  const module = await import(modulePath);
  const binders = {
    search: async () => (await getSearchFeature()).bind(),
    library: async () => (await getLibraryFeature()).bind(),
    tools: bindTools,
    installation: bindInstallation,
    settings: bindSettings,
    backup: async () => (await getBackupFeature()).bind(),
    diagnostics: async () => (await getMaintenanceFeature()).bind(),
    telemetry: async () => (await getTelemetryFeature()).bind(),
    users: async () => (await getUsersFeature()).bind()
  };
  for (const feature of module.features || []) {
    if (activatedFeatures.has(feature) || !binders[feature]) continue;
    if (!featureActivationPromises.has(feature)) {
      const activation = Promise.resolve(binders[feature]())
        .then(() => activatedFeatures.add(feature))
        .catch((error) => {
          featureActivationPromises.delete(feature);
          throw error;
        });
      featureActivationPromises.set(feature, activation);
    }
    await featureActivationPromises.get(feature);
  }
}

async function hydrateView(view) {
  if (view === 'home') await hydrateDashboard();
  if (view === 'continue') await (await getLibraryFeature()).renderContinueView();
  if (view === 'lists') await (await getLibraryFeature()).renderLists();
  if (view === 'history') await (await getLibraryFeature()).renderHistoryView();
  if (view === 'tools') {
    renderPlayerStatus(state.playerStatus || readProviderStatusSnapshot());
    void hydratePlayerStatus();
  }
  if (view === 'settings') {
    await hydrateSettings();
    const backup = await getBackupFeature();
    await backup.hydrateCache();
    await backup.renderSchedules();
  }
  if (view === 'diagnostics') (await getMaintenanceFeature()).renderIdle();
  if (view === 'telemetry') await (await getTelemetryFeature()).render();
  if (view === 'admin' && state.session.user.role === 'ADMIN') {
    await (await getUsersFeature()).render();
  }
}

function bindMaintenanceActions() {
  $('provider-health-button').addEventListener('click', () => {
    const dot = $('provider-health-dot');
    dot.className = 'status-dot is-checking';
    $('provider-health-summary').textContent = 'Verificando provedores';
    void runMaintenanceAction((feature) => feature.hydrateProviderHealth());
  });
  $('updates-button').addEventListener('click', () => {
    void runMaintenanceAction((feature) => feature.openUpdates());
  });
  $('install-update-button').addEventListener('click', () => {
    void runMaintenanceAction((feature) => feature.installDownloadedUpdate());
  });
  $('dismiss-update-button').addEventListener('click', () => {
    state.updateBannerDismissed = true;
    $('update-banner').classList.add('d-none');
  });
}

async function runMaintenanceAction(action) {
  try {
    return await action(await getMaintenanceFeature());
  } catch (error) {
    showToast({
      title: 'Ação indisponível',
      message: error?.message || 'Não foi possível concluir a ação.',
      variant: 'error'
    });
    return null;
  }
}

async function hydrateDashboard() {
  const result = await animeDesk.library.dashboard();
  if (!result.ok) return;
  state.dashboard = result.data;
  renderDashboardSnapshot(result.data);
  deferTask(() => warmDashboardCovers(result.data), 1200);
}

function renderDashboardSnapshot(dashboard) {
  if (!dashboard) return;
  void getLibraryFeature().then((feature) => {
    feature.renderStats(dashboard.stats || {});
    feature.renderContinue($('home-continue-list'), dashboard.continueWatching || [], 8);
    feature.renderCollections($('home-favorites-list'), dashboard.favorites || [], 'favorites', 8);
    feature.renderHistory($('home-recent-list'), dashboard.recent || [], false, 8);
  });
}

async function warmDashboardCovers(dashboard) {
  const urls = [
    ...(dashboard?.continueWatching || []).map((item) => item.anime_cover),
    ...(dashboard?.favorites || []).map((item) => item.anime_cover),
    ...(dashboard?.watchlist || []).map((item) => item.anime_cover),
    ...(dashboard?.recent || []).map((item) => item.anime_cover)
  ].filter(Boolean);
  if (!urls.length || !animeDesk.cache?.warmImages) return;
  try {
    await animeDesk.cache.warmImages(urls, 'covers');
  } catch {
    // Aquecimento de cache nao pode afetar a abertura da tela inicial.
  }
}

function restoreStartupSnapshot() {
  const snapshot = readJsonStorage(STARTUP_SNAPSHOT_KEY);
  if (!snapshot || snapshot.userId !== state.session.user.id) return false;
  if (Date.now() - Number(snapshot.savedAt || 0) > SNAPSHOT_TTL_MS) return false;

  if (snapshot.appInfo?.version) {
    state.appInfo = snapshot.appInfo;
    $('app-version').textContent = `v${snapshot.appInfo.version}`;
  }
  if (snapshot.settings) {
    state.settings = snapshot.settings;
    applyTheme(snapshot.settings.theme);
    applySettingsToSearch();
  }
  if (snapshot.dashboard) {
    state.dashboard = snapshot.dashboard;
    renderDashboardSnapshot(snapshot.dashboard);
  }
  if (snapshot.playback) {
    void getPlayerFeature().then((feature) => feature.render(snapshot.playback));
  }
  return true;
}

async function recordStartupPerformance(shellReadyMs, coreReadyMs) {
  if (!state.settings?.startupMetricsEnabled) return;
  try {
    await animeDesk.diagnostics.recordStartupPerformance({
      shellReadyMs,
      coreReadyMs,
      snapshotRestored: startupSnapshotRestored,
      startupType
    });
  } catch {
    // Métricas opcionais nunca podem atrasar ou interromper a abertura.
  }
}

function detectStartupType(snapshotRestored) {
  const previousLaunch = Number(localStorage.getItem(STARTUP_MARKER_KEY) || 0);
  localStorage.setItem(STARTUP_MARKER_KEY, String(Date.now()));
  if (snapshotRestored) return 'snapshot';
  return previousLaunch > 0 ? 'warm' : 'cold';
}

function persistStartupSnapshot() {
  if (!state.session?.user?.id) return;
  writeJsonStorage(STARTUP_SNAPSHOT_KEY, {
    userId: state.session.user.id,
    savedAt: Date.now(),
    appInfo: state.appInfo,
    settings: state.settings,
    dashboard: state.dashboard,
    playback: state.playback
  });
}

function subscribeEvents() {
  animeDesk.player.onStateChanged((playerState) => {
    void getPlayerFeature().then((feature) => feature.render(playerState));
  });
  animeDesk.player.onPlaybackStarted((payload) => {
    state.playback = payload;
    void hydrateDashboard();
  });
  animeDesk.player.onSourceProgress((progress) => {
    void getPlayerFeature().then((feature) => feature.handleSourceProgress(progress));
  });
  animeDesk.player.onInstallationProgress(handleInstallationProgress);
  animeDesk.diagnostics.onProgress((event) => {
    void getMaintenanceFeature().then((feature) => feature.appendLog(event.message));
  });
  animeDesk.updates.onStateChanged((update) => {
    void getMaintenanceFeature().then((feature) => feature.handleUpdateState(update));
  });
}

function bindTools() {
  document.querySelectorAll('[data-official-url]').forEach((button) => {
    button.addEventListener('click', () =>
      window.open(button.dataset.officialUrl, '_blank', 'noopener')
    );
  });
  document.querySelectorAll('.install-provider-button').forEach((button) => {
    button.addEventListener('click', () => startInstallation(button.dataset.provider));
  });
  document.querySelectorAll('.open-provider-button').forEach((button) => {
    button.addEventListener('click', () => {
      showView('search');
      $('provider-filter').value = button.dataset.provider;
      updateSelectedProviderStatus();
      $('anime-search').focus();
    });
  });
  $('open-fast-vsr-button').addEventListener('click', async () =>
    notifyResult(await animeDesk.player.openTool({ tool: 'fast-anime-vsr' }))
  );
}

async function hydratePlayerStatus() {
  if (state.playerStatusHydration) return state.playerStatusHydration;
  state.playerStatusHydration = animeDesk.player
    .status()
    .then((result) => {
      if (!result.ok) return;
      state.playerStatus = result.data;
      writeJsonStorage(PROVIDER_STATUS_SNAPSHOT_KEY, { savedAt: Date.now(), status: result.data });
      renderPlayerStatus(result.data);
      updateSelectedProviderStatus();
    })
    .finally(() => {
      state.playerStatusHydration = null;
    });
  return state.playerStatusHydration;
}

function renderPlayerStatus(statusData) {
  if (!statusData) return;
  const cards = {
    'goanime-gui': [
      statusData.providers.goAnime.ready,
      statusData.providers.goAnime.bridge?.needsUpdate ? 'Atualização necessária' : 'Pronto'
    ],
    goanime: [
      statusData.providers.goAnime.classicReady,
      statusData.providers.goAnime.classicReady ? 'Pronto' : 'Não instalado'
    ],
    'anime-cli-br': [
      statusData.providers.animeCliBr.ready,
      statusData.providers.animeCliBr.ready ? 'Pronto' : 'Não instalado'
    ],
    'ani-cli': [
      statusData.providers.aniCli.ready,
      statusData.providers.aniCli.ready ? 'Pronto · experimental' : 'Não instalado'
    ],
    'fast-anime-vsr': [
      statusData.tools.fastAnimeVsr.ready,
      statusData.tools.fastAnimeVsr.ready
        ? 'Pronto'
        : statusData.tools.fastAnimeVsr.runtime?.message || 'Não preparado'
    ]
  };
  document.querySelectorAll('[data-tool]').forEach((card) => {
    const [ready, message] = cards[card.dataset.tool] || [false, 'Indisponível'];
    const status = card.querySelector('.tool-status');
    status.textContent = message;
    status.classList.toggle('text-success', ready);
  });
}

function updateSelectedProviderStatus() {
  const provider = $('provider-filter').value;
  const line = $('selected-provider-status');
  const dot = line.querySelector('.status-dot');
  const status = state.playerStatus || readProviderStatusSnapshot();
  let ready = false;
  let message = 'Status será verificado em segundo plano';

  if (status) {
    if (provider === 'goanime-gui') {
      ready = Boolean(status.providers?.goAnime?.ready);
      message = ready
        ? 'GoAnime GUI pronto · principal'
        : 'GoAnime GUI precisa ser instalado ou reparado';
    } else if (provider === 'goanime') {
      ready = Boolean(status.providers?.goAnime?.classicReady);
      message = ready ? 'GoAnime clássico pronto' : 'GoAnime clássico não está pronto';
    } else if (provider === 'anime-cli-br') {
      ready = Boolean(status.providers?.animeCliBr?.ready);
      message = ready ? 'anime-cli-br pronto' : 'anime-cli-br não está pronto';
    } else {
      ready = Boolean(status.providers?.aniCli?.ready);
      message = ready ? 'ani-cli pronto, mas experimental' : 'ani-cli não está pronto';
    }
  }

  dot.className = `status-dot ${status ? (ready ? 'is-online' : 'is-offline') : 'is-warning'}`;
  line.querySelector('span:last-child').textContent = message;
}

function bindInstallation() {
  $('installation-hide-button').addEventListener('click', () =>
    $('installation-overlay').classList.add('d-none')
  );
  $('installation-close-button').addEventListener('click', () =>
    $('installation-overlay').classList.add('d-none')
  );
  $('installation-cancel-button').addEventListener('click', async () => {
    if (state.activeInstallationJob)
      await animeDesk.player.cancelInstallation(state.activeInstallationJob);
  });
}

async function startInstallation(provider) {
  state.installationProvider = provider;
  $('installation-title').textContent = `Preparando ${providerLabel(provider)}`;
  $('installation-message').textContent =
    'O PowerShell executa oculto; acompanhe tudo por esta barra.';
  $('installation-step').textContent = 'Lendo o estado atual da máquina...';
  $('installation-percent').textContent = '0%';
  $('installation-progress-bar').style.width = '0%';
  $('installation-log').replaceChildren();
  $('installation-close-button').classList.add('d-none');
  $('installation-cancel-button').classList.remove('d-none');
  renderInstallationComponents(provider);
  $('installation-overlay').classList.remove('d-none');
  const result = await animeDesk.player.installDependencies(provider);
  if (!result.ok) {
    notifyResultError(result);
    return;
  }
  state.activeInstallationJob = result.data.jobId;
}

function renderInstallationComponents(provider) {
  const container = $('installation-components');
  container.replaceChildren();
  (installationDefinitions[provider] || []).forEach((name) => {
    const item = document.createElement('div');
    item.className = 'installation-component';
    item.dataset.name = name.toLowerCase();
    item.innerHTML = `<i class="bi bi-circle"></i><span>${escapeHtml(name)}</span>`;
    container.append(item);
  });
}

function handleInstallationProgress(event) {
  if (state.activeInstallationJob && event.jobId !== state.activeInstallationJob) return;
  state.activeInstallationJob = event.jobId;
  const percent = Math.max(0, Math.min(100, Number(event.percent || 0)));
  $('installation-percent').textContent = `${percent}%`;
  $('installation-progress-bar').style.width = `${percent}%`;
  $('installation-step').textContent = event.message || 'Processando...';
  appendInstallationLog(event.message, event.state);
  markInstallationComponent(event.component, event.state);

  if (['complete', 'error', 'cancelled'].includes(event.type)) {
    $('installation-close-button').classList.remove('d-none');
    $('installation-cancel-button').classList.add('d-none');
    state.activeInstallationJob = null;
    void hydratePlayerStatus();
    if (event.type === 'complete') {
      showToast({ title: 'Instalação concluída', message: event.message, variant: 'success' });
    }
  }
}

function markInstallationComponent(component, status) {
  if (!component) return;
  const normalized = component.toLowerCase().replaceAll('-', ' ');
  const item = [...$('installation-components').children].find((element) => {
    const name = element.dataset.name || '';
    return name.includes(normalized) || normalized.includes(name.split(' ')[0]);
  });
  if (!item) return;
  item.classList.toggle('is-installed', ['installed', 'ready', 'success'].includes(status));
  item.classList.toggle('is-error', status === 'error');
  item.querySelector('i').className =
    status === 'error' ? 'bi bi-x-circle-fill' : 'bi bi-check-circle-fill';
}

function appendInstallationLog(message, status = '') {
  if (!message) return;
  const line = document.createElement('p');
  line.textContent = `${new Date().toLocaleTimeString('pt-BR')}  ${message}`;
  if (status === 'error') line.classList.add('text-danger');
  $('installation-log').append(line);
  $('installation-log').scrollTop = $('installation-log').scrollHeight;
}

function bindSettings() {
  $('setting-theme').addEventListener('change', () => applyTheme($('setting-theme').value));
  $('setting-volume').addEventListener('input', () => {
    $('setting-volume-label').textContent = `${$('setting-volume').value}%`;
  });
  $('settings-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const result = await animeDesk.settings.update(readSettingsForm());
    if (!result.ok) {
      notifyResultError(result);
      return;
    }
    state.settings = result.data;
    applyTheme(result.data.theme);
    applyLanguage(result.data.interfaceLanguage || 'pt-BR');
    applySettingsToSearch();
    showToast({
      title: 'Configurações salvas',
      message: 'As preferências já estão ativas.',
      variant: 'success'
    });
  });
  $('save-parental-pin-button').addEventListener('click', async () => {
    const pin = $('parental-pin-input').value;
    const result = await animeDesk.settings.setParentalPin(pin);
    if (!result.ok) {
      $('parental-pin-status').textContent = result.error?.message || 'PIN inválido';
      return;
    }
    $('parental-pin-input').value = '';
    $('parental-pin-status').textContent = 'PIN configurado';
    await hydrateSettings();
  });
}

async function hydrateSettings() {
  const result = await animeDesk.settings.get();
  if (!result.ok) return;
  state.settings = result.data;
  renderSettingsForm(result.data);
  applyTheme(result.data.theme);
  applyLanguage(result.data.interfaceLanguage || 'pt-BR');
  applySettingsToSearch();
}

function renderSettingsForm(settings) {
  if (!settings) return;
  $('setting-provider').value = settings.defaultProvider || 'goanime-gui';
  $('setting-player-mode').value = settings.playerMode === 'embedded' ? 'embedded' : 'external';
  $('setting-language').value = settings.defaultLanguage || 'sub';
  $('setting-quality').value = settings.defaultQuality || 'auto';
  $('setting-audio').value = settings.audioPreference || 'sub';
  $('setting-volume').value = Number(settings.playerVolume ?? 80);
  $('setting-volume-label').textContent = `${Number(settings.playerVolume ?? 80)}%`;
  $('setting-downloads').value = settings.downloadsPath || '';
  $('setting-autoplay').checked = Boolean(settings.autoPlayNext);
  $('setting-remember').checked = settings.rememberPosition !== false;
  $('setting-theme').value = settings.theme || 'dark';
  $('setting-interface-language').value = settings.interfaceLanguage || 'pt-BR';
  $('setting-updates').checked = settings.checkUpdates !== false;
  $('setting-telemetry').checked = Boolean(settings.localTelemetryEnabled);
  $('setting-startup-metrics').checked = Boolean(settings.startupMetricsEnabled);
  $('setting-startup-retention').value = String(settings.startupMetricsRetentionDays ?? 30);
  $('setting-parental').checked = Boolean(settings.parentalControlEnabled);
  $('setting-rating').value = settings.maxContentRating || '18';
  $('parental-pin-status').textContent = settings.parentalPinConfigured
    ? 'PIN configurado'
    : 'PIN não configurado';
}

function readSettingsForm() {
  return {
    defaultProvider: $('setting-provider').value,
    playerMode: $('setting-player-mode').value,
    defaultLanguage: $('setting-language').value,
    defaultQuality: $('setting-quality').value,
    audioPreference: $('setting-audio').value,
    playerVolume: Number($('setting-volume').value),
    downloadsPath: $('setting-downloads').value,
    autoPlayNext: $('setting-autoplay').checked,
    rememberPosition: $('setting-remember').checked,
    theme: $('setting-theme').value,
    interfaceLanguage: $('setting-interface-language').value,
    checkUpdates: $('setting-updates').checked,
    localTelemetryEnabled: $('setting-telemetry').checked,
    startupMetricsEnabled: $('setting-startup-metrics').checked,
    startupMetricsRetentionDays: Number($('setting-startup-retention').value),
    parentalControlEnabled: $('setting-parental').checked,
    maxContentRating: $('setting-rating').value
  };
}

function applySettingsToSearch() {
  if (!state.settings) return;
  $('provider-filter').value = state.settings.defaultProvider || 'goanime-gui';
  $('language-filter').value = state.settings.defaultLanguage || 'sub';
  $('quality-filter').value = state.settings.defaultQuality || 'auto';
  updateSelectedProviderStatus();
}

function applyTheme(theme) {
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : theme;
  document.body.dataset.theme = resolved || 'dark';
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (state.settings?.theme === 'system') applyTheme('system');
});

function bindModals() {
  $('parental-unlock-button').addEventListener('click', async () => {
    const result = await animeDesk.settings.verifyParentalPin($('parental-unlock-pin').value);
    if (!result.ok) {
      setVisualAlert($('parental-unlock-alert'), result.error?.message || 'PIN incorreto.');
      return;
    }
    state.parentalUnlockedUntil = Date.now() + 30 * 60 * 1000;
    $('parental-unlock-pin').value = '';
    setVisualAlert($('parental-unlock-alert'), '');
    getModal('parental', 'parental-pin-modal').hide();
    const action = state.pendingParentalAction;
    state.pendingParentalAction = null;
    if (action) action();
  });
  $('submit-report-button').addEventListener('click', submitReport);
}

function bindFailureTelemetry() {
  window.addEventListener('error', (event) => {
    void animeDesk.diagnostics.recordFailure({
      scope: 'RENDERER',
      event: 'WINDOW_ERROR',
      message: event.message,
      metadata: {
        file: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error?.stack
      }
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    void animeDesk.diagnostics.recordFailure({
      scope: 'RENDERER',
      event: 'UNHANDLED_REJECTION',
      message: reason?.message || String(reason),
      metadata: { stack: reason?.stack }
    });
  });
}

function requestParentalUnlock(action) {
  if (!state.settings?.parentalPinConfigured) {
    showToast({
      title: 'PIN não configurado',
      message: 'Configure o PIN em Configurações.',
      variant: 'warning'
    });
    showView('settings');
    return;
  }
  state.pendingParentalAction = action;
  getModal('parental', 'parental-pin-modal').show();
}

function parentalUnlocked() {
  return Date.now() < state.parentalUnlockedUntil;
}

function isProtectedAnime(anime) {
  if (!state.settings?.parentalControlEnabled) return false;
  const userLevel = state.session.user.parentalLevel || 'ADULT';
  if (userLevel === 'ADULT' && state.settings.maxContentRating === '18') return false;
  const text = `${anime.name} ${(anime.genres || []).join(' ')}`.toLowerCase();
  const explicit = ['hentai', 'adult', 'erotica', 'ecchi'].some((term) => text.includes(term));
  if (explicit) return true;
  if (userLevel === 'CHILD') {
    return ['horror', 'psychological', 'violence', 'gore'].some((term) => text.includes(term));
  }
  return false;
}

function openReportModal() {
  const context = state.playback?.context || state.lastIssue;
  if (!context?.anime) {
    showToast({
      title: 'Nada para reportar',
      message: 'Abra ou tente abrir um episódio primeiro.',
      variant: 'warning'
    });
    return;
  }
  const episode = context.episode || {};
  $('report-summary').textContent =
    `${context.anime.name} · Episódio ${cleanEpisode(episode.number || episode.num || 1)}`;
  $('report-details').value = state.lastIssue?.technicalError || '';
  getModal('report', 'report-modal').show();
}

async function submitReport() {
  const context = state.playback?.context || state.lastIssue;
  if (!context?.anime) return;
  const episode = context.episode || {};
  const result = await animeDesk.reports.create({
    animeId: context.anime.url,
    animeTitle: context.anime.name,
    episodeNumber: episode.num || Number.parseFloat(episode.number) || 1,
    language: context.language || state.lastIssue?.language || 'sub',
    providerId: 'goanime-gui',
    source: state.playback?.source || context.anime.source,
    errorCode: state.lastIssue?.errorCode || '',
    technicalError: $('report-details').value || state.lastIssue?.technicalError || ''
  });
  if (!result.ok) {
    notifyResultError(result);
    return;
  }
  getModal('report', 'report-modal').hide();
  showToast({
    title: 'Relatório salvo',
    message: 'O problema foi registrado no banco local.',
    variant: 'success'
  });
}

function collectionPayload(anime, row = null) {
  return {
    providerId: row?.provider_id || 'goanime-gui',
    animeId: row?.anime_id || anime.url,
    animeTitle: row?.anime_title || anime.name,
    animeCover: row?.anime_cover || anime.imageUrl,
    animePayload: anime
  };
}

function setCollectionButton(button, active, type) {
  const isFavorite = type === 'favorite';
  button.classList.toggle('btn-primary', active);
  button.classList.toggle('btn-outline-light', !active);
  button.innerHTML = isFavorite
    ? `<i class="bi ${active ? 'bi-heart-fill' : 'bi-heart'}"></i> ${active ? 'Favorito' : 'Favoritar'}`
    : `<i class="bi ${active ? 'bi-bookmark-fill' : 'bi-bookmark-plus'}"></i> ${active ? 'Na lista' : 'Quero assistir'}`;
}

function providerLabel(provider) {
  return (
    {
      'goanime-gui': 'GoAnime completo',
      goanime: 'GoAnime completo',
      'anime-cli-br': 'anime-cli-br',
      'ani-cli': 'ani-cli',
      'fast-anime-vsr': 'FAST Anime VSR'
    }[provider] || provider
  );
}

function unwrap(result) {
  if (result?.ok) return result.data;
  const error = new Error(result?.error?.message || 'Não foi possível concluir a operação.');
  error.code = result?.error?.code;
  error.technicalMessage = result?.error?.technicalMessage;
  throw error;
}

function notifyResult(result) {
  if (!result?.ok) {
    notifyResultError(result);
    return;
  }
  const message =
    result.data?.message ||
    (result.data?.stopped ? 'Reprodução encerrada.' : 'Operação concluída.');
  showToast({ title: 'KitsuneDesk', message, variant: 'success' });
}

function notifyResultError(result) {
  showToast({
    title: 'Não foi possível concluir',
    message: result?.error?.message || 'Erro inesperado.',
    variant: 'error'
  });
}

function notifyError(error) {
  showToast({
    title: 'Não foi possível concluir',
    message: error.message || 'Erro inesperado.',
    variant: 'error'
  });
}

function showLoading(title, message) {
  $('loading-title').textContent = title;
  $('loading-message').textContent = message;
  $('loading-overlay').classList.remove('d-none');
}

function hideLoading() {
  $('loading-overlay').classList.add('d-none');
}

function createImage(src, alt) {
  const image = document.createElement('img');
  const remoteSource = src && /^https?:\/\//i.test(src);
  image.src = remoteSource ? fallbackCover : src || fallbackCover;
  image.alt = alt || '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.fetchPriority = 'low';
  image.addEventListener(
    'error',
    () => {
      image.src = fallbackCover;
    },
    { once: true }
  );
  if (remoteSource) {
    void animeDesk.cache.image(src, 'covers').then((result) => {
      const cachedUrl = result?.data?.fileUrl || result?.data?.url;
      if (result?.ok && cachedUrl) image.src = cachedUrl;
    });
  }
  return image;
}

function badge(text) {
  const element = document.createElement('span');
  element.className = 'badge-soft';
  element.textContent = text;
  return element;
}

function iconButton(icon, title) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'card-icon-button';
  button.title = title;
  button.setAttribute('aria-label', title);
  button.innerHTML = `<i class="bi ${icon}"></i>`;
  return button;
}

function emptyState(icon, message) {
  const element = document.createElement('div');
  element.className = 'empty-state';
  const iconElement = document.createElement('i');
  iconElement.className = `bi ${icon}`;
  const text = document.createElement('span');
  text.textContent = message;
  element.append(iconElement, text);
  return element;
}

function setVisualAlert(element, message) {
  element.textContent = message;
  element.classList.toggle('d-none', !message);
}

async function setCachedAvatar(image, user) {
  if (!image) return;
  const cached = readAvatarSnapshot(user);
  image.src = isUsableAvatarSource(cached?.url) ? cached.url : fallbackCover;
  image.addEventListener(
    'error',
    () => {
      image.src = fallbackCover;
    },
    { once: true }
  );
  const result = await animeDesk.avatars.get({
    style: user?.avatarStyle || 'thumbs',
    seed: user?.avatarSeed || user?.username || user?.name || 'user'
  });
  const avatarSource = preferredAvatarSource(result?.data);
  if (result?.ok && avatarSource) {
    image.src = avatarSource;
    rememberAvatarSnapshot(user, avatarSource);
  }
}

function updateUserAvatarPreview() {
  const preview = $('user-avatar-preview');
  if (!preview) return;
  void setCachedAvatar(preview, {
    avatarStyle: $('user-avatar-style').value,
    avatarSeed: $('user-avatar-seed').value || $('user-username').value || 'user',
    profileColor: $('user-color').value || '#6f5cff'
  });
  preview.style.backgroundColor = $('user-color').value || '#6f5cff';
}

function avatarSnapshotKey(user) {
  const style = user?.avatarStyle || 'thumbs';
  const seed = user?.avatarSeed || user?.username || user?.name || 'user';
  return `${style}:${seed}`;
}

function readAvatarSnapshot(user) {
  const cache = readJsonStorage(AVATAR_SNAPSHOT_KEY) || {};
  const cached = cache[avatarSnapshotKey(user)] || null;
  return isUsableAvatarSource(cached?.url) ? cached : null;
}

function rememberAvatarSnapshot(user, url) {
  if (!isUsableAvatarSource(url)) return;
  const cache = readJsonStorage(AVATAR_SNAPSHOT_KEY) || {};
  cache[avatarSnapshotKey(user)] = { url, savedAt: Date.now() };
  const entries = Object.entries(cache).sort(
    ([, left], [, right]) => Number(right.savedAt || 0) - Number(left.savedAt || 0)
  );
  writeJsonStorage(
    AVATAR_SNAPSHOT_KEY,
    Object.fromEntries(entries.slice(0, AVATAR_SNAPSHOT_LIMIT))
  );
}

function preferredAvatarSource(data) {
  if (isUsableAvatarSource(data?.url)) return data.url;
  if (isUsableAvatarSource(data?.fileUrl)) return data.fileUrl;
  return '';
}

function isUsableAvatarSource(url) {
  const value = String(url || '');
  if (!value) return false;
  if (/^file:\/\//i.test(value) && /\/avatars\/[^/]+\.bin$/i.test(value.replace(/\\/g, '/'))) {
    return false;
  }
  return /^(data:image\/|file:\/\/|https?:\/\/)/i.test(value);
}

function readProviderStatusSnapshot() {
  const snapshot = readJsonStorage(PROVIDER_STATUS_SNAPSHOT_KEY);
  if (!snapshot?.status || Date.now() - Number(snapshot.savedAt || 0) > SNAPSHOT_TTL_MS) {
    return null;
  }
  return snapshot.status;
}

function findEpisodeIndex(episodes, savedEpisode) {
  const wanted = Number(savedEpisode.num || Number.parseFloat(savedEpisode.number));
  const index = episodes.findIndex(
    (episode) => Number(episode.num || Number.parseFloat(episode.number)) === wanted
  );
  return index >= 0 ? index : 0;
}

function cleanEpisode(value) {
  const text = String(value ?? '1')
    .replace(/epis[oó]dio/gi, '')
    .trim();
  return text || '1';
}

function formatTime(value) {
  const total = Math.max(0, Math.floor(Number(value || 0)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatHours(seconds) {
  const hours = Number(seconds || 0) / 3600;
  return hours < 1 ? `${Math.round(hours * 60)}min` : `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
}

function stripHtml(value) {
  const container = document.createElement('div');
  container.innerHTML = String(value || '');
  return container.textContent.trim();
}

function escapeHtml(value) {
  const span = document.createElement('span');
  span.textContent = String(value ?? '');
  return span.innerHTML;
}
