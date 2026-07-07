let currentSession = null;

class SessionRepository {
  /**
   * @param {object} user
   */
  create(user) {
    currentSession = {
      user,
      createdAt: new Date().toISOString()
    };

    return currentSession;
  }

  getCurrent() {
    return currentSession;
  }

  clear() {
    currentSession = null;
  }
}

module.exports = SessionRepository;
