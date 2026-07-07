const bcrypt = require('bcryptjs');
const AppError = require('../utils/AppError');
const { validateChangePasswordPayload, validateLoginPayload } = require('../utils/validator');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 5 * 60 * 1000;

class AuthService {
  /**
   * @param {object} dependencies
   * @param {import('../repositories/userRepository')} dependencies.userRepository
   * @param {import('../repositories/sessionRepository')} dependencies.sessionRepository
   */
  constructor({ userRepository, sessionRepository }) {
    this.userRepository = userRepository;
    this.sessionRepository = sessionRepository;
    this.failedAttempts = new Map();
  }

  /**
   * @param {unknown} payload
   * @returns {Promise<object>}
   */
  async login(payload) {
    const credentials = validateLoginPayload(payload);
    this.assertNotLocked(credentials.username);

    const user = this.userRepository.findByUsername(credentials.username);

    if (!user || !user.active) {
      this.registerFailedAttempt(credentials.username);
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'Usuario ou senha invalidos.', {
        status: 401
      });
    }

    const passwordMatches = await bcrypt.compare(credentials.password, user.password_hash);

    if (!passwordMatches) {
      this.registerFailedAttempt(credentials.username);
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'Usuario ou senha invalidos.', {
        status: 401
      });
    }

    this.failedAttempts.delete(credentials.username);
    const safeUser = toSafeUser(user);
    this.sessionRepository.create(safeUser);

    return {
      user: safeUser,
      mustChangePassword: safeUser.mustChangePassword
    };
  }

  logout() {
    this.sessionRepository.clear();
    return { loggedOut: true };
  }

  /**
   * @param {unknown} payload
   * @returns {Promise<object>}
   */
  async changePassword(payload) {
    const session = this.sessionRepository.getCurrent();

    if (!session?.user?.id) {
      throw new AppError('AUTH_SESSION_REQUIRED', 'Entre novamente para alterar a senha.', {
        status: 401
      });
    }

    const passwordPayload = validateChangePasswordPayload(payload);
    const user = this.userRepository.findById(session.user.id);

    if (!user || !user.active) {
      throw new AppError('AUTH_USER_DISABLED', 'Usuario desativado.', {
        status: 403
      });
    }

    const currentPasswordMatches = await bcrypt.compare(
      passwordPayload.currentPassword,
      user.password_hash
    );

    if (!currentPasswordMatches) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'Senha atual incorreta.', {
        status: 401
      });
    }

    const passwordHash = await bcrypt.hash(passwordPayload.newPassword, 12);
    this.userRepository.updatePassword(user.id, passwordHash);

    const updatedUser = this.userRepository.findById(user.id);
    const safeUser = toSafeUser(updatedUser);
    this.sessionRepository.create(safeUser);

    return {
      user: safeUser,
      mustChangePassword: false
    };
  }

  /**
   * @param {string} username
   */
  assertNotLocked(username) {
    const record = this.failedAttempts.get(username);

    if (!record?.lockedUntil) {
      return;
    }

    if (record.lockedUntil <= Date.now()) {
      this.failedAttempts.delete(username);
      return;
    }

    throw new AppError(
      'AUTH_TEMPORARILY_LOCKED',
      'Muitas tentativas invalidas. Aguarde alguns minutos e tente novamente.',
      { status: 429 }
    );
  }

  /**
   * @param {string} username
   */
  registerFailedAttempt(username) {
    const record = this.failedAttempts.get(username) ?? { count: 0, lockedUntil: null };
    const nextCount = record.count + 1;

    this.failedAttempts.set(username, {
      count: nextCount,
      lockedUntil: nextCount >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCK_DURATION_MS : null
    });
  }
}

/**
 * @param {object} user
 * @returns {{id: number, username: string, name: string, role: string, mustChangePassword: boolean}}
 */
function toSafeUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    mustChangePassword: Boolean(user.must_change_password)
  };
}

module.exports = AuthService;
