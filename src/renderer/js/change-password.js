import { animeDesk } from './api.js';
import { requireSession, saveSession } from './auth.js';

document.addEventListener('DOMContentLoaded', () => {
  const session = requireSession({ allowPasswordChange: true });

  if (!session) {
    return;
  }

  bindPasswordRules();
  bindChangePasswordForm();
});

function bindPasswordRules() {
  const newPassword = document.getElementById('new-password');
  const confirmPassword = document.getElementById('confirm-password');
  const updateRules = () => {
    const password = newPassword.value;
    const confirm = confirmPassword.value;

    setRule('rule-length', password.length >= 8);
    setRule('rule-uppercase', /[A-Z]/.test(password));
    setRule('rule-lowercase', /[a-z]/.test(password));
    setRule('rule-number', /\d/.test(password));
    setRule('rule-match', Boolean(password) && password === confirm);
  };

  newPassword.addEventListener('input', updateRules);
  confirmPassword.addEventListener('input', updateRules);
  updateRules();
}

function bindChangePasswordForm() {
  const form = document.getElementById('change-password-form');
  const alert = document.getElementById('password-alert');
  const button = document.getElementById('password-button');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setAlert(alert, '');
    setButtonLoading(button, true);

    try {
      const formData = new FormData(form);
      const result = await animeDesk.auth.changePassword({
        currentPassword: formData.get('currentPassword'),
        newPassword: formData.get('newPassword'),
        confirmPassword: formData.get('confirmPassword')
      });

      if (!result.ok) {
        setAlert(alert, result.error?.message ?? 'Nao foi possivel alterar a senha.');
        return;
      }

      saveSession(result.data);
      window.location.href = './home.html';
    } finally {
      setButtonLoading(button, false);
    }
  });
}

/**
 * @param {string} id
 * @param {boolean} isValid
 */
function setRule(id, isValid) {
  const item = document.getElementById(id);
  const icon = item.querySelector('i');

  item.classList.toggle('is-valid', isValid);
  icon.className = isValid ? 'bi bi-check-circle-fill' : 'bi bi-circle';
}

/**
 * @param {HTMLElement} alert
 * @param {string} message
 */
function setAlert(alert, message) {
  alert.textContent = message;
  alert.classList.toggle('d-none', !message);
}

/**
 * @param {HTMLButtonElement} button
 * @param {boolean} loading
 */
function setButtonLoading(button, loading) {
  button.disabled = loading;
  button.querySelector('.button-label').textContent = loading ? 'Salvando' : 'Salvar senha';
  button.querySelector('.spinner-border').classList.toggle('d-none', !loading);
}
