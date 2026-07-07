const SESSION_KEY = 'kitsunedesk.session';

/**
 * @param {object} session
 */
export function saveSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * @returns {object | null}
 */
export function getSession() {
  const rawSession = sessionStorage.getItem(SESSION_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession);
  } catch {
    clearSession();
    return null;
  }
}

/**
 * @param {{allowPasswordChange?: boolean}} [options]
 * @returns {object | null}
 */
export function requireSession(options = {}) {
  const session = getSession();

  if (!session?.user) {
    window.location.href = './login.html';
    return null;
  }

  if (session.user.mustChangePassword && !options.allowPasswordChange) {
    window.location.href = './change-password.html';
    return null;
  }

  return session;
}

export function redirectAuthenticatedUser() {
  const session = getSession();

  if (!session?.user) {
    return;
  }

  window.location.href = session.user.mustChangePassword ? './change-password.html' : './home.html';
}
