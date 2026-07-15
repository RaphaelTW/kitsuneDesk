const { createContext } = require('./embeddedPlayer');

async function launchExternalMpv(engine, payload, options) {
  const result = await engine.playEpisode(
    {
      ...payload,
      startPosition: options.startPosition,
      volume: options.settings.playerVolume
    },
    options.status.dependencies.mpv.path
  );
  const normalizedResult = {
    ...result,
    embedded: false,
    embeddedFallback: Boolean(options.embeddedFallback),
    embeddedFallbackReason: options.embeddedFallbackReason || null,
    playerMode: 'external'
  };
  return {
    result: normalizedResult,
    context: createContext(payload, {
      queue: options.queue,
      queueIndex: options.queueIndex,
      quality: payload?.quality || options.settings.defaultQuality || 'auto',
      source: normalizedResult.source,
      playerMode: 'external'
    })
  };
}

module.exports = { launchExternalMpv };
