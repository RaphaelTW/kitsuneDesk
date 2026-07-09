import { animeDesk, hasAnimeDeskApi } from './api.js';
import { clearSession, requireSession } from './auth.js';
import { showToast } from './components/toast.js';

const fallbackCover = '../../../assets/kitsunedesk-logo.svg';
const viewMeta = Object.freeze({
  home: ['Biblioteca pessoal', 'Início'],
  search: ['Catálogo e provedores', 'Pesquisar'],
  continue: ['Progresso salvo', 'Continuar assistindo'],
  lists: ['Sua coleção', 'Minha lista'],
  history: ['Atividade do perfil', 'Histórico'],
  tools: ['Componentes locais', 'Ferramentas'],
  settings: ['Preferências do perfil', 'Configurações'],
  diagnostics: ['Estabilidade e manutenção', 'Diagnóstico'],
  admin: ['Administração', 'Usuários']
});

const installationDefinitions = Object.freeze({
  goanime: ['GoAnime clássico', 'MPV', 'Runtime Go', 'Código GoAnime', 'Bridge gráfico'],
  'goanime-gui': ['GoAnime clássico', 'MPV', 'Runtime Go', 'Código GoAnime', 'Bridge gráfico'],
  'anime-cli-br': ['Python 3.12', 'VLC', 'Código anime-cli-br', 'Ambiente virtual'],
  'ani-cli': ['Git Bash', 'fzf', 'FFmpeg', 'MPV', 'OpenSSL', 'ani-cli'],
  'fast-anime-vsr': ['Python 3.10', 'FFmpeg', 'FAST Anime VSR', 'PyTorch', 'GPU/CUDA']
});

const state = {
  session: null,
  settings: null,
  playerStatus: null,
  dashboard: null,
  results: [],
  selectedAnime: null,
  episodes: [],
  playback: null,
  lastIssue: null,
  parentalUnlockedUntil: 0,
  pendingParentalAction: null,
  activeInstallationJob: null,
  installationProvider: null,
  currentListTab: 'favorites',
  users: [],
  update: null,
  updateBannerDismissed: false
};

const modals = {};

const $ = (id) => document.getElementById(id);

window.addEventListener('DOMContentLoaded', async () => {
  state.session = requireSession();
  if (!state.session || !hasAnimeDeskApi()) return;

  modals.parental = new bootstrap.Modal($('parental-pin-modal'));
  modals.report = new bootstrap.Modal($('report-modal'));
  modals.user = new bootstrap.Modal($('user-modal'));

  hydrateProfile();
  bindNavigation();
  bindSearch();
  bindPlayer();
  bindCollections();
  bindTools();
  bindSettings();
  bindDiagnostics();
  bindAdmin();
  bindModals();
  bindInstallation();
  subscribeEvents();

  await Promise.all([
    hydrateAppInfo(),
    hydrateSettings(),
    hydratePlayerStatus(),
    hydrateDashboard(),
    hydrateProviderHealth(),
    hydratePlaybackState(),
    hydrateUpdateStatus()
  ]);

  if (state.session.user.role === 'ADMIN') {
    $('admin-nav-button').classList.remove('d-none');
  }

  if (
    state.settings?.checkUpdates &&
    ['idle', 'not-available'].includes(state.update?.state || 'idle')
  ) {
    void checkUpdates(false);
  }
});

function hydrateProfile() {
  const user = state.session.user;
  $('current-user').textContent = user.name;
  $('current-role').textContent = user.role === 'ADMIN' ? 'Administrador' : 'Usuário';
  $('profile-avatar').textContent = user.name?.trim()?.[0]?.toUpperCase() || 'U';
  $('profile-avatar').style.backgroundColor = user.profileColor || '#6f5cff';
}

function bindNavigation() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => showView(button.dataset.view));
  });
  document.querySelectorAll('[data-go-view]').forEach((button) => {
    button.addEventListener('click', () => showView(button.dataset.goView));
  });
  $('brand-home-button').addEventListener('click', () => showView('home'));
  $('logout-button').addEventListener('click', async () => {
    if (state.playback?.active) await animeDesk.player.stop();
    await animeDesk.auth.logout();
    clearSession();
    window.location.href = './login.html';
  });
}

async function showView(view) {
  if (!viewMeta[view]) return;
  document.querySelectorAll('[data-view-panel]').forEach((panel) => {
    panel.classList.toggle('d-none', panel.dataset.viewPanel !== view);
  });
  document.querySelectorAll('.nav-item[data-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === view);
  });
  $('view-eyebrow').textContent = viewMeta[view][0];
  $('view-title').textContent = viewMeta[view][1];

  if (view === 'home') await hydrateDashboard();
  if (view === 'continue') await renderContinueView();
  if (view === 'lists') await renderLists();
  if (view === 'history') await renderHistory();
  if (view === 'tools') await hydratePlayerStatus();
  if (view === 'settings') await hydrateSettings();
  if (view === 'diagnostics') await runDiagnostics();
  if (view === 'admin' && state.session.user.role === 'ADMIN') await renderUsers();
}

async function hydrateAppInfo() {
  const info = await animeDesk.app.getInfo();
  $('app-version').textContent = `v${info.version}`;
}

