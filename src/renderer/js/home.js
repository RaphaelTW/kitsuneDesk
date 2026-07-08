import { animeDesk, hasAnimeDeskApi } from './api.js';
import { clearSession, requireSession } from './auth.js';
import { showToast } from './components/toast.js';

const platformNames = Object.freeze({
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux'
});

const fallbackCover = '../../../assets/kitsunedesk-logo.svg';

const state = {
  status: null,
  view: 'home',
  query: '',
  language: 'sub',
  quality: 'auto',
  results: [],
  selectedAnime: null,
  episodes: []
};

const elements = {};

document.addEventListener('DOMContentLoaded', () => {
  const session = requireSession();
  if (!session) return;

  cacheElements();
  enableTooltips();
  hydrateSession(session);
  bindNavigation();
  bindSearch();
  bindEpisodeFilter();
  bindInstallers();
  bindLegacyTools();
  bindHealthCheck();
  bindLogout();
  hydrateAppInfo();
  hydratePlayerStatus();
});

function cacheElements() {
  const ids = [
    'home-view',
    'results-view',
    'episodes-view',
    'top-home-button',
    'brand-home-button',
    'results-home-button',
    'results-new-search-button',
    'episodes-back-button',
    'episodes-home-button',
    'episodes-new-search-button',
    'anime-search-form',
    'anime-search',
    'anime-search-submit',
    'language-filter',
    'quality-filter',
    'gui-gate',
    'activate-gui-button',
    'gui-status-card',
    'goanime-gui-status',
    'goanime-classic-status',
    'mpv-status',
    'goanime-tool-status',
    'animeclibr-status',
    'anicli-status',
    'fast-vsr-status',
    'refresh-dependencies-button',
    'install-goanime-button',
    'install-animeclibr-button',
    'install-anicli-button',
    'prepare-fast-vsr-button',
    'open-goanime-classic',
    'open-animeclibr',
    'open-anicli',
    'results-title',
    'results-description',
    'result-count',
    'anime-results',
    'selected-anime-image',
    'selected-anime-badges',
    'episodes-title',
    'selected-anime-description',
    'selected-anime-meta',
    'episodes-count',
    'episode-filter',
    'episode-grid',
    'loading-overlay',
    'loading-title',
    'loading-message',
    'app-version',
    'app-platform',
    'current-user',
    'health-check-button',
    'logout-button'
  ];

  ids.forEach((id) => {
    elements[id] = document.getElementById(id);
  });
}

/** @param {object} session */
function hydrateSession(session) {
  elements['current-user'].textContent = session.user.name;
}

function enableTooltips() {
  document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((element) => {
    new bootstrap.Tooltip(element);
  });
}

async function hydrateAppInfo() {
  if (!hasAnimeDeskApi()) {
    elements['health-check-button'].disabled = true;
    showToast({
      title: 'Preload',
      message: 'A API segura não foi encontrada no renderer.',
      variant: 'error'
    });
    return;
  }

  try {
    const appInfo = await animeDesk.app.getInfo();
    elements['app-version'].textContent = `v${appInfo.version}`;
    elements['app-platform'].textContent = platformNames[appInfo.platform] ?? appInfo.platform;
  } catch (error) {
    showToast({
      title: 'Aplicação',
      message: error.message || 'Não foi possível ler as informações da aplicação.',
      variant: 'error'
    });
  }
}

async function hydratePlayerStatus() {
  const refreshButton = elements['refresh-dependencies-button'];
  refreshButton.disabled = true;
  elements['goanime-gui-status'].textContent = 'Verificando...';

  try {
    const result = await animeDesk.player.status();
    if (!result.ok) throw new Error(result.error?.message ?? 'Falha ao verificar o sistema.');

    state.status = result.data;
    renderStatus(result.data);
  } catch (error) {
    elements['goanime-gui-status'].textContent = 'Status indisponível';
    showToast({
      title: 'Status',
      message: error.message || 'Não foi possível verificar os componentes locais.',
      variant: 'error'
    });
  } finally {
    refreshButton.disabled = false;
  }
}

