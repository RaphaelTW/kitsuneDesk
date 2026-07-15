const SEARCH_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const EPISODE_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

class EpisodeResolver {
  constructor({ engine, cacheService = null }) {
    this.engine = engine;
    this.cacheService = cacheService;
  }

  search(payload) {
    return this.withCache('anime-search', payload, SEARCH_CACHE_TTL_MS, () =>
      this.engine.search(payload)
    );
  }

  episodes(payload) {
    return this.withCache('anime-episodes', payload, EPISODE_CACHE_TTL_MS, () =>
      this.engine.episodes(payload)
    );
  }

  resolveStream(payload) {
    return this.engine.resolveStream(payload);
  }

  async withCache(namespace, payload, ttlMs, loader) {
    const key = stableCacheKey(payload);
    const fresh = await this.cacheService?.getJson(namespace, key);
    if (fresh) return markCached(fresh.payload, fresh);
    try {
      const result = await loader();
      await this.cacheService?.setJson(namespace, key, result, {
        ttlMs,
        staleTtlMs: ttlMs * (namespace === 'anime-search' ? 8 : 12)
      });
      return result;
    } catch (error) {
      const stale = await this.cacheService?.getJson(namespace, key, { allowExpired: true });
      if (stale?.stale) return markCached(stale.payload, stale, true);
      throw error;
    }
  }
}

function stableCacheKey(payload) {
  return JSON.stringify(sortObject(payload && typeof payload === 'object' ? payload : {}));
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObject(value[key])])
  );
}

function markCached(value, entry, offline = false) {
  if (Array.isArray(value)) {
    Object.defineProperties(value, {
      cacheInfo: {
        value: { cached: true, offline, expiresAt: entry.expiresAt },
        enumerable: false
      }
    });
  }
  return value;
}

module.exports = EpisodeResolver;
