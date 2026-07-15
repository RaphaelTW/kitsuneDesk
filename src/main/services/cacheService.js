const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { pathToFileURL } = require('url');

const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;
const MAX_CACHE_BYTES = Object.freeze({
  covers: 192 * 1024 * 1024,
  avatars: 64 * 1024 * 1024
});
const WARM_IMAGE_CONCURRENCY = 4;
const MAX_MEMORY_CACHE_BYTES = 16 * 1024 * 1024;
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
    this.memoryBytes = 0;
    this.ready = fs.promises
      .mkdir(this.root, { recursive: true })
      .then(() => this.cacheRepository.prune())
      .catch(() => ({ removed: 0 }));
    void this.ready.then(() => {
      setTimeout(() => {
        void this.pruneDiskAssets().catch(() => {
          // Limpeza de arquivos antigos roda em segundo plano e nunca bloqueia a abertura.
        });
      }, 1500).unref?.();
    });
  }

  async getJson(namespace, key, options) {
    await this.ready;
    return this.cacheRepository.get(namespace, key, options);
  }

  async setJson(namespace, key, payload, options) {
    await this.ready;
    return this.cacheRepository.set(namespace, key, payload, options);
  }

  async cacheImage(url, kind = 'covers') {
    await this.ready;
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
    if (this.memory.has(memoryKey)) return this.memory.get(memoryKey).value;

    const directory = path.join(this.root, safeKind);
    await fs.promises.mkdir(directory, { recursive: true });
    const dataPath = path.join(directory, `${cacheKey}.bin`);
    const metaPath = path.join(directory, `${cacheKey}.json`);

    const cached = await this.readCachedAsset(dataPath, metaPath, source);
    if (cached && cached.fresh) {
      this.remember(memoryKey, cached.result, cached.bytes);
      return cached.result;
    }

    try {
      const response = await downloadBuffer(source);
      await fs.promises.writeFile(dataPath, response.buffer);
      await fs.promises.writeFile(
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
      const fileUrl = pathToFileURL(dataPath).href;
      const result = {
        url: fileUrl,
        fileUrl,
        cached: true,
        offline: false
      };
      this.remember(memoryKey, result, response.buffer.length);
      return result;
    } catch {
      if (cached) {
        const result = { ...cached.result, offline: true, stale: true };
        this.remember(memoryKey, result, cached.bytes);
        return result;
      }
      return { url: source, cached: false, offline: true };
    }
  }

  async readCachedAsset(dataPath, metaPath, source) {
    try {
      const [metaText, buffer] = await Promise.all([
        fs.promises.readFile(metaPath, 'utf8'),
        fs.promises.readFile(dataPath)
      ]);
      const meta = JSON.parse(metaText);
      if (meta.source !== source) return null;
      const expiresAt = Date.parse(meta.expiresAt);
      return {
        fresh: Number.isFinite(expiresAt) && expiresAt > Date.now(),
        result: {
          url: pathToFileURL(dataPath).href,
          fileUrl: pathToFileURL(dataPath).href,
          cached: true,
          offline: false
        },
        bytes: Number(meta.bytes || buffer.length)
      };
    } catch {
      return null;
    }
  }

  async stats() {
    await this.ready;
    return {
      entries: await this.cacheRepository.stats(),
      disk: await Promise.all(
        ['covers', 'avatars'].map(async (kind) => ({
          kind,
          ...(await directoryStats(path.join(this.root, kind)))
        }))
      )
    };
  }

  async clear() {
    await this.ready;
    this.memory.clear();
    this.memoryBytes = 0;
    const removed = [];
    for (const kind of ['covers', 'avatars']) {
      const directory = path.join(this.root, kind);
      await fs.promises.rm(directory, { recursive: true, force: true });
      removed.push(directory);
    }
    const database = await this.cacheRepository.clear();
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
    let cursor = 0;
    const worker = async () => {
      while (cursor < selected.length) {
        const url = selected[cursor++];
        try {
          const result = await this.cacheImage(url, kind);
          if (result.cached) cached += 1;
        } catch {
          failed += 1;
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(WARM_IMAGE_CONCURRENCY, selected.length) }, () => worker())
    );
    return { warmed: true, total: selected.length, cached, failed };
  }

  async pruneDiskAssets() {
    let removed = 0;
    for (const kind of ['covers', 'avatars']) {
      const directory = path.join(this.root, kind);
      let entries;
      try {
        entries = await fs.promises.readdir(directory, { withFileTypes: true });
      } catch {
        continue;
      }
      const retained = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        const metaPath = path.join(directory, entry.name);
        try {
          const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf8'));
          const fallbackStaleUntil =
            Date.parse(meta.expiresAt) + (ASSET_TTL_MS[kind] || ASSET_TTL_MS.covers);
          const staleUntil = Date.parse(meta.staleUntil) || fallbackStaleUntil;
          const dataPath = path.join(directory, entry.name.replace(/\.json$/, '.bin'));
          if (Number.isFinite(staleUntil) && staleUntil <= Date.now()) {
            await Promise.all([
              fs.promises.rm(metaPath, { force: true }),
              fs.promises.rm(dataPath, { force: true })
            ]);
            removed += 1;
          } else {
            retained.push({
              metaPath,
              dataPath,
              bytes: Number(meta.bytes || 0),
              savedAt: Date.parse(meta.savedAt) || 0
            });
          }
        } catch {
          // Metadado quebrado nao deve atrasar a abertura; a limpeza fica para uma proxima rodada.
        }
      }
      let totalBytes = retained.reduce((total, item) => total + item.bytes, 0);
      for (const item of retained.sort((a, b) => a.savedAt - b.savedAt)) {
        if (totalBytes <= MAX_CACHE_BYTES[kind]) break;
        await Promise.all([
          fs.promises.rm(item.metaPath, { force: true }),
          fs.promises.rm(item.dataPath, { force: true })
        ]);
        totalBytes -= item.bytes;
        removed += 1;
      }
    }
    return { removed };
  }

  remember(key, value, bytes = 0) {
    const previous = this.memory.get(key);
    if (previous) this.memoryBytes -= previous.bytes;
    const safeBytes = Math.max(0, Number(bytes) || 0);
    this.memory.set(key, { value, bytes: safeBytes });
    this.memoryBytes += safeBytes;
    while (this.memoryBytes > MAX_MEMORY_CACHE_BYTES && this.memory.size > 1) {
      const firstKey = this.memory.keys().next().value;
      const removed = this.memory.get(firstKey);
      this.memory.delete(firstKey);
      this.memoryBytes -= removed?.bytes || 0;
    }
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
          'User-Agent': 'KitsuneDesk/0.11.0',
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

async function directoryStats(directory) {
  let files;
  try {
    files = (await fs.promises.readdir(directory, { withFileTypes: true })).filter((entry) =>
      entry.isFile()
    );
  } catch {
    return { files: 0, bytes: 0 };
  }
  const sizes = await Promise.all(
    files.map((entry) => fs.promises.stat(path.join(directory, entry.name)))
  );
  return {
    files: files.length,
    bytes: sizes.reduce((total, stat) => total + stat.size, 0)
  };
}

module.exports = CacheService;
module.exports.downloadBuffer = downloadBuffer;
