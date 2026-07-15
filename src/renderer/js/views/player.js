export function createPlayerFeature(context) {
  const {
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
  } = context;

  function bind() {
    $('embedded-player-close').addEventListener('click', () => {
      const video = $('embedded-video');
      video.pause();
      video.removeAttribute('src');
      video.load();
      $('embedded-player-status').textContent = 'Player embutido fechado.';
      $('embedded-player').classList.add('is-hidden');
    });
    $('embedded-video').addEventListener('error', () => {
      $('embedded-player-status').textContent =
        'O Chromium recusou este stream. Use MPV externo ou outra fonte.';
      showToast({
        title: 'Player embutido',
        message: 'Stream incompatível com o Chromium. O MPV externo continua recomendado.',
        variant: 'warning'
      });
    });
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
    $('player-queue-button').addEventListener('click', async () => {
      await renderQueue();
      getModal('queue', 'queue-modal').show();
    });
    $('player-progress').addEventListener('change', async () => {
      const duration = Number(state.playback?.duration || 0);
      if (duration > 0) {
        await animeDesk.player.seek(
          (Number($('player-progress').value) / 100) * duration,
          'absolute'
        );
      }
    });
    $('player-volume').addEventListener(
      'input',
      debounce(() => animeDesk.player.setVolume(Number($('player-volume').value)), 100)
    );
    $('report-episode-button').addEventListener('click', openReportModal);
  }

  function render(playerState) {
    state.playback = { ...(state.playback || {}), ...playerState };
    const active = Boolean(playerState.active || playerState.paused);
    $('mini-player').classList.toggle('is-hidden', !active);
    if (!active) return;
    const playbackContext = playerState.context || state.playback?.context || {};
    const anime = playbackContext.anime || {};
    const episode = playbackContext.episode || {};
    $('player-cover').src = anime.imageUrl || fallbackCover;
    $('player-title').textContent = anime.name || playerState.animeTitle || 'Reproduzindo';
    $('player-subtitle').textContent =
      `Episódio ${cleanEpisode(episode.number || playerState.episodeNumber)} · ${playerState.quality || playbackContext.quality || ''}`;
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

  async function hydrate() {
    const result = await animeDesk.player.playbackState();
    if (result.ok) render(result.data);
  }

  async function renderQueue() {
    const result = await animeDesk.player.queue();
    const container = $('playback-queue-list');
    container.replaceChildren();
    if (!result.ok || !result.data?.items?.length) {
      container.append(emptyState('bi-list-ol', 'Nenhuma fila ativa.'));
      return;
    }
    const { items, currentIndex } = result.data;
    items.forEach((episode, index) => {
      const item = document.createElement('article');
      item.className = 'queue-item';
      item.classList.toggle('is-current', index === currentIndex);
      const text = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = episode.title || `Episodio ${cleanEpisode(episode.number)}`;
      const meta = document.createElement('small');
      meta.textContent =
        index === currentIndex
          ? 'Reproduzindo agora'
          : `Episodio ${cleanEpisode(episode.number || episode.num)}`;
      text.append(title, meta);
      const actions = document.createElement('div');
      actions.className = 'queue-actions';
      const up = iconButton('bi-arrow-up', 'Subir na fila');
      up.disabled = index <= 0;
      up.addEventListener('click', () => moveQueueItem(index, index - 1));
      const down = iconButton('bi-arrow-down', 'Descer na fila');
      down.disabled = index >= items.length - 1;
      down.addEventListener('click', () => moveQueueItem(index, index + 1));
      actions.append(up, down);
      item.append(text, actions);
      container.append(item);
    });
  }

  async function moveQueueItem(fromIndex, toIndex) {
    const result = await animeDesk.player.reorderQueue({ fromIndex, toIndex });
    if (!result.ok) return notifyResultError(result);
    await renderQueue();
  }

  function handleSourceProgress(progress) {
    const message = progress?.message || 'Consultando fontes...';
    if (!$('loading-overlay').classList.contains('d-none'))
      $('loading-message').textContent = message;
    const status = $('selected-provider-status');
    status.querySelector('.status-dot').className = 'status-dot is-checking';
    status.querySelector('span:last-child').textContent = message;
  }

  async function startEmbeddedPlayback(result, payload) {
    const video = $('embedded-video');
    $('embedded-player-title').textContent =
      `${payload.anime?.name || 'Anime'} · Episódio ${payload.episode?.number || ''}`;
    $('embedded-player').classList.remove('is-hidden');
    const metadata = result.streamMetadata || {};
    const needsHeaders =
      Boolean(metadata.referer) || String(metadata.requiresHeaders || '').toLowerCase() === 'true';
    const hls = /\.m3u8(?:$|[?#])/i.test(result.streamUrl) || metadata.container === 'hls';
    $('embedded-player-status').textContent =
      needsHeaders || hls
        ? translate('embeddedHeadersFallback')
        : 'Stream carregado no player embutido.';
    video.src = result.streamUrl;
    video.volume = Math.max(0, Math.min(1, Number(state.settings?.playerVolume ?? 80) / 100));
    video.currentTime = Number(result.resumedAt || 0);
    await video.play();
  }

  return { bind, handleSourceProgress, hydrate, render, renderQueue, startEmbeddedPlayback };
}
