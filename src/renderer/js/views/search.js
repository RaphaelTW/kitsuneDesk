export const features = Object.freeze(['search', 'library']);

export function createSearchFeature(context) {
  const {
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
    startEmbeddedPlayback,
    state,
    stripHtml,
    unwrap,
    updateSelectedProviderStatus
  } = context;

  function bind() {
    $('anime-search-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const query = $('anime-search').value.trim();
      const provider = $('provider-filter').value;
      if (query.length < 2) return;
      if (provider !== 'goanime-gui') {
        showLoading(
          'Abrindo provedor',
          'A seleção continuará no terminal do provedor escolhido...'
        );
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
        renderResults();
      } catch (error) {
        notifyError(error);
      } finally {
        hideLoading();
      }
    });
    $('provider-filter').addEventListener('change', () => {
      updateSelectedProviderStatus();
      deferTask(hydratePlayerStatus, 80);
    });
    $('back-to-results-button').addEventListener('click', () => {
      $('episodes-section').classList.add('d-none');
      $('search-results-section').classList.remove('d-none');
    });
    $('episode-filter').addEventListener('input', renderEpisodes);
  }

  function renderResults() {
    const container = $('anime-results');
    container.replaceChildren();
    $('search-results-title').textContent = `Resultados para “${$('anime-search').value.trim()}”`;
    $('result-count').textContent = `${state.results.length} resultado(s)`;
    $('search-results-section').classList.remove('d-none');
    $('episodes-section').classList.add('d-none');
    if (!state.results.length)
      return container.append(emptyState('bi-search', 'Nenhum anime foi encontrado.'));
    state.results.forEach((anime) => container.append(createCard(anime)));
  }

  function createCard(anime) {
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
    } else card.addEventListener('click', action);
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
      renderSelected();
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

  function renderSelected() {
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
    const rows = state.episodes.filter(
      (episode) => !query || `${episode.number} ${episode.title}`.toLowerCase().includes(query)
    );
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
      title.textContent = episode.title || label.textContent;
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
      if (result.embedded && result.streamUrl) await startEmbeddedPlayback(result, payload);
      showToast({
        title: result.fallbackUsed ? 'Fonte alternativa utilizada' : 'Reprodução iniciada',
        message: result.fallbackUsed
          ? `Reproduzindo por ${result.source || 'outra fonte'} em ${result.quality || 'melhor qualidade'}.`
          : result.embedded
            ? 'O episódio foi aberto no player embutido opcional.'
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
    const result = await animeDesk.library.collectionState(collectionPayload(state.selectedAnime));
    if (!result.ok) return;
    setCollectionButton($('favorite-button'), result.data.favorite, 'favorite');
    setCollectionButton($('watchlist-button'), result.data.watchlist, 'watchlist');
  }

  return { bind, launchEpisode, selectAnime };
}
