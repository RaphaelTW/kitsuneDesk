import { animeDesk, hasAnimeDeskApi } from './api.js';
import { clearSession, requireSession } from './auth.js';
import { showToast } from './components/toast.js';

const platformNames = Object.freeze({
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux'
});

const fallbackCover = '../../../assets/kitsunedesk-logo.svg';

const providerCatalog = Object.freeze({
  'goanime-gui': Object.freeze({
    title: 'GoAnime com interface gráfica',
    description:
      'Recomendado. Busca, resultados e episódios aparecem dentro do aplicativo; apenas o MPV abre.',
    help: 'Pesquisa e episódios dentro do KitsuneDesk; somente o MPV abre para reproduzir.',
    icon: 'bi-window-stack',
    submitLabel: 'Buscar na interface',
    installTarget: 'goanime-gui',
    installLabel: 'Ativar / atualizar GoAnime GUI',
    kind: 'gui'
  }),
  goanime: Object.freeze({
    title: 'GoAnime clássico',
    description:
      'Abre o GoAnime no terminal com o fluxo original de pesquisa, seleção de episódio e reprodução.',
    help: 'Mantém o funcionamento clássico do GoAnime em uma janela de terminal.',
    icon: 'bi-terminal',
    submitLabel: 'Abrir GoAnime clássico',
    installTarget: 'goanime',
    installLabel: 'Instalar GoAnime',
    kind: 'legacy'
  }),
  'anime-cli-br': Object.freeze({
    title: 'anime-cli-br',
    description:
      'Alternativa brasileira baseada em AnimeFire. A seleção final ocorre dentro do terminal.',
    help: 'A fonte AnimeFire pode ficar indisponível por DNS; o KitsuneDesk testa antes de abrir.',
    icon: 'bi-translate',
    submitLabel: 'Abrir anime-cli-br',
    installTarget: 'anime-cli-br',
    installLabel: 'Instalar / reparar',
    kind: 'legacy'
  }),
  'fast-anime-vsr': Object.freeze({
    title: 'FAST Anime VSR',
    description:
      'Ferramenta de super-resolução para vídeos locais com GPU NVIDIA. Não é um provedor de streaming.',
    help: 'Usa arquivos locais e um ambiente Python/CUDA próprio; idioma e resolução não se aplicam.',
    icon: 'bi-gpu-card',
    submitLabel: 'Abrir FAST Anime VSR',
    installTarget: 'fast-anime-vsr',
    installLabel: 'Preparar / reparar ambiente',
    kind: 'tool'
  }),
  'ani-cli': Object.freeze({
    title: 'ani-cli experimental',
    description:
      'Mantido como alternativa experimental. A origem externa pode não entregar links válidos.',
    help: 'Executa no Git Bash e pode falhar mesmo quando o episódio é encontrado.',
    icon: 'bi-exclamation-triangle',
    submitLabel: 'Abrir ani-cli experimental',
    installTarget: 'ani-cli',
    installLabel: 'Instalar / reparar',
    kind: 'legacy'
  })
});

const state = {
  status: null,
  view: 'home',
  query: '',
  language: 'sub',
  quality: 'auto',
  provider: 'goanime-gui',
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
  bindProviderSelection();
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
    'anime-search-submit-label',
    'anime-search-submit-icon',
    'provider-filter',
    'provider-help',
    'language-filter',
    'quality-filter',
    'selected-provider-summary',
    'selected-provider-title',
    'selected-provider-description',
    'selected-provider-readiness',
    'provider-gate',
    'provider-gate-title',
    'provider-gate-message',
    'provider-action-button',
    'provider-action-label',
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

  elements['open-goanime-classic'].disabled = !classicReady;
  elements['open-animeclibr'].disabled = !animeCliBrReady;
  elements['open-anicli'].disabled = !aniCliReady;

  elements['install-goanime-button'].textContent = classicReady ? 'Reinstalar' : 'Instalar';
  elements['install-animeclibr-button'].textContent = animeCliBrReady ? 'Reparar' : 'Instalar';
  elements['install-anicli-button'].textContent = aniCliReady ? 'Reparar' : 'Instalar';
  elements['prepare-fast-vsr-button'].textContent = fast.installed
    ? 'Reparar ambiente'
    : 'Preparar ambiente';

  updateProviderUi();
}