async function hydrateDashboard() {
  const result = await animeDesk.library.dashboard();
  if (!result.ok) return;
  state.dashboard = result.data;
  renderStats(result.data.stats || {});
  renderContinueCards($('home-continue-list'), result.data.continueWatching || [], 8);
  renderCollectionCards($('home-favorites-list'), result.data.favorites || [], 'favorites', 8);
  renderHistoryPreview($('home-recent-list'), result.data.recent || [], 8);
}

function renderStats(stats) {
  const cards = $('dashboard-stats').querySelectorAll('.stat-card strong');
  cards[0].textContent = Number(stats.total_plays || 0).toLocaleString('pt-BR');
  cards[1].textContent = Number(stats.distinct_animes || 0).toLocaleString('pt-BR');
  cards[2].textContent = Number(stats.completed_episodes || 0).toLocaleString('pt-BR');
  cards[3].textContent = formatHours(Number(stats.seconds_watched || 0));
}

function renderContinueCards(container, items, limit = 50) {
  container.replaceChildren();
  const rows = items.slice(0, limit);
  if (!rows.length) {
    container.append(emptyState('bi-play-circle', 'Nenhum episódio para continuar.'));
    return;
  }
  rows.forEach((row) => container.append(createContinueCard(row)));
}

function createContinueCard(row) {
  const button = document.createElement('button');
  button.className = 'media-card';
  button.type = 'button';
  const image = createImage(row.anime_cover, row.anime_title);
  const body = document.createElement('span');
  body.className = 'media-card-body';
  const title = document.createElement('strong');
  title.textContent = row.anime_title;
  const subtitle = document.createElement('small');
  subtitle.textContent = `Episódio ${cleanEpisode(row.current_episode)} · ${Math.round(row.progress_percent || 0)}%`;
  const progress = document.createElement('span');
  progress.className = 'card-progress';
  const fill = document.createElement('span');
  fill.style.width = `${Math.max(0, Math.min(100, row.progress_percent || 0))}%`;
  progress.append(fill);
  body.append(title, subtitle, progress);
  button.append(image, body);
  button.addEventListener('click', () => resumePlayback(row));
  return button;
}

async function resumePlayback(row) {
  const anime = parseJson(row.anime_payload) || {
    name: row.anime_title,
    url: row.anime_id,
    imageUrl: row.anime_cover,
    source: row.source || 'AllAnime',
    mediaType: 'anime'
  };
  const savedEpisode = parseJson(row.episode_payload) || {
    number: String(row.current_episode),
    num: Number(row.current_episode),
    title: row.episode_title || ''
  };

  showLoading('Preparando episódio', 'Recuperando a lista e a posição salva...');
  try {
    const episodesResult = await animeDesk.animes.episodes({ anime, language: row.language });
    const episodes = unwrap(episodesResult);
    const index = findEpisodeIndex(episodes, savedEpisode);
    const episode = episodes[index] || savedEpisode;
    await launchEpisode({
      anime,
      episode,
      episodes,
      episodeIndex: Math.max(0, index),
      language: row.language,
      quality: row.quality,
      resumePosition: row.playback_position
    });
  } catch (error) {
    notifyError(error);
  } finally {
    hideLoading();
  }
}

function renderCollectionCards(container, items, type, limit = 100) {
  container.replaceChildren();
  const rows = items.slice(0, limit);
  if (!rows.length) {
    container.append(
      emptyState(
        type === 'favorites' ? 'bi-heart' : 'bi-bookmark',
        type === 'favorites' ? 'Nenhum favorito ainda.' : 'Sua lista está vazia.'
      )
    );
    return;
  }
  rows.forEach((row) => {
    const card = document.createElement('article');
    card.className = 'library-card';
    const image = createImage(row.anime_cover, row.anime_title);
    const body = document.createElement('div');
    body.className = 'library-card-body';
    const title = document.createElement('strong');
    title.textContent = row.anime_title;
    const source = document.createElement('small');
    source.textContent = row.provider_id === 'goanime-gui' ? 'GoAnime GUI' : row.provider_id;
    body.append(title, source);
    const actions = document.createElement('div');
    actions.className = 'card-overlay-actions';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.title = 'Remover';
    remove.innerHTML = '<i class="bi bi-x-lg"></i>';
    remove.addEventListener('click', async (event) => {
      event.stopPropagation();
      const payload = collectionPayload(parseJson(row.anime_payload) || {}, row);
      const result =
        type === 'favorites'
          ? await animeDesk.favorites.toggle(payload)
          : await animeDesk.watchlist.toggle(payload);
      if (result.ok) {
        await renderLists();
        await hydrateDashboard();
      }
    });
    actions.append(remove);
    card.append(image, body, actions);
    card.addEventListener('click', () => openCollectionAnime(row));
    container.append(card);
  });
}

async function openCollectionAnime(row) {
  const anime = parseJson(row.anime_payload);
  if (!anime?.url) {
    showToast({
      title: 'Dados incompletos',
      message: 'Pesquise o anime novamente.',
      variant: 'warning'
    });
    return;
  }
  showView('search');
  await selectAnime(anime);
}

function renderHistoryPreview(container, items, limit = 100) {
  container.replaceChildren();
  const rows = items.slice(0, limit);
  if (!rows.length) {
    container.append(emptyState('bi-clock-history', 'Nenhuma reprodução registrada.'));
    return;
  }
  rows.forEach((row) => container.append(createHistoryItem(row, false)));
}

