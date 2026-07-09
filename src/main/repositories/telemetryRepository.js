const MAX_METADATA_LENGTH = 6000;

class TelemetryRepository {
  constructor(database) {
    this.database = database;
  }

  enabledForUser(userId) {
    if (!userId) return false;
    const row = this.database.get(
      'SELECT local_telemetry_enabled FROM settings WHERE user_id = ?',
      [userId]
    );
    return Boolean(row?.local_telemetry_enabled);
  }

  record(userId, failure) {
    if (!this.enabledForUser(userId)) {
      return { recorded: false, reason: 'disabled' };
    }

    const result = this.database.run(
      `INSERT INTO failure_telemetry (user_id, scope, event, message, metadata)
       VALUES (?, ?, ?, ?, ?)`,
      [
        userId,
        normalizeText(failure?.scope, 'APP', 80),
        normalizeText(failure?.event, 'ERROR', 120),
        normalizeText(failure?.message, '', 1000),
        normalizeMetadata(failure?.metadata)
      ]
    );
    return { recorded: true, id: result.lastInsertRowid };
  }

  list(userId, filters = {}) {
    if (!userId) return { items: [], total: 0, page: 1, pageSize: 25 };
    if (typeof filters === 'number') filters = { pageSize: filters };
    const page = Math.max(1, Number(filters.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize || filters.limit || 25)));
    const offset = (page - 1) * pageSize;
    const scope = String(filters.scope || '').trim();
    const event = String(filters.event || '').trim();
    const query = String(filters.query || '').trim();
    const from = String(filters.from || '').trim();
    const to = String(filters.to || '').trim();
    const clauses = ['user_id = ?'];
    const params = [userId];
    if (scope) {
      clauses.push('scope = ?');
      params.push(scope);
    }
    if (event) {
      clauses.push('event = ?');
      params.push(event);
    }
    if (query) {
      clauses.push('(message LIKE ? OR metadata LIKE ?)');
      params.push(`%${query}%`, `%${query}%`);
    }
    if (from) {
      clauses.push('created_at >= ?');
      params.push(`${from} 00:00:00`);
    }
    if (to) {
      clauses.push('created_at <= ?');
      params.push(`${to} 23:59:59`);
    }
    const where = clauses.join(' AND ');
    const total = Number(
      this.database.get(`SELECT COUNT(*) AS total FROM failure_telemetry WHERE ${where}`, params)
        ?.total || 0
    );
    const items = this.database.all(
      `SELECT id, scope, event, message, metadata, created_at
       FROM failure_telemetry
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    return {
      items,
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      facets: this.facets(userId)
    };
  }

  facets(userId) {
    return {
      scopes: this.database
        .all(
          `SELECT scope AS value, COUNT(*) AS total FROM failure_telemetry
           WHERE user_id = ? GROUP BY scope ORDER BY total DESC`,
          [userId]
        )
        .map(normalizeFacet),
      events: this.database
        .all(
          `SELECT event AS value, COUNT(*) AS total FROM failure_telemetry
           WHERE user_id = ? GROUP BY event ORDER BY total DESC LIMIT 50`,
          [userId]
        )
        .map(normalizeFacet)
    };
  }

  remove(userId, ids) {
    const safeIds = [
      ...new Set((Array.isArray(ids) ? ids : [ids]).map(Number).filter(Number.isInteger))
    ].slice(0, 500);
    if (!userId || safeIds.length === 0) return { removed: 0 };
    const placeholders = safeIds.map(() => '?').join(',');
    const result = this.database.run(
      `DELETE FROM failure_telemetry WHERE user_id = ? AND id IN (${placeholders})`,
      [userId, ...safeIds]
    );
    return { removed: Number(result.changes || 0) };
  }

  export(userId, format = 'json', filters = {}) {
    const items = [];
    let page = 1;
    let pages = 1;
    do {
      const result = this.list(userId, { ...filters, page, pageSize: 100 });
      items.push(...result.items);
      pages = Math.min(result.pages, 50);
      page += 1;
    } while (page <= pages);
    if (format === 'csv') {
      const header = ['id', 'scope', 'event', 'message', 'metadata', 'created_at'];
      const rows = items.map((item) => header.map((key) => csvCell(item[key])).join(','));
      return { content: [header.join(','), ...rows].join('\r\n'), extension: 'csv' };
    }
    return { content: JSON.stringify(items, null, 2), extension: 'json' };
  }

  clear(userId) {
    if (!userId) return { cleared: false };
    const result = this.database.run('DELETE FROM failure_telemetry WHERE user_id = ?', [userId]);
    return { cleared: true, removed: Number(result.changes || 0) };
  }
}

function normalizeFacet(row) {
  return { value: row.value, total: Number(row.total || 0) };
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function normalizeText(value, fallback, maxLength) {
  const text = String(value ?? fallback ?? '').trim();
  return text.slice(0, maxLength);
}

function normalizeMetadata(metadata) {
  const safeMetadata = redact(metadata);
  return JSON.stringify(safeMetadata).slice(0, MAX_METADATA_LENGTH);
}

function redact(value) {
  if (Array.isArray(value)) return value.slice(0, 20).map(redact);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (/password|token|cookie|secret|hash/i.test(key)) {
        return [key, '[redacted]'];
      }
      return [key, redact(item)];
    })
  );
}

module.exports = TelemetryRepository;