/** @param {object} status */
function renderStatus(status) {
  const guiReady = Boolean(status.providers.goAnime.ready);
  const classicReady = Boolean(status.providers.goAnime.classicReady);
  const mpvReady = Boolean(status.dependencies.mpv.available);
  const animeCliBrReady = Boolean(status.providers.animeCliBr.ready);
  const aniCliReady = Boolean(status.providers.aniCli.ready);
  const fast = status.tools.fastAnimeVsr;

  elements['gui-status-card'].classList.toggle('is-ready', guiReady);
  elements['goanime-gui-status'].textContent = guiReady
    ? `Pronto${status.dependencies.goAnimeBridge.version ? ` · v${status.dependencies.goAnimeBridge.version}` : ''}`
    : 'Bridge gráfico não instalado';
  elements['goanime-classic-status'].textContent = classicReady
    ? 'Instalado'
    : status.dependencies.goAnime.available
      ? 'MPV pendente'
      : 'Não instalado';
  elements['mpv-status'].textContent = mpvReady
    ? shortPath(status.dependencies.mpv.path)
    : 'Não encontrado';

  elements['goanime-tool-status'].textContent = classicReady ? 'Pronto' : 'Não configurado';
  elements['animeclibr-status'].textContent = animeCliBrReady
    ? 'Pronto; fonte sujeita a DNS'
    : 'Não configurado';
  elements['anicli-status'].textContent = aniCliReady
    ? 'Instalado; origem instável'
    : 'Não configurado';
  elements['fast-vsr-status'].textContent = fast.ready
    ? 'Runtime CUDA pronto'
    : fast.installed
      ? fast.runtime.message
      : status.dependencies.python.available
        ? 'Python 3.10 encontrado; ambiente pendente'
        : 'Python 3.10 / ambiente pendente';

  elements['gui-gate'].classList.toggle('d-none', guiReady);
  elements['anime-search-submit'].disabled = !guiReady;

  elements['open-goanime-classic'].disabled = !classicReady;
  elements['open-animeclibr'].disabled = !animeCliBrReady;
  elements['open-anicli'].disabled = !aniCliReady;

  elements['install-goanime-button'].textContent = classicReady ? 'Reinstalar' : 'Instalar';
  elements['install-animeclibr-button'].textContent = animeCliBrReady ? 'Reparar' : 'Instalar';
  elements['install-anicli-button'].textContent = aniCliReady ? 'Reparar' : 'Instalar';
  elements['prepare-fast-vsr-button'].textContent = fast.installed
    ? 'Reparar ambiente'
    : 'Preparar ambiente';
}

function bindSearch() {
  elements['anime-search-form'].addEventListener('submit', async (event) => {
    event.preventDefault();

    const query = elements['anime-search'].value.trim();
    const language = elements['language-filter'].value === 'dub' ? 'dub' : 'sub';
    const quality = elements['quality-filter'].value;

    if (query.length < 2) {
      showToast({
        title: 'Pesquisa',
        message: 'Digite pelo menos dois caracteres.',
        variant: 'warning'
      });
      return;
    }

    if (!state.status?.providers?.goAnime?.ready) {
      showToast({
        title: 'GoAnime GUI',
        message: 'Ative o motor gráfico antes de pesquisar.',
        variant: 'warning'
      });
      return;
    }

    state.query = query;
    state.language = language;
    state.quality = quality;

    setBusy(true, 'Pesquisando animes', 'Consultando as fontes ativas do GoAnime...');
    try {
      const result = await animeDesk.animes.search({ query, language });
      if (!result.ok) {
        throw new Error(result.error?.message ?? 'Não foi possível concluir a pesquisa.');
      }

      state.results = Array.isArray(result.data) ? result.data : [];
      renderResults();
      showView('results');
    } catch (error) {
      showToast({
        title: 'Pesquisa',
        message: error.message || 'Não foi possível pesquisar agora.',
        variant: 'error'
      });
    } finally {
      setBusy(false);
    }
  });
}

function renderResults() {
  const container = elements['anime-results'];
  container.replaceChildren();
  elements['results-title'].textContent = `Resultados para “${state.query}”`;
  elements['results-description'].textContent =
    state.language === 'dub'
      ? 'Resultados em português aparecem primeiro quando estão disponíveis.'
      : 'Selecione um título para carregar a lista de episódios.';
  elements['result-count'].textContent =
    `${state.results.length} ${state.results.length === 1 ? 'resultado' : 'resultados'}`;

  if (state.results.length === 0) {
    container.append(createEmptyState('bi-search', 'Nenhum resultado encontrado.'));
    return;
  }

  state.results.forEach((anime) => container.append(createAnimeCard(anime)));
}