function createHistoryItem(row, full = true) {
  const item = document.createElement('article');
  item.className = 'history-item';
  item.append(createImage(row.anime_cover, row.anime_title));
  const meta = document.createElement('div');
  meta.className = 'history-item-meta';
  const title = document.createElement('strong');
  title.textContent = row.anime_title;
  const subtitle = document.createElement('span');
  subtitle.textContent = `Episódio ${cleanEpisode(row.episode_number)} · ${row.completed ? 'Concluído' : `${Math.round(row.progress_percent || 0)}%`}`;
  meta.append(title, subtitle);
  const actions = document.createElement('div');
  actions.className = 'history-item-actions';
  const resume = iconButton('bi-play-fill', 'Assistir');
  resume.addEventListener('click', () => resumeHistory(row));
  actions.append(resume);
  if (full) {
    const complete = iconButton(
      row.completed ? 'bi-arrow-counterclockwise' : 'bi-check2',
      row.completed ? 'Marcar não concluído' : 'Marcar concluído'
    );
    complete.addEventListener('click', async () => {
      await animeDesk.history.markCompleted(row.id, !row.completed);
      await renderHistory();
      await hydrateDashboard();
    });
    const remove = iconButton('bi-trash', 'Remover');
    remove.addEventListener('click', async () => {
      await animeDesk.history.remove(row.id);
      await renderHistory();
      await hydrateDashboard();
    });
    actions.append(complete, remove);
  }
  item.append(meta, actions);
  return item;
}

async function resumeHistory(row) {
  await resumePlayback({
    ...row,
    current_episode: row.episode_number,
    updated_at: row.watched_at
  });
}

function bindSearch() {
  $('anime-search-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = $('anime-search').value.trim();
    const provider = $('provider-filter').value;
    if (query.length < 2) return;

    if (provider !== 'goanime-gui') {
      showLoading('Abrindo provedor', 'A seleção continuará no terminal do provedor escolhido...');
      try {
        unwrap(
          await animeDesk.player.openLegacy({
            query,
            provider,
            language: $('language-filter').value,
            quality: $('quality-filter').value
          })
        );
      } catch (error) {
        notifyError(error);
      } finally {
        hideLoading();
      }
      return;
    }

    showLoading('Pesquisando', 'Consultando as fontes do GoAnime...');
    try {
      state.results = unwrap(
        await animeDesk.animes.search({ query, language: $('language-filter').value })
      );
      renderSearchResults();
    } catch (error) {
      notifyError(error);
    } finally {
      hideLoading();
    }
  });

  $('provider-filter').addEventListener('change', updateSelectedProviderStatus);
  $('back-to-results-button').addEventListener('click', () => {
    $('episodes-section').classList.add('d-none');
    $('search-results-section').classList.remove('d-none');
  });
  $('episode-filter').addEventListener('input', renderEpisodes);
}

function renderSearchResults() {
  const container = $('anime-results');
  container.replaceChildren();
  $('search-results-title').textContent = `Resultados para “${$('anime-search').value.trim()}”`;
  $('result-count').textContent = `${state.results.length} resultado(s)`;
  $('search-results-section').classList.remove('d-none');
  $('episodes-section').classList.add('d-none');

  if (!state.results.length) {
    container.append(emptyState('bi-search', 'Nenhum anime foi encontrado.'));
    return;
  }

  state.results.forEach((anime) => container.append(createAnimeCard(anime)));
}

function createAnimeCard(anime) {
  const card = document.createElement('article');
  card.className = 'anime-card';
  card.append(createImage(anime.imageUrl, anime.name));
  const body = document.createElement('div');
  body.className = 'anime-card-body';
  const title = document.createElement('strong');
  title.textContent = anime.name;
  const badges = document.createElement('div');
  badges.className = 'anime-card-badges';
  [anime.source, anime.year, anime.averageScore ? `${anime.averageScore}%` : '']
    .filter(Boolean)
    .forEach((text) => badges.append(badge(text)));
  body.append(title, badges);
  card.append(body);

  const action = () => selectAnime(anime);
  if (isProtectedAnime(anime) && !parentalUnlocked()) {
    const lock = document.createElement('div');
    lock.className = 'content-lock';
    lock.innerHTML = '<i class="bi bi-lock-fill me-2"></i> Protegido';
    card.append(lock);
    card.addEventListener('click', () => requestParentalUnlock(action));
  } else {
    card.addEventListener('click', action);
  }
  return card;
}

async function selectAnime(anime) {
  state.selectedAnime = anime;
  showLoading('Carregando episódios', 'Consultando a fonte selecionada...');
  try {
    state.episodes = unwrap(
      await animeDesk.animes.episodes({ anime, language: $('language-filter').value })
    );
    $('search-results-section').classList.add('d-none');
    $('episodes-section').classList.remove('d-none');
    renderSelectedAnime();
    renderEpisodes();
    await hydrateCollectionButtons();
  } catch (error) {
    state.lastIssue = {
      anime,
      episode: { number: 1, num: 1 },
      errorCode: error.code,
      technicalError: error.technicalMessage || error.message
    };
    notifyError(error);
  } finally {
    hideLoading();
  }
}

