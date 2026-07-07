class UserRepository {
  /**
   * @param {import('better-sqlite3').Database} database
   */
  constructor(database) {
    this.database = database;
  }

  /**
   * @param {string} username
   * @returns {object | undefined}
   */
  findByUsername(username) {
    return this.database.findUserByUsername(username);
  }

  /**
   * @param {number} userId
   * @returns {object | undefined}
   */
  findById(userId) {
    return this.database.findUserById(userId);
  }

  /**
   * @param {number} userId
   * @param {string} passwordHash
   */
  updatePassword(userId, passwordHash) {
    this.database.updateUserPassword(userId, passwordHash);
  }
}

module.exports = UserRepository;