/** @param {object} anime */
function createAnimeCard(anime) {
  const article = document.createElement('article');
  article.className = 'anime-result-card';

  const coverWrap = document.createElement('div');
  coverWrap.className = 'anime-cover-wrap';

  const image = document.createElement('img');
  image.src = safeImageUrl(anime.imageUrl);
  image.alt = `Capa de ${anime.name || 'anime'}`;
  image.loading = 'lazy';
  image.addEventListener(
    'error',
    () => {
      image.src = fallbackCover;
      image.classList.add('is-fallback');
    },
    { once: true }
  );

  const source = document.createElement('span');
  source.className = 'source-badge';
  source.textContent = anime.source || 'GoAnime';
  coverWrap.append(image, source);

  const body = document.createElement('div');
  body.className = 'anime-card-body';

  const title = document.createElement('h3');
  title.textContent = anime.name || 'Título sem nome';

  const meta = document.createElement('div');
  meta.className = 'anime-card-meta';
  appendMeta(meta, anime.year);
  appendMeta(meta, anime.averageScore ? `★ ${anime.averageScore}` : '');
  appendMeta(meta, anime.totalEpisodes ? `${anime.totalEpisodes} eps.` : '');
  if (Array.isArray(anime.genres))
    anime.genres.slice(0, 2).forEach((genre) => appendMeta(meta, genre));

  const description = document.createElement('p');
  description.className = 'anime-card-description';
  description.textContent = anime.description || 'Sem descrição disponível para este resultado.';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-primary';
  button.textContent = 'Ver episódios';
  button.addEventListener('click', () => selectAnime(anime));

  body.append(title, meta, description, button);
  article.append(coverWrap, body);
  return article;
}

/** @param {object} anime */
async function selectAnime(anime) {
  setBusy(true, 'Carregando episódios', `Buscando episódios de ${anime.name}...`);
  try {
    const result = await animeDesk.animes.episodes({ anime, language: state.language });
    if (!result.ok) {
      throw new Error(result.error?.message ?? 'Não foi possível carregar os episódios.');
    }

    state.selectedAnime = anime;
    state.episodes = Array.isArray(result.data) ? result.data : [];
    elements['episode-filter'].value = '';
    renderSelectedAnime();
    renderEpisodes(state.episodes);
    showView('episodes');
  } catch (error) {
    showToast({
      title: 'Episódios',
      message: error.message || 'Não foi possível carregar os episódios.',
      variant: 'error'
    });
  } finally {
    setBusy(false);
  }
}

function renderSelectedAnime() {
  const anime = state.selectedAnime;
  if (!anime) return;

  elements['selected-anime-image'].src = safeImageUrl(anime.imageUrl);
  elements['selected-anime-image'].alt = `Capa de ${anime.name}`;
  elements['selected-anime-image'].onerror = () => {
    elements['selected-anime-image'].src = fallbackCover;
  };
  elements['episodes-title'].textContent = anime.name;
  elements['selected-anime-description'].textContent =
    anime.description || 'Sem descrição disponível para este título.';

  const badges = elements['selected-anime-badges'];
  badges.replaceChildren();
  appendMeta(badges, anime.source || 'GoAnime');
  appendMeta(badges, state.language === 'dub' ? 'Dublado / PT-BR' : 'Legendado');
  appendMeta(badges, formatQuality(state.quality));

  const meta = elements['selected-anime-meta'];
  meta.replaceChildren();
  appendMeta(meta, anime.year);
  appendMeta(meta, anime.averageScore ? `★ ${anime.averageScore}` : '');
  appendMeta(meta, anime.status);
  if (Array.isArray(anime.genres))
    anime.genres.slice(0, 4).forEach((genre) => appendMeta(meta, genre));
}

/** @param {object[]} episodes */
function renderEpisodes(episodes) {
  const container = elements['episode-grid'];
  container.replaceChildren();
  elements['episodes-count'].textContent =
    `${episodes.length} ${episodes.length === 1 ? 'episódio' : 'episódios'}`;

  if (episodes.length === 0) {
    container.append(createEmptyState('bi-collection', 'Nenhum episódio corresponde ao filtro.'));
    return;
  }

  episodes.forEach((episode) => container.append(createEpisodeCard(episode)));
}

