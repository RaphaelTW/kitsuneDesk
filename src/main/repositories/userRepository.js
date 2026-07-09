class UserRepository {
  constructor(database) {
    this.database = database;
  }

  findByUsername(username) {
    return this.database.findUserByUsername(username);
  }

  findById(userId) {
    return this.database.findUserById(userId);
  }

  count() {
    return Number(this.database.get('SELECT COUNT(*) AS total FROM users')?.total ?? 0);
  }

  list() {
    return this.database.all(
      `SELECT id, username, name, role, must_change_password, active,
              profile_color, parental_level, created_at, updated_at
       FROM users
       ORDER BY active DESC, name COLLATE NOCASE ASC`
    );
  }

  create({ username, passwordHash, name, role, profileColor, parentalLevel }) {
    return this.database.run(
      `INSERT INTO users (
         username, password_hash, name, role, must_change_password,
         active, profile_color, parental_level
       ) VALUES (?, ?, ?, ?, 0, 1, ?, ?)`,
      [username, passwordHash, name, role, profileColor, parentalLevel]
    );
  }

  update(userId, { name, role, active, profileColor, parentalLevel }) {
    return this.database.run(
      `UPDATE users
       SET name = ?, role = ?, active = ?, profile_color = ?, parental_level = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, role, active ? 1 : 0, profileColor, parentalLevel, userId]
    );
  }

  updatePassword(userId, passwordHash, mustChangePassword = false) {
    return this.database.run(
      `UPDATE users
       SET password_hash = ?, must_change_password = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [passwordHash, mustChangePassword ? 1 : 0, userId]
    );
  }

  countActiveAdminsExcept(userId) {
    return Number(
      this.database.get(
        `SELECT COUNT(*) AS total
         FROM users
         WHERE role = 'ADMIN' AND active = 1 AND id <> ?`,
        [userId]
      )?.total ?? 0
    );
  }
}

module.exports = UserRepository;
