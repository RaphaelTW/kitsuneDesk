const test = require('node:test');
const assert = require('node:assert/strict');
const AvatarService = require('../../src/main/services/avatarService');
const { localAvatarDataUrl, AVATAR_STYLES } = require('../../src/main/services/avatarService');

test('avatares possuem mais modelos e fallback local offline', async () => {
  assert.ok(AVATAR_STYLES.includes('lorelei'));
  assert.ok(AVATAR_STYLES.includes('open-peeps'));
  assert.ok(AVATAR_STYLES.includes('pixel-art'));
  assert.ok(AVATAR_STYLES.includes('big-ears-neutral'));
  assert.ok(AVATAR_STYLES.includes('avataaars-neutral'));
  assert.ok(AVATAR_STYLES.includes('pixel-art-neutral'));
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

test('avatar tenta DiceBear 10.x antes de voltar para 9.x', async () => {
  const requested = [];
  const service = new AvatarService({
    cacheService: {
      cacheImage: async (url) => {
        requested.push(url);
        return url.includes('/9.x/')
          ? { url: 'data:image/svg+xml;base64,ok', cached: true, offline: false }
          : { url, cached: false, offline: true };
      }
    }
  });

  const result = await service.get({ style: 'thumbs', seed: 'admin' });

  assert.equal(result.source, 'dicebear-9.x-cache');
  assert.equal(requested.length, 2);
  assert.match(requested[0], /\/10\.x\/thumbs\/svg/);
  assert.match(requested[1], /\/9\.x\/thumbs\/svg/);
});
