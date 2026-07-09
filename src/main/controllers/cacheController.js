class CacheController {
  constructor({ cacheService, avatarService }) {
    this.cacheService = cacheService;
    this.avatarService = avatarService;
  }

  image(payload) {
    return this.cacheService.cacheImage(payload?.url, payload?.kind);
  }

  stats() {
    return this.cacheService.stats();
  }

  clear() {
    return this.cacheService.clear();
  }

  warmImages(payload) {
    return this.cacheService.warmImages(payload?.urls, payload?.kind);
  }

  avatar(payload) {
    return this.avatarService.get(payload);
  }

  avatarStyles() {
    return this.avatarService.styles();
  }
}

module.exports = CacheController;
