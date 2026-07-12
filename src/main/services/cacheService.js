const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { pathToFileURL } = require('url');

const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;
const ASSET_TTL_MS = Object.freeze({
  covers: 14 * 24 * 60 * 60 * 1000,
  avatars: 90 * 24 * 60 * 60 * 1000
});

class CacheService {
  constructor({ app, cacheRepository }) {
    this.app = app;
    this.cacheRepository = cacheRepository;
    this.root = path.join(app.getPath('userData'), 'cache');
    this.memory = new Map();
    fs.mkdirSync(this.root, { recursive: true });
    try {
      this.cacheRepository.prune();
      setTimeout(() => {
        try {
          this.pruneDiskAssets();
        } catch {
          // Limpeza de arquivos antigos roda em segundo plano e nunca bloqueia a abertura.
        }
      }, 1500).unref?.();
    } catch {
      // Cache antigo nunca impede a abertura do aplicativo.
    }
  }

  getJson(namespace, key, options) {
    return this.cacheRepository.get(namespace, key, options);
  }

  setJson(namespace, key, payload, options) {
    return this.cacheRepository.set(namespace, key, payload, options);
  }

  async cacheImage(url, kind = 'covers') {
    const source = String(url || '').trim();
    if (!source || source.startsWith('data:') || source.startsWith('file:')) {
      return { url: source, cached: Boolean(source), offline: false };
    }
    if (!/^https?:\/\//i.test(source)) {
      return { url: source, cached: false, offline: false };
    }

    const safeKind = ['covers', 'avatars'].includes(kind) ? kind : 'covers';
    const ttlMs = ASSET_TTL_MS[safeKind] || ASSET_TTL_MS.covers;
    const staleTtlMs = safeKind === 'avatars' ? ttlMs * 2 : ttlMs * 4;
    const cacheKey = crypto.createHash('sha256').update(source).digest('hex');
    const memoryKey = `${safeKind}:${cacheKey}`;
    if (this.memory.has(memoryKey)) return this.memory.get(memoryKey);

    const directory = path.join(this.root, safeKind);
    fs.mkdirSync(directory, { recursive: true });
    const dataPath = path.join(directory, `${cacheKey}.bin`);
    const metaPath = path.join(directory, `${cacheKey}.json`);

    const cached = this.readCachedAsset(dataPath, metaPath, source);
    if (cached && cached.fresh) {
      this.remember(memoryKey, cached.result);
      return cached.result;
    }

    try {
      const response = await downloadBuffer(source);
      fs.writeFileSync(dataPath, response.buffer);
      fs.writeFileSync(
        metaPath,
        JSON.stringify(
          {
            source,
            contentType: response.contentType,
            savedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + ttlMs).toISOString(),
            staleUntil: new Date(Date.now() + staleTtlMs).toISOString(),
            bytes: response.buffer.length
          },
          null,
          2
        ),
        'utf8'
      );
      const result = {
        url: toDataUrl(response.buffer, response.contentType),
        fileUrl: pathToFileURL(dataPath).href,
        cached: true,
        offline: false
      };
      this.remember(memoryKey, result);
      return result;
    } catch {
      if (cached) {
        const result = { ...cached.result, offline: true, stale: true };
        this.remember(memoryKey, result);
        return result;
      }
      return { url: source, cached: false, offline: true };
    }
  }

  readCachedAsset(dataPath, metaPath, source) {
    if (!fs.existsSync(dataPath) || !fs.existsSync(metaPath)) return null;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (meta.source !== source) return null;
      const buffer = fs.readFileSync(dataPath);
      const expiresAt = Date.parse(meta.expiresAt);
      return {
        fresh: Number.isFinite(expiresAt) && expiresAt > Date.now(),
        result: {
          url: toDataUrl(buffer, meta.contentType),
          fileUrl: pathToFileURL(dataPath).href,
          cached: true,
          offline: false
        }
      };
    } catch {
      return null;
    }
  }

  stats() {
    return {
      entries: this.cacheRepository.stats(),
      disk: ['covers', 'avatars'].map((kind) => ({
        kind,
        ...directoryStats(path.join(this.root, kind))
      }))
    };
  }

  clear() {
    this.memory.clear();
    const removed = [];
    for (const kind of ['covers', 'avatars']) {
      const directory = path.join(this.root, kind);
      if (!fs.existsSync(directory)) continue;
      fs.rmSync(directory, { recursive: true, force: true });
      removed.push(directory);
    }
    const database = this.cacheRepository.clear();
    return { cleared: true, removed, database };
  }

  async warmImages(urls = [], kind = 'covers') {
    const safeUrls = Array.isArray(urls) ? urls : [];
    const uniqueUrls = [
      ...new Set(safeUrls.map((url) => String(url || '').trim()).filter(Boolean))
    ];
    const selected = uniqueUrls.slice(0, 80);
    let cached = 0;
    let failed = 0;
    for (const url of selected) {
      try {
        const result = await this.cacheImage(url, kind);
        if (result.cached) cached += 1;
      } catch {
        failed += 1;
      }
    }
    return { warmed: true, total: selected.length, cached, failed };
  }

  pruneDiskAssets() {
    let removed = 0;
    for (const kind of ['covers', 'avatars']) {
      const directory = path.join(this.root, kind);
      if (!fs.existsSync(directory)) continue;
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        const metaPath = path.join(directory, entry.name);
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          const fallbackStaleUntil =
            Date.parse(meta.expiresAt) + (ASSET_TTL_MS[kind] || ASSET_TTL_MS.covers);
          const staleUntil = Date.parse(meta.staleUntil) || fallbackStaleUntil;
          if (!Number.isFinite(staleUntil) || staleUntil > Date.now()) continue;
          const dataPath = path.join(directory, entry.name.replace(/\.json$/, '.bin'));
          fs.rmSync(metaPath, { force: true });
          fs.rmSync(dataPath, { force: true });
          removed += 1;
        } catch {
          // Metadado quebrado nao deve atrasar a abertura; a limpeza fica para uma proxima rodada.
        }
      }
    }
    return { removed };
  }

  remember(key, value) {
    this.memory.set(key, value);
    if (this.memory.size <= 120) return;
    const firstKey = this.memory.keys().next().value;
    this.memory.delete(firstKey);
  }
}

function downloadBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 4) {
      reject(new Error('Muitos redirecionamentos.'));
      return;
    }
    const client = url.startsWith('https:') ? https : http;
    const request = client.get(
      url,
      {
        headers: {
          'User-Agent': 'KitsuneDesk/0.14.0',
          Accept: 'image/avif,image/webp,image/svg+xml,image/*,*/*;q=0.8'
        },
        timeout: 10_000
      },
      (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          resolve(downloadBuffer(new URL(response.headers.location, url).href, redirects + 1));
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_DOWNLOAD_BYTES) {
            request.destroy(new Error('Imagem excede o limite de cache.'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          resolve({
            buffer: Buffer.concat(chunks),
            contentType: normalizeContentType(response.headers['content-type'])
          });
        });
      }
    );
    request.on('timeout', () => request.destroy(new Error('Tempo limite excedido.')));
    request.on('error', reject);
  });
}

function normalizeContentType(value) {
  const type = String(value || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  return type.startsWith('image/') ? type : 'image/png';
}

function toDataUrl(buffer, contentType) {
  return `data:${normalizeContentType(contentType)};base64,${buffer.toString('base64')}`;
}

function directoryStats(directory) {
  if (!fs.existsSync(directory)) return { files: 0, bytes: 0 };
  const files = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile());
  return {
    files: files.length,
    bytes: files.reduce(
      (total, entry) => total + fs.statSync(path.join(directory, entry.name)).size,
      0
    )
  };
}

module.exports = CacheService;
module.exports.downloadBuffer = downloadBuffer;
module.exports.toDataUrl = toDataUrl;