function renderSelectedAnime() {
  const anime = state.selectedAnime;
  $('selected-anime-image').src = anime.imageUrl || fallbackCover;
  $('selected-anime-image').alt = anime.name;
  $('selected-anime-title').textContent = anime.name;
  $('selected-anime-description').textContent =
    stripHtml(anime.description) || 'Sem sinopse disponível.';
  const badges = $('selected-anime-badges');
  badges.replaceChildren();
  [anime.source, anime.year, ...(anime.genres || []).slice(0, 4)]
    .filter(Boolean)
    .forEach((text) => badges.append(badge(text)));
}

function renderEpisodes() {
  const query = $('episode-filter').value.trim().toLowerCase();
  const rows = state.episodes.filter((episode) => {
    const text = `${episode.number} ${episode.title}`.toLowerCase();
    return !query || text.includes(query);
  });
  $('episodes-count').textContent = `${state.episodes.length} episódio(s)`;
  const container = $('episode-grid');
  container.replaceChildren();
  rows.forEach((episode) => {
    const index = state.episodes.indexOf(episode);
    const button = document.createElement('button');
    button.className = 'episode-card';
    button.type = 'button';
    const label = document.createElement('span');
    label.textContent = `Episódio ${cleanEpisode(episode.number)}`;
    const title = document.createElement('strong');
    title.textContent = episode.title || `Episódio ${cleanEpisode(episode.number)}`;
    const meta = document.createElement('small');
    meta.textContent = [episode.isFiller ? 'Filler' : '', episode.aired || '']
      .filter(Boolean)
      .join(' · ');
    button.append(label, title, meta);
    button.addEventListener('click', () =>
      launchEpisode({
        anime: state.selectedAnime,
        episode,
        episodes: state.episodes,
        episodeIndex: index,
        language: $('language-filter').value,
        quality: $('quality-filter').value,
        resumePosition: 0
      })
    );
    container.append(button);
  });
  if (!rows.length)
    container.append(emptyState('bi-list-ol', 'Nenhum episódio corresponde ao filtro.'));
}

async function launchEpisode(payload) {
  showLoading('Preparando reprodução', 'Resolvendo a melhor fonte disponível...');
  state.lastIssue = null;

  try {
    const result = unwrap(await animeDesk.player.playEpisode(payload));
    state.playback = {
      ...result,
      context: {
        anime: payload.anime,
        episode: payload.episode,
        episodes: payload.episodes,
        episodeIndex: payload.episodeIndex,
        language: payload.language,
        quality: payload.quality
      }
    };

    showToast({
      title: result.fallbackUsed ? 'Fonte alternativa utilizada' : 'Reprodução iniciada',
      message: result.fallbackUsed
        ? `Reproduzindo por ${result.source || 'outra fonte'} em ${result.quality || 'melhor qualidade'}.`
        : 'O episódio foi aberto em uma janela externa do MPV.',
      variant: result.fallbackUsed ? 'warning' : 'success'
    });
  } catch (error) {
    state.lastIssue = {
      anime: payload.anime,
      episode: payload.episode,
      language: payload.language,
      quality: payload.quality,
      source: payload.anime?.source,
      errorCode: error.code,
      technicalError: error.technicalMessage || error.message
    };
    notifyError(error);
  } finally {
    hideLoading();
  }
}

async function hydrateCollectionButtons() {
  const payload = collectionPayload(state.selectedAnime);
  const result = await animeDesk.library.collectionState(payload);
  if (!result.ok) return;
  setCollectionButton($('favorite-button'), result.data.favorite, 'favorite');
  setCollectionButton($('watchlist-button'), result.data.watchlist, 'watchlist');
}

function bindCollections() {
  $('favorite-button').addEventListener('click', async () => {
    if (!state.selectedAnime) return;
    const result = await animeDesk.favorites.toggle(collectionPayload(state.selectedAnime));
    if (result.ok) {
      setCollectionButton($('favorite-button'), result.data.active, 'favorite');
      await hydrateDashboard();
    }
  });
  $('watchlist-button').addEventListener('click', async () => {
    if (!state.selectedAnime) return;
    const result = await animeDesk.watchlist.toggle(collectionPayload(state.selectedAnime));
    if (result.ok) {
      setCollectionButton($('watchlist-button'), result.data.active, 'watchlist');
      await hydrateDashboard();
    }
  });
  document.querySelectorAll('[data-list-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.currentListTab = button.dataset.listTab;
      document
        .querySelectorAll('[data-list-tab]')
        .forEach((item) => item.classList.toggle('is-active', item === button));
      $('favorites-list').classList.toggle('d-none', state.currentListTab !== 'favorites');
      $('watchlist-list').classList.toggle('d-none', state.currentListTab !== 'watchlist');
    });
  });
  $('history-search').addEventListener('input', debounce(renderHistory, 250));
  $('clear-history-button').addEventListener('click', async () => {
    if (
      !window.confirm(
        'Limpar todo o histórico deste usuário? Favoritos e configurações serão preservados.'
      )
    )
      return;
    await animeDesk.history.clear();
    await renderHistory();
    await hydrateDashboard();
  });
}

async function renderContinueView() {
  const result = await animeDesk.library.continueWatching();
  if (result.ok) renderContinueCards($('continue-list'), result.data, 100);
}

async function renderLists() {
  const [favorites, watchlist] = await Promise.all([
    animeDesk.favorites.list(),
    animeDesk.watchlist.list()
  ]);
  if (favorites.ok) renderCollectionCards($('favorites-list'), favorites.data, 'favorites');
  if (watchlist.ok) renderCollectionCards($('watchlist-list'), watchlist.data, 'watchlist');
}