/** @param {object} episode */
function createEpisodeCard(episode) {
  const article = document.createElement('article');
  article.className = 'episode-card';

  const number = document.createElement('span');
  number.className = 'episode-number';
  number.textContent = `Episódio ${episode.number}`;

  const title = document.createElement('h4');
  title.textContent = episode.title || `Episódio ${episode.number}`;

  const flags = document.createElement('div');
  flags.className = 'episode-flags';
  if (episode.isFiller) appendMeta(flags, 'Filler');
  if (episode.isRecap) appendMeta(flags, 'Recap');
  if (episode.duration) appendMeta(flags, formatDuration(episode.duration));

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-sm btn-primary';
  const icon = document.createElement('i');
  icon.className = 'bi bi-play-fill';
  const label = document.createElement('span');
  label.textContent = 'Assistir';
  button.append(icon, label);
  button.addEventListener('click', () => playEpisode(episode, button));

  article.append(number, title, flags, button);
  return article;
}

/** @param {object} episode @param {HTMLButtonElement} button */
async function playEpisode(episode, button) {
  if (!state.selectedAnime) return;
  button.disabled = true;

  try {
    const result = await animeDesk.player.playEpisode({
      anime: state.selectedAnime,
      episode,
      language: state.language,
      quality: state.quality
    });

    if (!result.ok) {
      throw new Error(result.error?.message ?? 'Não foi possível abrir o episódio.');
    }

    showToast({
      title: 'MPV aberto',
      message: `${state.selectedAnime.name} · Episódio ${episode.number}`,
      variant: 'success'
    });
  } catch (error) {
    showToast({
      title: 'Reprodução',
      message: error.message || 'Não foi possível abrir o episódio.',
      variant: 'error'
    });
  } finally {
    button.disabled = false;
  }
}

function bindEpisodeFilter() {
  elements['episode-filter'].addEventListener('input', () => {
    const term = elements['episode-filter'].value.trim().toLowerCase();
    if (!term) {
      renderEpisodes(state.episodes);
      return;
    }

    const filtered = state.episodes.filter((episode) =>
      `${episode.number} ${episode.title ?? ''}`.toLowerCase().includes(term)
    );
    renderEpisodes(filtered);
  });
}

function bindNavigation() {
  const homeButtons = [
    elements['brand-home-button'],
    elements['top-home-button'],
    elements['results-home-button'],
    elements['episodes-home-button']
  ];
  homeButtons.forEach((button) => button.addEventListener('click', () => showView('home')));

  elements['results-new-search-button'].addEventListener('click', startNewSearch);
  elements['episodes-new-search-button'].addEventListener('click', startNewSearch);
  elements['episodes-back-button'].addEventListener('click', () => showView('results'));
}

function startNewSearch() {
  showView('home');
  elements['anime-search'].value = '';
  window.setTimeout(() => elements['anime-search'].focus(), 80);
}

/** @param {'home'|'results'|'episodes'} view */
function showView(view) {
  state.view = view;
  elements['home-view'].classList.toggle('d-none', view !== 'home');
  elements['results-view'].classList.toggle('d-none', view !== 'results');
  elements['episodes-view'].classList.toggle('d-none', view !== 'episodes');
  elements['top-home-button'].classList.toggle('d-none', view === 'home');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bindInstallers() {
  bindInstaller(elements['activate-gui-button'], 'goanime-gui', 'GoAnime GUI');
  bindInstaller(elements['install-goanime-button'], 'goanime', 'GoAnime clássico');
  bindInstaller(elements['install-animeclibr-button'], 'anime-cli-br', 'anime-cli-br');
  bindInstaller(elements['install-anicli-button'], 'ani-cli', 'ani-cli');
  bindInstaller(elements['prepare-fast-vsr-button'], 'fast-anime-vsr', 'FAST Anime VSR');

  elements['refresh-dependencies-button'].addEventListener('click', hydratePlayerStatus);
}

/** @param {HTMLButtonElement} button @param {string} provider @param {string} label */
function bindInstaller(button, provider, label) {
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const result = await animeDesk.player.installDependencies(provider);
      if (!result.ok) throw new Error(result.error?.message ?? `Falha ao abrir ${label}.`);

      showToast({
        title: 'Instalação aberta',
        message: `${label}: acompanhe o processo no ${result.data.terminal} e depois atualize o status.`,
        variant: 'success'
      });
    } catch (error) {
      showToast({
        title: 'Instalação',
        message: error.message || `Não foi possível abrir o instalador do ${label}.`,
        variant: 'error'
      });
    } finally {
      button.disabled = false;
    }
  });
}

