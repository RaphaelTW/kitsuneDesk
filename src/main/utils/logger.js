const sensitiveKeys = new Set(['password', 'password_hash', 'hash', 'token', 'cookie']);

/**
 * @param {string} level
 * @param {string} event
 * @param {string} message
 * @param {Record<string, unknown>} [metadata]
 */
function log(level, event, message, metadata = {}) {
  const payload = {
    at: new Date().toISOString(),
    level,
    event,
    message,
    metadata: sanitizeMetadata(metadata)
  };

  if (level === 'ERROR') {
    console.error(JSON.stringify(payload));
    return;
  }

  console.log(JSON.stringify(payload));
}

/**
 * @param {Record<string, unknown>} metadata
 * @returns {Record<string, unknown>}
 */
function sanitizeMetadata(metadata) {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      sensitiveKeys.has(key.toLowerCase()) ? '[redacted]' : value
    ])
  );
}

module.exports = {
  debug: (event, message, metadata) => log('DEBUG', event, message, metadata),
  error: (event, message, metadata) => log('ERROR', event, message, metadata),
  info: (event, message, metadata) => log('INFO', event, message, metadata),
  warning: (event, message, metadata) => log('WARNING', event, message, metadata)
};
