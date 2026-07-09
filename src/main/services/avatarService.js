const crypto = require('crypto');

const AVATAR_STYLES = Object.freeze([
  'thumbs',
  'initials',
  'identicon',
  'shapes',
  'rings',
  'adventurer',
  'avataaars',
  'bottts',
  'fun-emoji',
  'glass',
  'lorelei',
  'micah',
  'notionists',
  'open-peeps',
  'personas',
  'pixel-art'
]);

class AvatarService {
  constructor({ cacheService }) {
    this.cacheService = cacheService;
  }

  styles() {
    return AVATAR_STYLES.map((id) => ({ id, name: styleName(id) }));
  }

  async get(payload) {
    const style = AVATAR_STYLES.includes(payload?.style) ? payload.style : 'thumbs';
    const seed =
      String(payload?.seed || 'user')
        .trim()
        .slice(0, 80) || 'user';
    const remoteUrl = `https://api.dicebear.com/10.x/${encodeURIComponent(style)}/svg?seed=${encodeURIComponent(seed)}&backgroundType=gradientLinear`;
    const cached = await this.cacheService.cacheImage(remoteUrl, 'avatars');
    if (cached.cached) return { ...cached, style, seed, source: 'dicebear-cache' };
    return {
      url: localAvatarDataUrl(style, seed),
      cached: true,
      offline: true,
      style,
      seed,
      source: 'local-fallback'
    };
  }
}

function localAvatarDataUrl(style, seed) {
  const digest = crypto.createHash('sha256').update(`${style}:${seed}`).digest();
  const hueA = digest[0] % 360;
  const hueB = (hueA + 70 + digest[1]) % 360;
  const initials =
    seed
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'K';
  const cells = Array.from({ length: 25 }, (_, index) => {
    const active = digest[index % digest.length] % 3 !== 0;
    const x = (index % 5) * 18 + 5;
    const y = Math.floor(index / 5) * 18 + 5;
    return active
      ? `<rect x="${x}" y="${y}" width="14" height="14" rx="4" fill="hsla(${hueB},85%,72%,.72)"/>`
      : '';
  }).join('');
  const content =
    style === 'initials'
      ? `<text x="50" y="59" text-anchor="middle" font-family="Segoe UI,Arial" font-size="34" font-weight="800" fill="white">${escapeXml(initials)}</text>`
      : cells;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="hsl(${hueA},78%,52%)"/><stop offset="1" stop-color="hsl(${hueB},76%,45%)"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="url(#g)"/>${content}<circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,.34)" stroke-width="2"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function styleName(id) {
  return id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function escapeXml(value) {
  return String(value).replace(
    /[<>&"']/g,
    (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]
  );
}

module.exports = AvatarService;
module.exports.AVATAR_STYLES = AVATAR_STYLES;
module.exports.localAvatarDataUrl = localAvatarDataUrl;
