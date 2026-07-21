let currentSession = null;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

class SessionRepository {
  /**
   * @param {object} user
   */
  create(user) {
    currentSession = {
      user,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
    };

    return currentSession;
  }

  getCurrent() {
    if (currentSession && Date.parse(currentSession.expiresAt) <= Date.now()) {
      currentSession = null;
    }
    return currentSession;
  }

  clear() {
    currentSession = null;
  }
}

module.exports = SessionRepository;
