class SettingsRepository {
  /**
   * @param {import('better-sqlite3').Database} database
   */
  constructor(database) {
    this.database = database;
  }

  /**
   * @param {number} userId
   * @returns {object | undefined}
   */
  findByUserId(userId) {
    return this.database.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId);
  }

  /**
   * @param {number} userId
   */
  createDefaultForUser(userId) {
    this.database
      .prepare(
        `
        INSERT INTO settings (user_id, default_language, default_quality, auto_play_next, player_volume, theme)
        VALUES (?, 'sub', 'auto', 0, 80, 'dark')
      `
      )
      .run(userId);
  }
}

module.exports = SettingsRepository;
