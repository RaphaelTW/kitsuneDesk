const MAX_METADATA_LENGTH = 6000;

class TelemetryRepository {
  constructor(database) {
    this.database = database;
  }

  async enabledForUser(userId) {
    if (!userId) return false;
    const row = await this.database.get(
      'SELECT local_telemetry_enabled FROM settings WHERE user_id = ?',
      [userId]
    );
    return Boolean(row?.local_telemetry_enabled);
  }

  async startupMetricsEnabledForUser(userId) {
    if (!userId) return false;
    const row = await this.database.get(
      'SELECT startup_metrics_enabled FROM settings WHERE user_id = ?',
      [userId]
    );
    return Boolean(row?.startup_metrics_enabled);
  }

  async recordStartup(userId, metrics) {
    if (!(await this.startupMetricsEnabledForUser(userId))) {
      return { recorded: false, reason: 'disabled' };
    }
    const shellReadyMs = normalizeDuration(metrics?.shellReadyMs);
    const coreReadyMs = Math.max(shellReadyMs, normalizeDuration(metrics?.coreReadyMs));
    const startupType = normalizeStartupType(metrics?.startupType, metrics?.snapshotRestored);
    const result = await this.database.run(
      `INSERT INTO startup_performance (
         user_id, shell_ready_ms, core_ready_ms, snapshot_restored, startup_type
       ) VALUES (?, ?, ?, ?, ?)`,
      [userId, shellReadyMs, coreReadyMs, metrics?.snapshotRestored ? 1 : 0, startupType]
    );
    await this.pruneStartup(userId);
    return { recorded: true, id: result.lastInsertRowid };
  }

  async startupSummary(userId) {
    const enabled = await this.startupMetricsEnabledForUser(userId);
    if (!userId) return { enabled, count: 0, recent: [] };
    const aggregate = await this.database.get(
      `SELECT COUNT(*) AS count,
              ROUND(AVG(shell_ready_ms)) AS average_shell_ms,
              ROUND(AVG(core_ready_ms)) AS average_core_ms,
              MIN(core_ready_ms) AS fastest_core_ms,
              MAX(core_ready_ms) AS slowest_core_ms
       FROM startup_performance WHERE user_id = ?`,
      [userId]
    );
    const samples = await this.database.all(
      `SELECT shell_ready_ms, core_ready_ms, snapshot_restored, startup_type, created_at
       FROM startup_performance WHERE user_id = ?
       ORDER BY created_at DESC LIMIT 2000`,
      [userId]
    );
    const normalizedSamples = samples.map(normalizeStartupSample);
    const shellValues = normalizedSamples.map((item) => item.shellReadyMs);
    const coreValues = normalizedSamples.map((item) => item.coreReadyMs);
    return {
      enabled,
      count: Number(aggregate?.count || 0),
      averageShellMs: Number(aggregate?.average_shell_ms || 0),
      averageCoreMs: Number(aggregate?.average_core_ms || 0),
      fastestCoreMs: Number(aggregate?.fastest_core_ms || 0),
      slowestCoreMs: Number(aggregate?.slowest_core_ms || 0),
      medianShellMs: percentile(shellValues, 50),
      medianCoreMs: percentile(coreValues, 50),
      p95ShellMs: percentile(shellValues, 95),
      p95CoreMs: percentile(coreValues, 95),
      retentionDays: await this.startupRetentionDays(userId),
      byType: summarizeByType(normalizedSamples),
      series: summarizeSeries(normalizedSamples),
      recent: normalizedSamples.slice(0, 10)
    };
  }

  async startupRetentionDays(userId) {
    const row = await this.database.get(
      'SELECT startup_metrics_retention_days FROM settings WHERE user_id = ?',
      [userId]
    );
    const days = Number(row?.startup_metrics_retention_days);
    return [0, 7, 30, 90].includes(days) ? days : 30;
  }

  async pruneStartup(userId) {
    const retentionDays = await this.startupRetentionDays(userId);
    if (!userId || retentionDays === 0) return { removed: 0, retentionDays };
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const result = await this.database.run(
      'DELETE FROM startup_performance WHERE user_id = ? AND created_at < ?',
      [userId, cutoff]
    );
    return { removed: Number(result.changes || 0), retentionDays };
  }

