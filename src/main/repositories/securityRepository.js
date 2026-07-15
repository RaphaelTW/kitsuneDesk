class SecurityRepository {
  constructor(database) {
    this.database = database;
  }

  find(username) {
    return this.database.get('SELECT * FROM login_security WHERE username = ?', [username]);
  }

  clear(username) {
    return this.database.run('DELETE FROM login_security WHERE username = ?', [username]);
  }

  registerFailure(username, failedAttempts, lockedUntil) {
    return this.database.run(
      `INSERT INTO login_security (username, failed_attempts, locked_until, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(username) DO UPDATE SET
         failed_attempts = excluded.failed_attempts,
         locked_until = excluded.locked_until,
         updated_at = CURRENT_TIMESTAMP`,
      [username, failedAttempts, lockedUntil]
    );
  }
}

module.exports = SecurityRepository;