function bindProviderSelection() {
  elements['provider-filter'].value = state.provider;
  elements['quality-filter'].value = 'auto';

  elements['provider-filter'].addEventListener('change', () => {
    state.provider = elements['provider-filter'].value;
    updateProviderUi();
  });

  elements['language-filter'].addEventListener('change', () => {
    state.language = elements['language-filter'].value === 'dub' ? 'dub' : 'sub';
  });

  elements['quality-filter'].addEventListener('change', () => {
    state.quality = elements['quality-filter'].value || 'auto';
  });

  elements['provider-action-button'].addEventListener('click', async () => {
    const definition = getSelectedProviderDefinition();
    await launchInstaller(
      elements['provider-action-button'],
      definition.installTarget,
      definition.title
    );
  });

  updateProviderUi();
}

function updateProviderUi() {
  const provider = elements['provider-filter']?.value || state.provider || 'goanime-gui';
  const definition = providerCatalog[provider] ?? providerCatalog['goanime-gui'];
  const availability = getProviderAvailability(provider, state.status);
  const isFastTool = provider === 'fast-anime-vsr';
  const controlsApply = !['anime-cli-br', 'fast-anime-vsr'].includes(provider);

  state.provider = provider;
  elements['provider-help'].textContent = definition.help;
  elements['selected-provider-title'].textContent = definition.title;
  elements['selected-provider-description'].textContent = definition.description;
  elements['selected-provider-readiness'].textContent = availability.label;
  elements['selected-provider-summary'].classList.toggle('is-ready', availability.ready);
  elements['selected-provider-summary'].classList.toggle('is-warning', availability.warning);

  const icon = elements['selected-provider-summary'].querySelector('.provider-summary-icon i');
  icon.className = `bi ${definition.icon}`;

  elements['anime-search-submit-label'].textContent = definition.submitLabel;
  elements['anime-search-submit-icon'].className = isFastTool
    ? 'bi bi-folder2-open'
    : definition.kind === 'gui'
      ? 'bi bi-arrow-right'
      : 'bi bi-box-arrow-up-right';

  elements['anime-search'].disabled = isFastTool;
  elements['anime-search'].required = !isFastTool;
  elements['anime-search'].placeholder = isFastTool
    ? 'FAST Anime VSR trabalha com arquivos locais'
    : 'Ex.: Naruto, Sonic X, Dragon Ball...';
  elements['language-filter'].disabled = !controlsApply;
  elements['quality-filter'].disabled = !controlsApply;

  elements['anime-search-submit'].disabled = !availability.ready;
  elements['provider-gate'].classList.toggle('d-none', availability.ready);
  elements['provider-gate-title'].textContent = availability.gateTitle;
  elements['provider-gate-message'].textContent = availability.gateMessage;
  elements['provider-action-label'].textContent = definition.installLabel;
}

function getSelectedProviderDefinition() {
  return providerCatalog[elements['provider-filter'].value] ?? providerCatalog['goanime-gui'];
}

function getProviderAvailability(provider, status) {
  if (!status) {
    return {
      ready: false,
      warning: false,
      label: 'Verificando',
      gateTitle: 'Verificando componentes',
      gateMessage: 'Aguarde a leitura do ambiente local.'
    };
  }

  if (provider === 'goanime-gui') {
    const bridge = status.providers.goAnime.bridge ?? {};
    const ready = Boolean(status.providers.goAnime.ready);
    const needsUpdate = Boolean(bridge.needsUpdate);
    return {
      ready,
      warning: needsUpdate,
      label: ready
        ? 'Principal · pronto'
        : needsUpdate
          ? 'Atualização necessária'
          : 'Não instalado',
      gateTitle: needsUpdate
        ? 'GoAnime GUI precisa ser atualizado'
        : 'GoAnime GUI ainda não está ativo',
      gateMessage: needsUpdate
        ? `Atualize o motor gráfico da versão ${bridge.version ?? 'antiga'} para ${bridge.expectedVersion ?? 'a atual'} e depois clique em Atualizar status.`
        : 'Ative o motor gráfico uma única vez e depois atualize o status.'
    };
  }

  if (provider === 'goanime') {
    const ready = Boolean(status.providers.goAnime.classicReady);
    return {
      ready,
      warning: false,
      label: ready ? 'Pronto' : 'Não configurado',
      gateTitle: 'GoAnime clássico não está pronto',
      gateMessage: 'Instale o pacote oficial com GoAnime e MPV.'
    };
  }

  if (provider === 'anime-cli-br') {
    const ready = Boolean(status.providers.animeCliBr.ready);
    return {
      ready,
      warning: ready,
      label: ready ? 'Pronto · fonte instável' : 'Não configurado',
      gateTitle: 'anime-cli-br não está pronto',
      gateMessage: 'Instale o ambiente Python dedicado e o VLC.'
    };
  }

  if (provider === 'ani-cli') {
    const ready = Boolean(status.providers.aniCli.ready);
    return {
      ready,
      warning: true,
      label: ready ? 'Experimental' : 'Não configurado',
      gateTitle: 'ani-cli não está pronto',
      gateMessage: 'Instale o ani-cli, Git Bash, fzf, FFmpeg, MPV e OpenSSL.'
    };
  }

  const fast = status.tools.fastAnimeVsr;
  const ready = Boolean(fast.ready);
  return {
    ready,
    warning: !ready,
    label: ready ? 'Runtime pronto' : fast.installed ? 'Ambiente incompleto' : 'Não preparado',
    gateTitle: fast.installed
      ? 'FAST Anime VSR precisa de reparo'
      : 'FAST Anime VSR não está preparado',
    gateMessage: fast.installed
      ? fast.runtime.message
      : 'Prepare o ambiente Python 3.10, FFmpeg e CUDA antes de usar.'
  };
}

