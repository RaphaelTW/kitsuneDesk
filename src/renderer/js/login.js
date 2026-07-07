import { animeDesk, hasAnimeDeskApi } from './api.js';
import { redirectAuthenticatedUser, saveSession } from './auth.js';

document.addEventListener('DOMContentLoaded', () => {
  redirectAuthenticatedUser();
  enableTooltips();
  bindPasswordToggle();
  bindLoginForm();
});

function enableTooltips() {
  document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((element) => {
    new bootstrap.Tooltip(element);
  });
}

function bindPasswordToggle() {
  const password = document.getElementById('password');
  const toggle = document.getElementById('toggle-password');
  const icon = toggle.querySelector('i');

  toggle.addEventListener('click', () => {
    const shouldShow = password.type === 'password';
    password.type = shouldShow ? 'text' : 'password';
    icon.className = shouldShow ? 'bi bi-eye-slash' : 'bi bi-eye';
    toggle.setAttribute('aria-label', shouldShow ? 'Ocultar senha' : 'Mostrar senha');
  });
}

function bindLoginForm() {
  const form = document.getElementById('login-form');
  const alert = document.getElementById('login-alert');
  const button = document.getElementById('login-button');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setAlert(alert, '');

    if (!hasAnimeDeskApi()) {
      setAlert(alert, 'A API local nao esta disponivel.');
      return;
    }

    setButtonLoading(button, true);

    try {
      const formData = new FormData(form);
      const result = await animeDesk.auth.login({
        username: formData.get('username'),
        password: formData.get('password')
      });

      if (!result.ok) {
        setAlert(alert, result.error?.message ?? 'Nao foi possivel entrar.');
        return;
      }

      saveSession(result.data);
      window.location.href = result.data.mustChangePassword
        ? './change-password.html'
        : './home.html';
    } finally {
      setButtonLoading(button, false);
    }
  });
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
  button.querySelector('.button-label').textContent = loading ? 'Entrando' : 'Entrar';
  button.querySelector('.spinner-border').classList.toggle('d-none', !loading);
}
