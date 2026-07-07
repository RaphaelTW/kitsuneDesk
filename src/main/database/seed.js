const bcrypt = require('bcryptjs');

const DEFAULT_ADMIN = Object.freeze({
  username: 'admin',
  password: 'admin123',
  name: 'Administrador',
  role: 'ADMIN'
});

/**
 * @param {import('better-sqlite3').Database} database
 */
function seedInitialData(database) {
  const userCount = database.prepare('SELECT COUNT(*) AS total FROM users').get().total;

  if (userCount > 0) {
    return;
  }

  const passwordHash = bcrypt.hashSync(DEFAULT_ADMIN.password, 12);
  const createAdmin = database.prepare(`
    INSERT INTO users (username, password_hash, name, role, must_change_password, active)
    VALUES (@username, @passwordHash, @name, @role, 1, 1)
  `);

  const createSettings = database.prepare(`
    INSERT INTO settings (user_id, default_language, default_quality, auto_play_next, player_volume, theme)
    VALUES (?, 'sub', 'auto', 0, 80, 'dark')
  `);

  const transaction = database.transaction(() => {
    const result = createAdmin.run({
      username: DEFAULT_ADMIN.username,
      passwordHash,
      name: DEFAULT_ADMIN.name,
      role: DEFAULT_ADMIN.role
    });

    createSettings.run(result.lastInsertRowid);
  });

  transaction();
}

module.exports = {
  DEFAULT_ADMIN,
  seedInitialData
};
