class CacheRepository {
  constructor(database) {
    this.database = database;
  }

  get(namespace, cacheKey, { allowExpired = false } = {}) {
    const row = this.database.get(
      `SELECT namespace, cache_key, payload, expires_at, stale_until, created_at, updated_at
       FROM cache_entries
       WHERE namespace = ? AND cache_key = ?`,
      [namespace, cacheKey]
    );
    if (!row) return null;

    const now = Date.now();
    const expiresAt = Date.parse(row.expires_at);
    const staleUntil = Date.parse(row.stale_until || row.expires_at);
    const expired = !Number.isFinite(expiresAt) || expiresAt <= now;
    const stale = expired && Number.isFinite(staleUntil) && staleUntil > now;

    if (expired && !allowExpired) return null;

    this.database.run(
      `UPDATE cache_entries SET last_accessed_at = CURRENT_TIMESTAMP WHERE namespace = ? AND cache_key = ?`,
      [namespace, cacheKey]
    );

    return {
      namespace: row.namespace,
      key: row.cache_key,
      payload: safeJsonParse(row.payload),
      expired,
      stale,
      expiresAt: row.expires_at,
      staleUntil: row.stale_until,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  set(namespace, cacheKey, payload, { ttlMs, staleTtlMs = ttlMs * 4 } = {}) {
    const safeTtl = Math.max(60_000, Number(ttlMs) || 60_000);
    const safeStaleTtl = Math.max(safeTtl, Number(staleTtlMs) || safeTtl);
    const expiresAt = new Date(Date.now() + safeTtl).toISOString();
    const staleUntil = new Date(Date.now() + safeStaleTtl).toISOString();

    this.database.run(
      `INSERT INTO cache_entries (
         namespace, cache_key, payload, expires_at, stale_until, created_at, updated_at, last_accessed_at
       ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(namespace, cache_key) DO UPDATE SET
         payload = excluded.payload,
         expires_at = excluded.expires_at,
         stale_until = excluded.stale_until,
         updated_at = CURRENT_TIMESTAMP,
         last_accessed_at = CURRENT_TIMESTAMP`,
      [namespace, cacheKey, JSON.stringify(payload ?? null), expiresAt, staleUntil]
    );

    return { saved: true, expiresAt, staleUntil };
  }

  prune() {
    const result = this.database.run(
      `DELETE FROM cache_entries
       WHERE stale_until < ?`,
      [new Date().toISOString()]
    );
    return { removed: Number(result.changes || 0) };
  }

  clear(namespace = null) {
    const result = namespace
      ? this.database.run('DELETE FROM cache_entries WHERE namespace = ?', [namespace])
      : this.database.run('DELETE FROM cache_entries');
    return { cleared: true, removed: Number(result.changes || 0) };
  }

  stats() {
    const rows = this.database.all(
      `SELECT namespace, COUNT(*) AS total
       FROM cache_entries
       GROUP BY namespace
       ORDER BY namespace`
    );
    return rows.map((row) => ({ namespace: row.namespace, total: Number(row.total || 0) }));
  }
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

module.exports = CacheRepository;
