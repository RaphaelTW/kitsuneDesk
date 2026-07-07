const AppError = require('./AppError');

/**
 * @param {unknown} value
 * @returns {string}
 */
function requireText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

/**
 * @param {unknown} payload
 * @returns {{username: string, password: string}}
 */
function validateLoginPayload(payload) {
  const username = requireText(payload?.username);
  const password = typeof payload?.password === 'string' ? payload.password : '';

  if (!username || !password) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Informe usuario e senha.', {
      status: 400
    });
  }

  return { username, password };
}

/**
 * @param {unknown} payload
 * @returns {{currentPassword: string, newPassword: string, confirmPassword: string}}
 */
function validateChangePasswordPayload(payload) {
  const currentPassword =
    typeof payload?.currentPassword === 'string' ? payload.currentPassword : '';
  const newPassword = typeof payload?.newPassword === 'string' ? payload.newPassword : '';
  const confirmPassword =
    typeof payload?.confirmPassword === 'string' ? payload.confirmPassword : '';

  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new AppError('AUTH_PASSWORD_INVALID', 'Preencha todos os campos de senha.', {
      status: 400
    });
  }

  if (newPassword !== confirmPassword) {
    throw new AppError('AUTH_PASSWORD_INVALID', 'A confirmacao nao confere com a nova senha.', {
      status: 400
    });
  }

  assertPasswordPolicy(newPassword);

  return { currentPassword, newPassword, confirmPassword };
}

/**
 * @param {string} password
 */
function assertPasswordPolicy(password) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /\d/.test(password)
  ];

  if (checks.some((isValid) => !isValid)) {
    throw new AppError(
      'AUTH_PASSWORD_INVALID',
      'A senha deve ter oito caracteres, uma letra maiuscula, uma minuscula e um numero.',
      { status: 400 }
    );
  }
}

module.exports = {
  assertPasswordPolicy,
  validateChangePasswordPayload,
  validateLoginPayload
};