async function renderHistory() {
  const result = await animeDesk.history.list({ query: $('history-search').value, limit: 300 });
  if (!result.ok) return;
  const container = $('history-list');
  container.replaceChildren();
  if (!result.data.length) {
    container.append(emptyState('bi-clock-history', 'Nenhum item no histórico.'));
    return;
  }
  result.data.forEach((row) => container.append(createHistoryItem(row, true)));
}

function bindPlayer() {
  $('player-toggle').addEventListener('click', async () => {
    const result = await animeDesk.player.togglePause();
    if (!result.ok) notifyResultError(result);
  });
  $('player-previous').addEventListener('click', async () =>
    notifyResult(await animeDesk.player.previous())
  );
  $('player-next').addEventListener('click', async () =>
    notifyResult(await animeDesk.player.next())
  );
  $('player-stop').addEventListener('click', async () =>
    notifyResult(await animeDesk.player.stop())
  );
  $('player-progress').addEventListener('change', async () => {
    const duration = Number(state.playback?.duration || 0);
    if (duration <= 0) return;
    await animeDesk.player.seek((Number($('player-progress').value) / 100) * duration, 'absolute');
  });
  $('player-volume').addEventListener(
    'input',
    debounce(async () => {
      await animeDesk.player.setVolume(Number($('player-volume').value));
    }, 100)
  );
  $('report-episode-button').addEventListener('click', openReportModal);
}

function subscribeEvents() {
  animeDesk.player.onStateChanged((playerState) => renderPlayerState(playerState));
  animeDesk.player.onPlaybackStarted((payload) => {
    state.playback = payload;
    void hydrateDashboard();
  });
  animeDesk.player.onSourceProgress(handleSourceProgress);
  animeDesk.player.onInstallationProgress(handleInstallationProgress);
  animeDesk.diagnostics.onProgress((event) => appendDiagnosticLog(event.message));
  animeDesk.updates.onStateChanged(handleUpdateState);
}

function handleSourceProgress(progress) {
  const message = progress?.message || 'Consultando fontes...';
  if (!$('loading-overlay').classList.contains('d-none')) {
    $('loading-message').textContent = message;
  }
  const status = $('selected-provider-status');
  status.querySelector('.status-dot').className = 'status-dot is-checking';
  status.querySelector('span:last-child').textContent = message;
}

async function hydratePlaybackState() {
  const result = await animeDesk.player.playbackState();
  if (result.ok) renderPlayerState(result.data);
}

function renderPlayerState(playerState) {
  state.playback = { ...(state.playback || {}), ...playerState };
  const active = Boolean(playerState.active || playerState.paused);
  $('mini-player').classList.toggle('is-hidden', !active);
  if (!active) {
    return;
  }
  const context = playerState.context || state.playback?.context || {};
  const anime = context.anime || {};
  const episode = context.episode || {};
  $('player-cover').src = anime.imageUrl || fallbackCover;
  $('player-title').textContent = anime.name || playerState.animeTitle || 'Reproduzindo';
  $('player-subtitle').textContent =
    `Episódio ${cleanEpisode(episode.number || playerState.episodeNumber)} · ${playerState.quality || context.quality || ''}`;
  $('player-source').textContent = playerState.source || anime.source || 'GoAnime';
  $('player-current-time').textContent = formatTime(playerState.position);
  $('player-duration').textContent = formatTime(playerState.duration);
  $('player-progress').value =
    playerState.duration > 0 ? (playerState.position / playerState.duration) * 100 : 0;
  $('player-volume').value = Number(playerState.volume ?? 80);
  $('player-toggle').querySelector('i').className = playerState.paused
    ? 'bi bi-play-fill'
    : 'bi bi-pause-fill';
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
  const result = await animeDesk.player.status();
  if (!result.ok) return;
  state.playerStatus = result.data;
  const cards = {
    'goanime-gui': [
      result.data.providers.goAnime.ready,
      result.data.providers.goAnime.bridge?.needsUpdate ? 'Atualização necessária' : 'Pronto'
    ],
    goanime: [
      result.data.providers.goAnime.classicReady,
      result.data.providers.goAnime.classicReady ? 'Pronto' : 'Não instalado'
    ],
    'anime-cli-br': [
      result.data.providers.animeCliBr.ready,
      result.data.providers.animeCliBr.ready ? 'Pronto' : 'Não instalado'
    ],
    'ani-cli': [
      result.data.providers.aniCli.ready,
      result.data.providers.aniCli.ready ? 'Pronto · experimental' : 'Não instalado'
    ],
    'fast-anime-vsr': [
      result.data.tools.fastAnimeVsr.ready,
      result.data.tools.fastAnimeVsr.ready
        ? 'Pronto'
        : result.data.tools.fastAnimeVsr.runtime?.message || 'Não preparado'
    ]
  };
  document.querySelectorAll('[data-tool]').forEach((card) => {
    const [ready, message] = cards[card.dataset.tool] || [false, 'Indisponível'];
    const status = card.querySelector('.tool-status');
    status.textContent = message;
    status.classList.toggle('text-success', ready);
  });
  updateSelectedProviderStatus();
}

