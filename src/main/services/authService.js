const bcrypt = require('bcryptjs');
const AppError = require('../utils/AppError');
const {
  assertPasswordPolicy,
  validateChangePasswordPayload,
  validateLoginPayload
} = require('../utils/validator');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;
const AVATAR_STYLES = new Set(['thumbs', 'initials', 'identicon', 'shapes', 'rings']);

class AuthService {
  constructor({ userRepository, sessionRepository, securityRepository, settingsRepository }) {
    this.userRepository = userRepository;
    this.sessionRepository = sessionRepository;
    this.securityRepository = securityRepository;
    this.settingsRepository = settingsRepository;
  }

  setupStatus() {
    return { needsSetup: this.userRepository.count() === 0 };
  }

  async createInitialAdmin(payload) {
    if (this.userRepository.count() > 0) {
      throw new AppError('SETUP_ALREADY_COMPLETED', 'A configuracao inicial ja foi concluida.', {
        status: 409
      });
    }

    const input = normalizeNewUser(payload, { forceAdmin: true });
    const passwordHash = await bcrypt.hash(input.password, 12);
    const result = this.userRepository.create({ ...input, passwordHash });
    this.settingsRepository.createDefaultForUser(result.lastInsertRowid);
    const user = this.userRepository.findById(result.lastInsertRowid);
    const safeUser = toSafeUser(user);
    this.sessionRepository.create(safeUser);

    return { user: safeUser, mustChangePassword: false, created: true };
  }

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

    this.securityRepository.clear(credentials.username);
    this.settingsRepository.createDefaultForUser(user.id);
    const safeUser = toSafeUser(user);
    this.sessionRepository.create(safeUser);

    return { user: safeUser, mustChangePassword: safeUser.mustChangePassword };
  }

  logout() {
    this.sessionRepository.clear();
    return { loggedOut: true };
  }

  session() {
    return this.sessionRepository.getCurrent() ?? null;
  }

  async changePassword(payload) {
    const userId = requireUserId(this.sessionRepository);
    const passwordPayload = validateChangePasswordPayload(payload);
    const user = this.userRepository.findById(userId);

    if (!user || !user.active) {
      throw new AppError('AUTH_USER_DISABLED', 'Usuario desativado.', { status: 403 });
    }

    const currentPasswordMatches = await bcrypt.compare(
      passwordPayload.currentPassword,
      user.password_hash
    );
    if (!currentPasswordMatches) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'Senha atual incorreta.', { status: 401 });
    }

    const passwordHash = await bcrypt.hash(passwordPayload.newPassword, 12);
    this.userRepository.updatePassword(user.id, passwordHash, false);
    const safeUser = toSafeUser(this.userRepository.findById(user.id));
    this.sessionRepository.create(safeUser);
    return { user: safeUser, mustChangePassword: false };
  }

  listUsers() {
    requireAdmin(this.sessionRepository);
    return this.userRepository.list().map(toSafeUser);
  }

  async createUser(payload) {
    requireAdmin(this.sessionRepository);
    const input = normalizeNewUser(payload);
    if (this.userRepository.findByUsername(input.username)) {
      throw new AppError('USERNAME_IN_USE', 'Esse nome de usuario ja esta em uso.', {
        status: 409
      });
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    const result = this.userRepository.create({ ...input, passwordHash });
    this.settingsRepository.createDefaultForUser(result.lastInsertRowid);
    return toSafeUser(this.userRepository.findById(result.lastInsertRowid));
  }

  updateUser(payload) {
    const admin = requireAdmin(this.sessionRepository);
    const userId = Number(payload?.id);
    const current = this.userRepository.findById(userId);
    if (!current) {
      throw new AppError('USER_NOT_FOUND', 'Usuario nao encontrado.', { status: 404 });
    }

    const role = payload?.role === 'ADMIN' ? 'ADMIN' : 'USER';
    const active = Boolean(payload?.active);
    if (current.id === admin.id && (!active || role !== 'ADMIN')) {
      throw new AppError(
        'ADMIN_SELF_PROTECTION',
        'Voce nao pode remover seu proprio acesso de administrador.',
        { status: 409 }
      );
    }
    if (current.role === 'ADMIN' && current.active && (!active || role !== 'ADMIN')) {
      if (this.userRepository.countActiveAdminsExcept(userId) === 0) {
        throw new AppError('LAST_ADMIN', 'O sistema precisa manter pelo menos um administrador.', {
          status: 409
        });
      }
    }

    this.userRepository.update(userId, {
      name: normalizeName(payload?.name),
      role,
      active,
      profileColor: normalizeColor(payload?.profileColor),
      avatarSeed: normalizeAvatarSeed(payload?.avatarSeed, current.username),
      avatarStyle: normalizeAvatarStyle(payload?.avatarStyle),
      parentalLevel: normalizeParentalLevel(payload?.parentalLevel)
    });
    return toSafeUser(this.userRepository.findById(userId));
  }

  async resetUserPassword(payload) {
    requireAdmin(this.sessionRepository);
    const userId = Number(payload?.id);
    const user = this.userRepository.findById(userId);
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'Usuario nao encontrado.', { status: 404 });
    }
    const password = normalizePassword(payload?.password);
    const passwordHash = await bcrypt.hash(password, 12);
    this.userRepository.updatePassword(userId, passwordHash, Boolean(payload?.mustChangePassword));
    this.securityRepository.clear(user.username);
    return { updated: true };
  }

  assertNotLocked(username) {
    const record = this.securityRepository.find(username);
    if (!record?.locked_until) return;
    const lockedUntil = Date.parse(record.locked_until);
    if (!Number.isFinite(lockedUntil) || lockedUntil <= Date.now()) {
      this.securityRepository.clear(username);
      return;
    }
    const minutes = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000));
    throw new AppError(
      'AUTH_TEMPORARILY_LOCKED',
      `Muitas tentativas invalidas. Tente novamente em aproximadamente ${minutes} minuto(s).`,
      { status: 429 }
    );
  }

  registerFailedAttempt(username) {
    const record = this.securityRepository.find(username);
    const nextCount = Number(record?.failed_attempts ?? 0) + 1;
    const lockedUntil =
      nextCount >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCK_DURATION_MS).toISOString()
        : null;
    this.securityRepository.registerFailure(username, nextCount, lockedUntil);
  }
}

