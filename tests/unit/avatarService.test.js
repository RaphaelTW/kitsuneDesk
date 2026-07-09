const test = require('node:test');
const assert = require('node:assert/strict');
const AvatarService = require('../../src/main/services/avatarService');
const { localAvatarDataUrl, AVATAR_STYLES } = require('../../src/main/services/avatarService');

test('avatares possuem mais modelos e fallback local offline', async () => {
  assert.ok(AVATAR_STYLES.includes('lorelei'));
  assert.ok(AVATAR_STYLES.includes('open-peeps'));
  assert.ok(AVATAR_STYLES.includes('pixel-art'));
  const service = new AvatarService({
    cacheService: {
      cacheImage: async () => ({ url: '', cached: false, offline: true })
    }
  });
  const result = await service.get({ style: 'pixel-art', seed: 'Raphael' });
  assert.equal(result.offline, true);
  assert.match(result.url, /^data:image\/svg\+xml;base64,/);
  assert.equal(localAvatarDataUrl('initials', 'Raphael').startsWith('data:image/svg+xml'), true);
});
