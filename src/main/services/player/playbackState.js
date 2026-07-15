const AppError = require('../../utils/AppError');
const { findEpisodeIndexInList } = require('./playbackQueue');

function snapshot(engine, context) {
  return { ...engine.getPlayerState(), context };
}

function queue(context) {
  if (!context) return { active: false, items: [], currentIndex: -1 };
  return {
    active: true,
    currentIndex: Number.isInteger(context.queueIndex) ? context.queueIndex : 0,
    items: Array.isArray(context.queue) ? context.queue : []
  };
}

function reorder(context, payload) {
  if (!context || !Array.isArray(context.queue) || context.queue.length === 0) {
    throw new AppError('PLAYBACK_QUEUE_UNAVAILABLE', 'Não existe fila ativa para reordenar.', {
      status: 409
    });
  }
  const fromIndex = Number(payload?.fromIndex);
  const toIndex = Number(payload?.toIndex);
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= context.queue.length ||
    toIndex >= context.queue.length
  ) {
    throw new AppError('PLAYBACK_QUEUE_INVALID', 'A posição informada para a fila é inválida.', {
      status: 400
    });
  }
  const reordered = [...context.queue];
  const [item] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, item);
  context.queue = reordered;
  context.episodes = reordered;
  context.queueIndex = findEpisodeIndexInList(reordered, context.episode);
  context.episodeIndex = context.queueIndex;
  return queue(context);
}

module.exports = { queue, reorder, snapshot };
