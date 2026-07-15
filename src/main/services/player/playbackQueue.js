function buildPlaybackQueue(episodes, episodeIndex, requestedQueue) {
  const baseQueue =
    Array.isArray(requestedQueue) && requestedQueue.length > 0 ? requestedQueue : episodes;
  if (!Array.isArray(baseQueue) || baseQueue.length === 0) return [];
  const queue = baseQueue.filter(Boolean);
  const currentEpisode = Array.isArray(episodes) ? episodes[episodeIndex] : null;
  const currentIndex = findEpisodeIndexInList(queue, currentEpisode);
  if (currentIndex <= 0) return queue;
  const [current] = queue.splice(currentIndex, 1);
  queue.splice(episodeIndex, 0, current);
  return queue;
}

function findEpisodeIndexInList(episodes, episode) {
  if (!Array.isArray(episodes) || episodes.length === 0) return 0;
  const index = episodes.findIndex((candidate) => sameEpisode(candidate, episode));
  return index >= 0 ? index : 0;
}

function sameEpisode(left, right) {
  if (!left || !right) return false;
  const leftNumber = String(left.num ?? left.number ?? '').trim();
  const rightNumber = String(right.num ?? right.number ?? '').trim();
  if (leftNumber && rightNumber && leftNumber === rightNumber) return true;
  const leftTitle = String(left.title || '').trim();
  const rightTitle = String(right.title || '').trim();
  return Boolean(leftTitle && rightTitle && leftTitle === rightTitle);
}

module.exports = { buildPlaybackQueue, findEpisodeIndexInList };