function bindLegacyTools() {
  elements['open-goanime-classic'].addEventListener('click', () => openLegacy('goanime'));
  elements['open-animeclibr'].addEventListener('click', () => openLegacy('anime-cli-br'));
  elements['open-anicli'].addEventListener('click', () => openLegacy('ani-cli'));
}

/** @param {'goanime'|'anime-cli-br'|'ani-cli'} provider */
async function openLegacy(provider) {
  const query = elements['anime-search'].value.trim() || state.query;
  if (query.length < 2) {
    showToast({
      title: 'Provedor legado',
      message: 'Digite um anime no campo de busca antes de abrir o provedor.',
      variant: 'warning'
    });
    showView('home');
    elements['anime-search'].focus();
    return;
  }

  try {
    const result = await animeDesk.player.openLegacy({
      query,
      provider,
      language: elements['language-filter'].value,
      quality: elements['quality-filter'].value
    });
    if (!result.ok) throw new Error(result.error?.message ?? 'Não foi possível abrir o provedor.');

    showToast({
      title: result.data.providerName,
      message: `Aberto no ${result.data.terminal}.`,
      variant: 'success'
    });
  } catch (error) {
    showToast({
      title: 'Provedor legado',
      message: error.message || 'Não foi possível abrir o provedor.',
      variant: 'error'
    });
  }
}

function bindHealthCheck() {
  elements['health-check-button'].addEventListener('click', async () => {
    elements['health-check-button'].disabled = true;
    try {
      const result = await animeDesk.app.ping();
      showToast({
        title: 'Comunicação local',
        message: result.ok
          ? `Resposta recebida às ${formatTime(result.checkedAt)}.`
          : 'Sem resposta.',
        variant: result.ok ? 'success' : 'warning'
      });
    } catch (error) {
      showToast({
        title: 'Comunicação local',
        message: error.message || 'Não foi possível consultar o processo principal.',
        variant: 'error'
      });
    } finally {
      elements['health-check-button'].disabled = false;
    }
  });
}

function bindLogout() {
  elements['logout-button'].addEventListener('click', async () => {
    elements['logout-button'].disabled = true;
    try {
      await animeDesk.auth.logout();
    } finally {
      clearSession();
      window.location.href = './login.html';
    }
  });
}

/** @param {boolean} busy @param {string} [title] @param {string} [message] */
function setBusy(busy, title = 'Carregando', message = 'Aguarde um momento...') {
  elements['loading-title'].textContent = title;
  elements['loading-message'].textContent = message;
  elements['loading-overlay'].classList.toggle('d-none', !busy);
}

/** @param {HTMLElement} container @param {unknown} value */
function appendMeta(container, value) {
  const text = String(value ?? '').trim();
  if (!text) return;
  const chip = document.createElement('span');
  chip.className = 'meta-chip';
  chip.textContent = text;
  container.append(chip);
}

/** @param {string} icon @param {string} message */
function createEmptyState(icon, message) {
  const element = document.createElement('div');
  element.className = 'empty-state';
  const iconElement = document.createElement('i');
  iconElement.className = `bi ${icon}`;
  const text = document.createElement('p');
  text.textContent = message;
  element.append(iconElement, text);
  return element;
}

/** @param {unknown} value */
function safeImageUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallbackCover;
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol) ? raw : fallbackCover;
  } catch {
    return fallbackCover;
  }
}

/** @param {string | null} value */
function shortPath(value) {
  if (!value) return 'Não encontrado';
  const parts = value.split(/[\\/]/).filter(Boolean);
  return parts.slice(-3).join('\\');
}

/** @param {string} value */
function formatQuality(value) {
  return value === 'auto' ? 'Melhor disponível' : `${value}p`;
}

/** @param {number} seconds */
function formatDuration(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

/** @param {string} isoDate */
function formatTime(isoDate) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(isoDate));
}
