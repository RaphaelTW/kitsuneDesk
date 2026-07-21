export const features = Object.freeze(['library']);

export function createLibraryFeature(context) {
  const {
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
    selectAnime,
    setCollectionButton,
    showLoading,
    showToast,
    showView,
    startEpisode,
    state,
    unwrap
  } = context;

  function renderStats(stats) {
    const cards = $('dashboard-stats').querySelectorAll('.stat-card strong');
    cards[0].textContent = Number(stats.total_plays || 0).toLocaleString('pt-BR');
    cards[1].textContent = Number(stats.distinct_animes || 0).toLocaleString('pt-BR');
    cards[2].textContent = Number(stats.completed_episodes || 0).toLocaleString('pt-BR');
    cards[3].textContent = formatHours(Number(stats.seconds_watched || 0));
  }

  function renderContinue(container, items, limit = 50) {
    container.replaceChildren();
    const rows = items.slice(0, limit);
    if (!rows.length)
      return container.append(emptyState('bi-play-circle', 'Nenhum episódio para continuar.'));
    rows.forEach((row) => {
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
      button.addEventListener('click', () => resume(row));
      container.append(button);
    });
  }

  async function resume(row) {
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
      const episodes = unwrap(await animeDesk.animes.episodes({ anime, language: row.language }));
      const index = findEpisodeIndex(episodes, savedEpisode);
      await startEpisode({
        anime,
        episode: episodes[index] || savedEpisode,
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

  function renderCollections(container, items, type, limit = 100) {
    container.replaceChildren();
    const rows = items.slice(0, limit);
    if (!rows.length)
      return container.append(
        emptyState(
          type === 'favorites' ? 'bi-heart' : 'bi-bookmark',
          type === 'favorites' ? 'Nenhum favorito ainda.' : 'Sua lista está vazia.'
        )
      );
    rows.forEach((row) => {
      const card = document.createElement('article');
      card.className = 'library-card';
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
      card.append(createImage(row.anime_cover, row.anime_title), body, actions);
      card.addEventListener('click', async () => {
        const anime = parseJson(row.anime_payload);
        if (!anime?.url)
          return showToast({
            title: 'Dados incompletos',
            message: 'Pesquise o anime novamente.',
            variant: 'warning'
          });
        await showView('search');
        await selectAnime(anime);
      });
      container.append(card);
    });
  }

  function renderHistory(container, items, full = false, limit = 100) {
    container.replaceChildren();
    const rows = items.slice(0, limit);
    if (!rows.length)
      return container.append(emptyState('bi-clock-history', 'Nenhuma reprodução registrada.'));
    rows.forEach((row) => container.append(createHistoryItem(row, full)));
  }

  function createHistoryItem(row, full) {
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
    const play = iconButton('bi-play-fill', 'Assistir');
    play.addEventListener('click', () =>
      resume({ ...row, current_episode: row.episode_number, updated_at: row.watched_at })
    );
    actions.append(play);
    if (full) {
      const complete = iconButton(
        row.completed ? 'bi-arrow-counterclockwise' : 'bi-check2',
        row.completed ? 'Marcar não concluído' : 'Marcar concluído'
      );
      complete.addEventListener('click', async () => {
        await animeDesk.history.markCompleted(row.id, !row.completed);
        await renderHistoryView();
        await hydrateDashboard();
      });
      const remove = iconButton('bi-trash', 'Remover');
      remove.addEventListener('click', async () => {
        await animeDesk.history.remove(row.id);
        await renderHistoryView();
        await hydrateDashboard();
      });
      actions.append(complete, remove);
    }
    item.append(meta, actions);
    return item;
  }

  function bind() {
    $('favorite-button').addEventListener('click', () => toggleSelected('favorite'));
    $('watchlist-button').addEventListener('click', () => toggleSelected('watchlist'));
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-list-tab]');
      if (button) {
        state.currentListTab = button.dataset.listTab;
        document
          .querySelectorAll('[data-list-tab]')
          .forEach((item) => item.classList.toggle('is-active', item === button));
        $('favorites-list').classList.toggle('d-none', state.currentListTab !== 'favorites');
        $('watchlist-list').classList.toggle('d-none', state.currentListTab !== 'watchlist');
        return;
      }
      if (event.target.closest('#export-history-button')) {
        exportHistory();
        return;
      }
      if (!event.target.closest('#clear-history-button')) return;
      if (
        !window.confirm(
          'Limpar todo o histórico deste usuário? Favoritos e configurações serão preservados.'
        )
      )
        return;
      await animeDesk.history.clear();
      await renderHistoryView();
      await hydrateDashboard();
    });
    const renderFilteredHistory = debounce(renderHistoryView, 250);
    document.addEventListener('input', (event) => {
      if (event.target.matches('#history-search')) renderFilteredHistory();
    });
  }

  async function toggleSelected(type) {
    if (!state.selectedAnime) return;
    const result =
      type === 'favorite'
        ? await animeDesk.favorites.toggle(collectionPayload(state.selectedAnime))
        : await animeDesk.watchlist.toggle(collectionPayload(state.selectedAnime));
    if (result.ok) {
      setCollectionButton(
        $(type === 'favorite' ? 'favorite-button' : 'watchlist-button'),
        result.data.active,
        type
      );
      await hydrateDashboard();
    }
  }

  async function renderContinueView() {
    const result = await animeDesk.library.continueWatching();
    if (result.ok) renderContinue($('continue-list'), result.data, 100);
  }

  async function renderLists() {
    const [favorites, watchlist] = await Promise.all([
      animeDesk.favorites.list(),
      animeDesk.watchlist.list()
    ]);
    if (favorites.ok) renderCollections($('favorites-list'), favorites.data, 'favorites');
    if (watchlist.ok) renderCollections($('watchlist-list'), watchlist.data, 'watchlist');
  }

  async function renderHistoryView() {
    const result = await animeDesk.history.list({ query: $('history-search').value, limit: 300 });
    if (result.ok) renderHistory($('history-list'), result.data, true, 300);
  }

  async function exportHistory() {
    const result = await animeDesk.history.exportCsv({
      query: $('history-search').value,
      limit: 5000
    });
    if (!result.ok) return notifyResultError(result);
    downloadTextFile(result.data.fileName, result.data.csv, result.data.mimeType);
    showToast({
      title: 'Historico exportado',
      message: 'O CSV foi gerado com os itens filtrados.',
      variant: 'success'
    });
  }

  return {
    bind,
    renderCollections,
    renderContinue,
    renderContinueView,
    renderHistory,
    renderHistoryView,
    renderLists,
    renderStats
  };
}