function updateSelectedProviderStatus() {
  const provider = $('provider-filter').value;
  const line = $('selected-provider-status');
  const dot = line.querySelector('.status-dot');
  let ready = false;
  let message = 'Verificando...';
  if (state.playerStatus) {
    if (provider === 'goanime-gui') {
      ready = state.playerStatus.providers.goAnime.ready;
      message = ready
        ? 'GoAnime GUI pronto · principal'
        : 'GoAnime GUI precisa ser instalado ou reparado';
    } else if (provider === 'goanime') {
      ready = state.playerStatus.providers.goAnime.classicReady;
      message = ready ? 'GoAnime clássico pronto' : 'GoAnime clássico não está pronto';
    } else if (provider === 'anime-cli-br') {
      ready = state.playerStatus.providers.animeCliBr.ready;
      message = ready ? 'anime-cli-br pronto' : 'anime-cli-br não está pronto';
    } else {
      ready = state.playerStatus.providers.aniCli.ready;
      message = ready ? 'ani-cli pronto, mas experimental' : 'ani-cli não está pronto';
    }
  }
  dot.className = `status-dot ${ready ? 'is-online' : 'is-offline'}`;
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
  $('setting-provider').value = result.data.defaultProvider;
  $('setting-language').value = result.data.defaultLanguage;
  $('setting-quality').value = result.data.defaultQuality;
  $('setting-audio').value = result.data.audioPreference;
  $('setting-volume').value = result.data.playerVolume;
  $('setting-volume-label').textContent = `${result.data.playerVolume}%`;
  $('setting-downloads').value = result.data.downloadsPath;
  $('setting-autoplay').checked = result.data.autoPlayNext;
  $('setting-remember').checked = result.data.rememberPosition;
  $('setting-theme').value = result.data.theme;
  $('setting-updates').checked = result.data.checkUpdates;
  $('setting-parental').checked = result.data.parentalControlEnabled;
  $('setting-rating').value = result.data.maxContentRating;
  $('parental-pin-status').textContent = result.data.parentalPinConfigured
    ? 'PIN configurado'
    : 'PIN não configurado';
  applyTheme(result.data.theme);
  applySettingsToSearch();
}