function bindSearch() {
  elements['anime-search-form'].addEventListener('submit', async (event) => {
    event.preventDefault();

    const provider = elements['provider-filter'].value || 'goanime-gui';
    const query = elements['anime-search'].value.trim();
    const language = elements['language-filter'].value === 'dub' ? 'dub' : 'sub';
    const quality = elements['quality-filter'].value || 'auto';

    state.provider = provider;
    state.language = language;
    state.quality = quality;

    if (provider === 'fast-anime-vsr') {
      await openFastAnimeVsr();
      return;
    }

    if (query.length < 2) {
      showToast({
        title: 'Pesquisa',
        message: 'Digite pelo menos dois caracteres.',
        variant: 'warning'
      });
      return;
    }

    state.query = query;

    if (provider !== 'goanime-gui') {
      await openLegacy(provider);
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
  number.textContent = formatEpisodeLabel(episode.number);

  const title = document.createElement('h4');
  title.textContent = episode.title || formatEpisodeLabel(episode.number);

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

  const label = button.querySelector('span');
  const originalLabel = label?.textContent ?? 'Assistir';
  button.disabled = true;
  if (label) label.textContent = 'Abrindo...';

  try {
    const result = await animeDesk.player.playEpisode({
      anime: state.selectedAnime,
      episode,
      language: state.language,
      quality: state.quality
    });

    if (!result.ok || !result.data?.launched || !result.data?.pid) {
      throw new Error(result.error?.message ?? 'O MPV não confirmou o início da reprodução.');
    }

    showToast({
      title: 'MPV aberto',
      message: `${state.selectedAnime.name} · ${formatEpisodeLabel(episode.number)}`,
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
    if (label) label.textContent = originalLabel;
  }
}

function formatEpisodeLabel(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Episódio';
  if (/^(epis[oó]dio|episode|ep\.?)[\s:-]/i.test(raw)) return raw;
  return `Episódio ${raw}`;
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
  bindInstaller(elements['install-goanime-button'], 'goanime', 'GoAnime clássico');
  bindInstaller(elements['install-animeclibr-button'], 'anime-cli-br', 'anime-cli-br');
  bindInstaller(elements['install-anicli-button'], 'ani-cli', 'ani-cli');
  bindInstaller(elements['prepare-fast-vsr-button'], 'fast-anime-vsr', 'FAST Anime VSR');

  elements['refresh-dependencies-button'].addEventListener('click', hydratePlayerStatus);
}

/** @param {HTMLButtonElement} button @param {string} provider @param {string} label */
function bindInstaller(button, provider, label) {
  button.addEventListener('click', () => launchInstaller(button, provider, label));
}

/** @param {HTMLButtonElement} button @param {string} provider @param {string} label */
async function launchInstaller(button, provider, label) {
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

async function openFastAnimeVsr() {
  try {
    const result = await animeDesk.player.openTool({ tool: 'fast-anime-vsr' });
    if (!result.ok) {
      throw new Error(result.error?.message ?? 'Não foi possível abrir o FAST Anime VSR.');
    }

    showToast({
      title: 'FAST Anime VSR',
      message: `Ambiente aberto no ${result.data.terminal}.`,
      variant: 'success'
    });
  } catch (error) {
    showToast({
      title: 'FAST Anime VSR',
      message: error.message || 'Não foi possível abrir a ferramenta.',
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
