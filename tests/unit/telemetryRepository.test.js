const test = require('node:test');
const assert = require('node:assert/strict');
const TelemetryRepository = require('../../src/main/repositories/telemetryRepository');

test('métricas de abertura são opt-in e normalizam durações', async () => {
  let enabled = false;
  let inserted = null;
  const database = {
    get(sql) {
      if (sql.includes('startup_metrics_enabled'))
        return { startup_metrics_enabled: enabled ? 1 : 0 };
      if (sql.includes('COUNT(*) AS count')) {
        return {
          count: inserted ? 1 : 0,
          average_shell_ms: inserted?.[1] || 0,
          average_core_ms: inserted?.[2] || 0,
          fastest_core_ms: inserted?.[2] || 0,
          slowest_core_ms: inserted?.[2] || 0
        };
      }
      return null;
    },
    run(sql, params) {
      if (sql.includes('INSERT INTO startup_performance')) inserted = params;
      return { lastInsertRowid: 7 };
    },
    all(sql) {
      if (!sql.includes('FROM startup_performance') || !inserted) return [];
      return [
        {
          shell_ready_ms: inserted[1],
          core_ready_ms: inserted[2],
          snapshot_restored: inserted[3],
          startup_type: inserted[4],
          created_at: '2026-07-15 12:00:00'
        }
      ];
    }
  };
  const repository = new TelemetryRepository(database);

  assert.deepEqual(await repository.recordStartup(1, { shellReadyMs: 100, coreReadyMs: 400 }), {
    recorded: false,
    reason: 'disabled'
  });

  enabled = true;
  assert.deepEqual(
    await repository.recordStartup(1, {
      shellReadyMs: 125.6,
      coreReadyMs: 90,
      snapshotRestored: true
    }),
    { recorded: true, id: 7 }
  );
  assert.deepEqual(inserted, [1, 126, 126, 1, 'snapshot']);

  const summary = await repository.startupSummary(1);
  assert.equal(summary.enabled, true);
  assert.equal(summary.count, 1);
  assert.equal(summary.averageCoreMs, 126);
  assert.equal(summary.medianCoreMs, 126);
  assert.equal(summary.p95CoreMs, 126);
  assert.equal(summary.byType.find((item) => item.type === 'snapshot').count, 1);
  assert.equal(summary.recent[0].snapshotRestored, true);
});
