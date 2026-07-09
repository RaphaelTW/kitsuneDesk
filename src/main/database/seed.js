const bcrypt = require('bcryptjs');

const DEFAULT_ADMIN = Object.freeze({
  username: 'admin',
  password: 'admin123',
  name: 'Administrador',
  role: 'ADMIN',
  profileColor: '#6f5cff',
  parentalLevel: 'ADULT',
  avatarSeed: 'admin',
  avatarStyle: 'thumbs'
});

/**
 * Cria o primeiro administrador local com senha temporaria. O login forca a troca
 * imediata para uma senha forte antes de liberar a aplicacao.
 *
 * @param {import('better-sqlite3').Database} database
 */
function seedInitialData(database) {
  const totalUsers = Number(
    database.prepare('SELECT COUNT(*) AS total FROM users').get()?.total ?? 0
  );

  if (totalUsers > 0) {
    return;
  }

  const passwordHash = bcrypt.hashSync(DEFAULT_ADMIN.password, 12);
  const result = database
    .prepare(
      `INSERT INTO users (
         username, password_hash, name, role, must_change_password,
         active, profile_color, parental_level, avatar_seed, avatar_style
       ) VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?, ?)`
    )
    .run(
      DEFAULT_ADMIN.username,
      passwordHash,
      DEFAULT_ADMIN.name,
      DEFAULT_ADMIN.role,
      DEFAULT_ADMIN.profileColor,
      DEFAULT_ADMIN.parentalLevel,
      DEFAULT_ADMIN.avatarSeed,
      DEFAULT_ADMIN.avatarStyle
    );

  database
    .prepare(
      `INSERT OR IGNORE INTO settings (
         user_id, default_language, default_quality, auto_play_next,
         player_volume, theme, default_provider, downloads_path,
         audio_preference, parental_control_enabled, max_content_rating,
         remember_position, check_updates, player_mode, local_telemetry_enabled
       ) VALUES (?, 'sub', 'auto', 0, 80, 'dark', 'goanime-gui', '',
                 'sub', 0, '18', 1, 1, 'external', 0)`
    )
    .run(Number(result.lastInsertRowid));
}

module.exports = {
  DEFAULT_ADMIN,
  seedInitialData
};
