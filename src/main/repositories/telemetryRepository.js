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

  list(userId, limit = 20) {
    if (!userId) return [];
    return this.database.all(
      `SELECT id, scope, event, message, metadata, created_at
       FROM failure_telemetry
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, Math.min(100, Math.max(1, Number(limit) || 20))]
    );
  }

  clear(userId) {
    if (!userId) return { cleared: false };
    this.database.run('DELETE FROM failure_telemetry WHERE user_id = ?', [userId]);
    return { cleared: true };
  }
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
