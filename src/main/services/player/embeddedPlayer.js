function createEmbeddedPlayback(payload, options) {
  const { settings, stream, queue, queueIndex, startPosition } = options;
  const result = {
    launched: true,
    provider: 'goanime-gui',
    providerName: 'GoAnime GUI',
    player: 'HTML5',
    anime: payload.anime?.name || '',
    episode: payload.episode?.number || '',
    source: payload.anime?.source || '',
    quality: payload?.quality || settings.defaultQuality || 'auto',
    mode: payload?.language === 'dub' ? 'dub' : 'sub',
    streamUrl: stream.url,
    streamMetadata: stream.metadata || {},
    resumedAt: startPosition,
    embedded: true,
    embeddedFallback: false,
    playerMode: 'embedded'
  };
  const context = createContext(payload, {
    queue,
    queueIndex,
    source: result.source,
    quality: result.quality,
    playerMode: 'embedded'
  });
  return { result, context };
}

function createContext(payload, options) {
  return {
    providerId: 'goanime-gui',
    anime: payload.anime,
    episode: payload.episode,
    episodes: options.queue,
    episodeIndex: options.queueIndex,
    queue: options.queue,
    queueIndex: options.queueIndex,
    language: payload?.language === 'dub' ? 'dub' : 'sub',
    quality: String(options.quality || 'auto'),
    source: options.source || payload?.anime?.source || '',
    playerMode: options.playerMode,
    startedAt: new Date().toISOString()
  };
}

module.exports = { createContext, createEmbeddedPlayback };
