const fs = require('fs');
const Database = require('better-sqlite3');

const { encryptPayload, decryptPayload } = require('../src/main/services/backupService');

const [mode, databasePath, backupPath] = process.argv.slice(2);
if (!['seed', 'partial', 'verify', 'clean'].includes(mode) || !databasePath) {
  throw new Error(
    'Uso: node scripts/installed-update-fixture.js <seed|partial|verify|clean> <banco> [backup]'
  );
}
if (!fs.existsSync(databasePath))
  throw new Error(`Banco instalado não encontrado: ${databasePath}`);

const database = new Database(databasePath);
try {
  const admin = database.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  if (!admin) throw new Error('Administrador da fixture não encontrado.');
  if (mode === 'seed') {
    database
      .prepare(
        `UPDATE settings SET theme = 'dracula', default_provider = 'goanime-gui'
         WHERE user_id = ?`
      )
      .run(admin.id);
    database
      .prepare(
        `INSERT OR IGNORE INTO favorites (
           user_id, provider_id, anime_id, anime_title, anime_payload
         ) VALUES (?, 'goanime-gui', 'stable-fixture', 'Fixture de atualização', '{}')`
      )
      .run(admin.id);
    if (backupPath) {
      fs.mkdirSync(require('path').dirname(backupPath), { recursive: true });
      const encrypted = encryptPayload(
        {
          format: 'kitsunedesk-profiles',
          version: 1,
          users: [{ username: 'admin', fixture: 'preserve-v0.15.0' }]
        },
        'KitsuneDesk-E2E-Backup!'
      );
      fs.writeFileSync(backupPath, JSON.stringify(encrypted, null, 2), 'utf8');
    }
    console.log('Fixture de preferências e biblioteca criada.');
  } else if (mode === 'partial') {
    database.exec(`
      CREATE TABLE IF NOT EXISTS startup_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        shell_ready_ms INTEGER NOT NULL,
        core_ready_ms INTEGER NOT NULL,
        snapshot_restored INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT OR IGNORE INTO schema_migrations (id, name)
      VALUES (10, 'v0140-startup-performance-metrics');
    `);
    console.log('Banco parcialmente migrado criado para reparo da v0.15.0.');
  } else {
    const retention = database
      .prepare("SELECT name FROM pragma_table_info('settings') WHERE name = ?")
      .get('startup_metrics_retention_days');
    if (!retention) throw new Error('Migração v0.15.0 não foi aplicada ao banco antigo.');
    if (mode === 'clean') {
      console.log('Instalação limpa da v0.15.0 inicializou administrador e schema atual.');
    } else {
      const settings = database
        .prepare('SELECT theme, default_provider FROM settings WHERE user_id = ?')
        .get(admin.id);
      const favorite = database
        .prepare("SELECT id FROM favorites WHERE user_id = ? AND anime_id = 'stable-fixture'")
        .get(admin.id);
      if (settings?.theme !== 'dracula' || settings?.default_provider !== 'goanime-gui') {
        throw new Error('Preferências não foram preservadas no upgrade.');
      }
      if (!favorite) throw new Error('Biblioteca não foi preservada no upgrade.');
      const startupType = database
        .prepare("SELECT name FROM pragma_table_info('startup_performance') WHERE name = ?")
        .get('startup_type');
      if (!startupType) throw new Error('Banco parcialmente migrado não foi reparado.');
      if (backupPath) {
        if (!fs.existsSync(backupPath)) throw new Error('Backup real não foi preservado.');
        const container = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
        const backup = decryptPayload(container, 'KitsuneDesk-E2E-Backup!');
        if (backup?.users?.[0]?.fixture !== 'preserve-v0.15.0') {
          throw new Error('Conteúdo do backup preservado é inválido.');
        }
      }
      console.log('Banco, biblioteca, preferências e migração v0.15.0 preservados.');
    }
  }
} finally {
  database.close();
}