  async record(userId, failure) {
    if (!(await this.enabledForUser(userId))) {
      return { recorded: false, reason: 'disabled' };
    }

    const result = await this.database.run(
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

  async list(userId, filters = {}) {
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
    const totalRow = await this.database.get(
      `SELECT COUNT(*) AS total FROM failure_telemetry WHERE ${where}`,
      params
    );
    const total = Number(totalRow?.total || 0);
    const items = await this.database.all(
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
      facets: await this.facets(userId)
    };
  }

  async facets(userId) {
    const [scopes, events] = await Promise.all([
      this.database.all(
        `SELECT scope AS value, COUNT(*) AS total FROM failure_telemetry
         WHERE user_id = ? GROUP BY scope ORDER BY total DESC`,
        [userId]
      ),
      this.database.all(
        `SELECT event AS value, COUNT(*) AS total FROM failure_telemetry
         WHERE user_id = ? GROUP BY event ORDER BY total DESC LIMIT 50`,
        [userId]
      )
    ]);
    return {
      scopes: scopes.map(normalizeFacet),
      events: events.map(normalizeFacet)
    };
  }

  async remove(userId, ids) {
    const safeIds = [
      ...new Set((Array.isArray(ids) ? ids : [ids]).map(Number).filter(Number.isInteger))
    ].slice(0, 500);
    if (!userId || safeIds.length === 0) return { removed: 0 };
    const placeholders = safeIds.map(() => '?').join(',');
    const result = await this.database.run(
      `DELETE FROM failure_telemetry WHERE user_id = ? AND id IN (${placeholders})`,
      [userId, ...safeIds]
    );
    return { removed: Number(result.changes || 0) };
  }

  async export(userId, format = 'json', filters = {}) {
    const items = [];
    let page = 1;
    let pages = 1;
    do {
      const result = await this.list(userId, { ...filters, page, pageSize: 100 });
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

  async clear(userId) {
    if (!userId) return { cleared: false };
    const failures = await this.database.run('DELETE FROM failure_telemetry WHERE user_id = ?', [
      userId
    ]);
    const startup = await this.database.run('DELETE FROM startup_performance WHERE user_id = ?', [
      userId
    ]);
    return {
      cleared: true,
      removed: Number(failures.changes || 0) + Number(startup.changes || 0),
      failuresRemoved: Number(failures.changes || 0),
      startupRemoved: Number(startup.changes || 0)
    };
  }
}

function normalizeStartupType(value, snapshotRestored = false) {
  if (snapshotRestored) return 'snapshot';
  return ['cold', 'warm'].includes(value) ? value : 'cold';
}

function normalizeStartupSample(item) {
  return {
    shellReadyMs: Number(item.shell_ready_ms || 0),
    coreReadyMs: Number(item.core_ready_ms || 0),
    snapshotRestored: Boolean(item.snapshot_restored),
    startupType: normalizeStartupType(item.startup_type, item.snapshot_restored),
    createdAt: item.created_at
  };
}

function percentile(values, target) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((target / 100) * sorted.length) - 1);
  return Math.round(sorted[Math.max(0, index)]);
}

function summarizeByType(samples) {
  return ['cold', 'warm', 'snapshot'].map((type) => {
    const selected = samples.filter((item) => item.startupType === type);
    const coreValues = selected.map((item) => item.coreReadyMs);
    return {
      type,
      count: selected.length,
      medianCoreMs: percentile(coreValues, 50),
      p95CoreMs: percentile(coreValues, 95)
    };
  });
}

function summarizeSeries(samples) {
  const points = new Map();
  for (const item of samples) {
    const day = String(item.createdAt || '').slice(0, 10);
    if (!day) continue;
    const key = `${day}:${item.startupType}`;
    const point = points.get(key) || { day, type: item.startupType, values: [] };
    point.values.push(item.coreReadyMs);
    points.set(key, point);
  }
  return [...points.values()]
    .map((point) => ({
      day: point.day,
      type: point.type,
      medianCoreMs: percentile(point.values, 50),
      p95CoreMs: percentile(point.values, 95),
      count: point.values.length
    }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.type.localeCompare(b.type))
    .slice(-90);
}

function normalizeFacet(row) {
  return { value: row.value, total: Number(row.total || 0) };
}

function normalizeDuration(value) {
  const duration = Math.round(Number(value));
  if (!Number.isFinite(duration)) return 0;
  return Math.min(10 * 60 * 1000, Math.max(0, duration));
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