function readSettingsForm() {
  return {
    defaultProvider: $('setting-provider').value,
    defaultLanguage: $('setting-language').value,
    defaultQuality: $('setting-quality').value,
    audioPreference: $('setting-audio').value,
    playerVolume: Number($('setting-volume').value),
    downloadsPath: $('setting-downloads').value,
    autoPlayNext: $('setting-autoplay').checked,
    rememberPosition: $('setting-remember').checked,
    theme: $('setting-theme').value,
    checkUpdates: $('setting-updates').checked,
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

function bindDiagnostics() {
  $('provider-health-button').addEventListener('click', hydrateProviderHealth);
  $('run-diagnostics-button').addEventListener('click', runDiagnostics);
  $('export-diagnostics-button').addEventListener('click', async () =>
    notifyResult(await animeDesk.diagnostics.export())
  );
  $('check-updates-button').addEventListener('click', () => checkUpdates(true));
  $('updates-button').addEventListener('click', () => {
    if (['available', 'downloading', 'downloaded'].includes(state.update?.state)) {
      state.updateBannerDismissed = false;
      renderUpdateBanner(state.update);
      return;
    }
    void checkUpdates(true);
  });
  $('install-update-button').addEventListener('click', installDownloadedUpdate);
  $('dismiss-update-button').addEventListener('click', () => {
    state.updateBannerDismissed = true;
    $('update-banner').classList.add('d-none');
  });
  $('repair-native-button').addEventListener('click', async () => {
    appendDiagnosticLog('Iniciando reconstrução do better-sqlite3...');
    notifyResult(await animeDesk.diagnostics.repairNative());
    await runDiagnostics();
  });
  $('clear-cache-button').addEventListener('click', async () => {
    notifyResult(await animeDesk.diagnostics.clearCache());
    await runDiagnostics();
  });
  $('restore-components-button').addEventListener('click', async () => {
    if (
      !window.confirm(
        'Restaurar os componentes locais? Histórico e configurações serão preservados.'
      )
    )
      return;
    notifyResult(await animeDesk.diagnostics.restoreComponents());
    await hydratePlayerStatus();
    await runDiagnostics();
  });
  document.querySelectorAll('[data-repair-provider]').forEach((button) => {
    button.addEventListener('click', () => startInstallation(button.dataset.repairProvider));
  });
}

async function hydrateProviderHealth() {
  const dot = $('provider-health-dot');
  dot.className = 'status-dot is-checking';
  $('provider-health-summary').textContent = 'Verificando provedores';
  const result = await animeDesk.providers.health();
  if (!result.ok) {
    dot.className = 'status-dot is-offline';
    $('provider-health-summary').textContent = 'Falha na verificação';
    return;
  }
  const online = result.data.providers.filter((provider) => provider.state === 'online').length;
  const unstable = result.data.providers.filter((provider) => provider.state === 'unstable').length;
  dot.className = `status-dot ${online >= 2 ? 'is-online' : online ? 'is-warning' : 'is-offline'}`;
  $('provider-health-summary').textContent =
    `${online} online${unstable ? ` · ${unstable} instável` : ''}`;
  showToast({
    title: 'Saúde dos provedores',
    message: result.data.providers
      .map((provider) => `${provider.name}: ${provider.message}`)
      .join(' | '),
    variant: online ? 'info' : 'warning'
  });
}

async function runDiagnostics() {
  const result = await animeDesk.diagnostics.run();
  if (!result.ok) {
    notifyResultError(result);
    return;
  }
  const report = result.data;
  const container = $('diagnostic-grid');
  container.replaceChildren();
  container.append(
    diagnosticCard('Aplicativo', [
      ['Versão', report.app.version],
      ['Electron', report.app.electron],
      ['Node', report.app.node],
      ['Modo', report.app.packaged ? 'Instalado' : 'Desenvolvimento']
    ]),
    diagnosticCard('Banco local', [
      ['Modo', report.database.mode],
      ['Módulo nativo', report.database.nativeModule],
      ['Arquivo', report.database.exists ? 'Encontrado' : 'Ausente']
    ]),
    diagnosticCard('GoAnime', [
      ['GUI', report.providers.goAnime.ready ? 'Pronto' : 'Reparo necessário'],
      ['Clássico', report.providers.goAnime.classicReady ? 'Pronto' : 'Indisponível'],
      ['Bridge', report.providers.goAnime.bridge?.version || 'Não instalado'],
      ['MPV', report.dependencies.mpv.available ? 'Encontrado' : 'Ausente']
    ]),
    diagnosticCard('Ferramentas', [
      ['anime-cli-br', report.providers.animeCliBr.ready ? 'Pronto' : 'Indisponível'],
      ['ani-cli', report.providers.aniCli.ready ? 'Experimental' : 'Indisponível'],
      ['FAST Anime VSR', report.tools.fastAnimeVsr.ready ? 'Pronto' : 'Não preparado']
    ])
  );
  appendDiagnosticLog(
    `Verificação concluída em ${new Date(report.checkedAt).toLocaleString('pt-BR')}.`
  );
}

function diagnosticCard(title, rows) {
  const card = document.createElement('article');
  card.className = 'diagnostic-card';
  const header = document.createElement('header');
  const heading = document.createElement('strong');
  heading.textContent = title;
  header.append(heading);
  const list = document.createElement('dl');
  rows.forEach(([term, value]) => {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = String(value);
    row.append(dt, dd);
    list.append(row);
  });
  card.append(header, list);
  return card;
}

function appendDiagnosticLog(message) {
  if (!message) return;
  const current =
    $('diagnostic-log').textContent === 'Aguardando verificação...'
      ? ''
      : $('diagnostic-log').textContent;
  $('diagnostic-log').textContent =
    `${current}${current ? '\n' : ''}${new Date().toLocaleTimeString('pt-BR')}  ${message}`;
  $('diagnostic-log').scrollTop = $('diagnostic-log').scrollHeight;
}

async function hydrateUpdateStatus() {
  const result = await animeDesk.updates.status();
  if (!result.ok) return;
  handleUpdateState(result.data, false);
}

async function checkUpdates(showFeedback) {
  const result = await animeDesk.updates.check();
  if (!result.ok) {
    if (showFeedback) notifyResultError(result);
    return;
  }
  handleUpdateState(result.data, showFeedback);
}

async function installDownloadedUpdate() {
  const button = $('install-update-button');
  button.disabled = true;
  button.innerHTML = '<span class="neon-spinner neon-spinner-sm"></span> Reiniciando...';
  const result = await animeDesk.updates.install();
  if (!result.ok || !result.data?.installed) {
    button.disabled = false;
    button.innerHTML = '<i class="bi bi-arrow-repeat"></i> Instalar e reiniciar';
    notifyResult(result);
  }
}

function handleUpdateState(update, showFeedback = false) {
  if (!update) return;
  const previousState = state.update?.state;
  const previousVersion = state.update?.info?.version;
  const incomingVersion = update.info?.version;
  if (incomingVersion && incomingVersion !== previousVersion) state.updateBannerDismissed = false;
  if (update.state === 'downloaded' && previousState !== 'downloaded') {
    state.updateBannerDismissed = false;
  }
  state.update = update;

  const available = ['available', 'downloading', 'downloaded'].includes(update.state);
  $('update-notification').classList.toggle('d-none', !available);
  renderUpdateBanner(update);

  const messages = {
    development: update.message,
    checking: 'Procurando uma nova versão no GitHub...',
    available: `Nova versão ${formatUpdateVersion(update)} encontrada. O download foi iniciado.`,
    downloading: `Baixando atualização: ${Math.round(update.progress?.percent || 0)}%`,
    downloaded: `A versão ${formatUpdateVersion(update)} está pronta para instalar.`,
    'not-available': 'Você já está usando a versão mais recente.',
    error: update.message || 'Não foi possível verificar atualizações.'
  };

  const isNewImportantState =
    ['available', 'downloaded', 'error'].includes(update.state) &&
    (previousState !== update.state || previousVersion !== update.info?.version);

  if (!showFeedback && !isNewImportantState) return;
  showToast({
    title: 'Atualizações',
    message: messages[update.state] || 'Estado de atualização recebido.',
    variant:
      update.state === 'error'
        ? 'error'
        : update.state === 'downloaded'
          ? 'success'
          : update.state === 'not-available'
            ? 'success'
            : 'info'
  });
}

function renderUpdateBanner(update) {
  const banner = $('update-banner');
  const visibleState = ['available', 'downloading', 'downloaded'].includes(update?.state);
  if (!visibleState || state.updateBannerDismissed) {
    banner.classList.add('d-none');
    return;
  }

  banner.classList.remove('d-none');
  const version = formatUpdateVersion(update);
  $('update-banner-version').textContent = version;
  $('update-banner-title').textContent =
    update.state === 'downloaded' ? 'Atualização pronta para instalar' : 'Nova versão disponível';

  const percent = Math.max(0, Math.min(100, Math.round(update.progress?.percent || 0)));
  const progressVisible = update.state === 'downloading';
  $('update-progress-wrap').classList.toggle('d-none', !progressVisible);
  $('update-progress-bar').style.width = `${percent}%`;
  $('update-progress-label').textContent = `${percent}%`;

  const messages = {
    available: 'O download foi iniciado em segundo plano. Você pode continuar usando o aplicativo.',
    downloading: `Baixando os arquivos da versão ${version}.`,
    downloaded:
      'Clique em Instalar e reiniciar, ou feche o aplicativo para atualizar automaticamente.'
  };
  $('update-banner-message').textContent = messages[update.state] || 'Preparando atualização...';

  const notes = String(update.info?.releaseNotes || '').trim();
  $('update-release-notes-wrap').classList.toggle('d-none', !notes);
  $('update-release-notes').textContent = notes;
  $('install-update-button').classList.toggle('d-none', update.state !== 'downloaded');
}

function formatUpdateVersion(update) {
  const version = String(update?.info?.version || '').trim();
  return version ? `v${version.replace(/^v/i, '')}` : 'mais recente';
}

function bindAdmin() {
  $('new-user-button').addEventListener('click', () => openUserModal());
  $('save-user-button').addEventListener('click', saveUser);
}

async function renderUsers() {
  const result = await animeDesk.users.list();
  if (!result.ok) {
    notifyResultError(result);
    return;
  }
  state.users = result.data;
  const container = $('users-list');
  container.replaceChildren();
  result.data.forEach((user) => {
    const card = document.createElement('article');
    card.className = 'user-card';
    const header = document.createElement('div');
    header.className = 'user-card-header';
    const avatar = document.createElement('span');
    avatar.className = 'profile-avatar';
    avatar.style.backgroundColor = user.profileColor;
    avatar.textContent = user.name[0]?.toUpperCase() || 'U';
    const text = document.createElement('div');
    text.innerHTML = `<strong>${escapeHtml(user.name)}</strong><div class="text-secondary">@${escapeHtml(user.username)} · ${user.role}</div>`;
    header.append(avatar, text);
    const status = document.createElement('span');
    status.className = user.active ? 'text-success' : 'text-danger';
    status.textContent = user.active ? 'Ativo' : 'Desativado';
    const actions = document.createElement('div');
    actions.className = 'user-card-actions';
    const edit = document.createElement('button');
    edit.className = 'btn btn-outline-light btn-sm';
    edit.type = 'button';
    edit.innerHTML = '<i class="bi bi-pencil"></i> Editar';
    edit.addEventListener('click', () => openUserModal(user));
    actions.append(edit);
    card.append(header, status, actions);
    container.append(card);
  });
}

function openUserModal(user = null) {
  $('user-modal-title').textContent = user ? 'Editar usuário' : 'Novo usuário';
  $('user-id').value = user?.id || '';
  $('user-name').value = user?.name || '';
  $('user-username').value = user?.username || '';
  $('user-username').disabled = Boolean(user);
  $('user-password').value = '';
  $('user-password-field').querySelector('label').textContent = user
    ? 'Nova senha (opcional)'
    : 'Senha inicial';
  $('user-role').value = user?.role || 'USER';
  $('user-parental-level').value = user?.parentalLevel || 'ADULT';
  $('user-color').value = user?.profileColor || '#6f5cff';
  $('user-active').checked = user?.active ?? true;
  setVisualAlert($('user-form-alert'), '');
  modals.user.show();
}

async function saveUser() {
  const id = Number($('user-id').value || 0);
  const payload = {
    id,
    name: $('user-name').value,
    username: $('user-username').value,
    password: $('user-password').value,
    role: $('user-role').value,
    parentalLevel: $('user-parental-level').value,
    profileColor: $('user-color').value,
    active: $('user-active').checked
  };
  let result;
  if (id) {
    result = await animeDesk.users.update(payload);
    if (result.ok && payload.password) {
      result = await animeDesk.users.resetPassword({
        id,
        password: payload.password,
        mustChangePassword: false
      });
    }
  } else {
    result = await animeDesk.users.create(payload);
  }
  if (!result.ok) {
    setVisualAlert($('user-form-alert'), result.error?.message || 'Não foi possível salvar.');
    return;
  }
  modals.user.hide();
  await renderUsers();
  showToast({
    title: 'Usuário salvo',
    message: 'As permissões foram atualizadas.',
    variant: 'success'
  });
}

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
    modals.parental.hide();
    const action = state.pendingParentalAction;
    state.pendingParentalAction = null;
    if (action) action();
  });
  $('submit-report-button').addEventListener('click', submitReport);
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
  modals.parental.show();
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
  modals.report.show();
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
  modals.report.hide();
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
  image.src = src || fallbackCover;
  image.alt = alt || '';
  image.addEventListener(
    'error',
    () => {
      image.src = fallbackCover;
    },
    { once: true }
  );
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

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