function normalizeNewUser(payload, { forceAdmin = false } = {}) {
  const username = String(payload?.username ?? '')
    .trim()
    .toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    throw new AppError(
      'INVALID_USERNAME',
      'Use de 3 a 32 caracteres: letras, numeros, ponto, hifen ou sublinhado.',
      { status: 400 }
    );
  }
  return {
    username,
    password: normalizePassword(payload?.password),
    name: normalizeName(payload?.name),
    role: forceAdmin || payload?.role === 'ADMIN' ? 'ADMIN' : 'USER',
    profileColor: normalizeColor(payload?.profileColor),
    avatarSeed: normalizeAvatarSeed(payload?.avatarSeed, username),
    avatarStyle: normalizeAvatarStyle(payload?.avatarStyle),
    parentalLevel: normalizeParentalLevel(payload?.parentalLevel)
  };
}

function normalizePassword(value) {
  const password = String(value ?? '');
  assertPasswordPolicy(password);
  return password;
}

function normalizeName(value) {
  const name = String(value ?? '').trim();
  if (name.length < 2 || name.length > 80) {
    throw new AppError('INVALID_NAME', 'Informe um nome entre 2 e 80 caracteres.', {
      status: 400
    });
  }
  return name;
}

function normalizeColor(value) {
  const color = String(value ?? '#6f5cff');
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#6f5cff';
}

function normalizeAvatarSeed(value, fallback) {
  const seed = String(value || fallback || 'user').trim();
  return seed.slice(0, 80) || 'user';
}

function normalizeAvatarStyle(value) {
  const style = String(value || 'thumbs').trim();
  return AVATAR_STYLES.has(style) ? style : 'thumbs';
}

function normalizeParentalLevel(value) {
  return ['CHILD', 'TEEN', 'ADULT'].includes(value) ? value : 'ADULT';
}

function requireUserId(sessionRepository) {
  const userId = Number(sessionRepository.getCurrent()?.user?.id);
  if (!userId) {
    throw new AppError('AUTH_SESSION_REQUIRED', 'Entre novamente para continuar.', {
      status: 401
    });
  }
  return userId;
}

function requireAdmin(sessionRepository) {
  const user = sessionRepository.getCurrent()?.user;
  if (!user?.id) {
    throw new AppError('AUTH_SESSION_REQUIRED', 'Entre novamente para continuar.', {
      status: 401
    });
  }
  if (user.role !== 'ADMIN') {
    throw new AppError('ADMIN_REQUIRED', 'Apenas administradores podem realizar essa acao.', {
      status: 403
    });
  }
  return user;
}

function toSafeUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    mustChangePassword: Boolean(user.must_change_password),
    active: Boolean(user.active),
    profileColor: user.profile_color || '#6f5cff',
    avatarSeed: user.avatar_seed || user.username || user.name || 'user',
    avatarStyle: normalizeAvatarStyle(user.avatar_style),
    parentalLevel: user.parental_level || 'ADULT',
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
}

module.exports = AuthService;
module.exports.toSafeUser = toSafeUser;
module.exports.requireUserId = requireUserId;
module.exports.requireAdmin = requireAdmin;
