import { animeDesk, hasAnimeDeskApi } from './api.js';
import { redirectAuthenticatedUser, saveSession } from './auth.js';
import { applyStoredInterfaceLanguage, translate } from './i18n.js';

document.addEventListener('DOMContentLoaded', async () => {
  applyStoredInterfaceLanguage();
  redirectAuthenticatedUser();
  bindPasswordToggles();
  bindLoginForm();
  bindSetupForm();
  await selectMode();
});

async function selectMode() {
  const title = document.getElementById('auth-title');
  const loginForm = document.getElementById('login-form');
  const setupForm = document.getElementById('setup-form');

  if (!hasAnimeDeskApi()) {
    title.textContent = 'API indisponível';
    return;
  }

  const result = await animeDesk.auth.setupStatus();
  const needsSetup = Boolean(result.ok && result.data?.needsSetup);
  title.textContent = needsSetup ? translate('authSetup') : translate('authLogin');
  setupForm.classList.toggle('d-none', !needsSetup);
  loginForm.classList.toggle('d-none', needsSetup);
}

function bindPasswordToggles() {
  document.querySelectorAll('.password-toggle').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const input = document.getElementById(toggle.dataset.target);
      const icon = toggle.querySelector('i');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      icon.className = show ? 'bi bi-eye-slash' : 'bi bi-eye';
    });
  });
}

function bindLoginForm() {
  const form = document.getElementById('login-form');
  const alert = document.getElementById('login-alert');
  const button = document.getElementById('login-button');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setAlert(alert, '');
    setButtonLoading(button, true, 'Entrando');

    try {
      const formData = new FormData(form);
      const result = await animeDesk.auth.login({
        username: formData.get('username'),
        password: formData.get('password')
      });
      if (!result.ok) {
        setAlert(alert, result.error?.message ?? 'Não foi possível entrar.');
        return;
      }
      saveSession(result.data);
      window.location.href = result.data.mustChangePassword
        ? './change-password.html'
        : './home.html';
    } finally {
      setButtonLoading(button, false, 'Entrar');
    }
  });
}

function bindSetupForm() {
  const form = document.getElementById('setup-form');
  const alert = document.getElementById('setup-alert');
  const button = document.getElementById('setup-button');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setAlert(alert, '');
    const password = document.getElementById('setup-password').value;
    const confirmation = document.getElementById('setup-password-confirm').value;
    if (password !== confirmation) {
      setAlert(alert, 'As senhas não coincidem.');
      return;
    }

    setButtonLoading(button, true, 'Criando');
    try {
      const formData = new FormData(form);
      const result = await animeDesk.auth.createInitialAdmin({
        name: formData.get('name'),
        username: formData.get('username'),
        password
      });
      if (!result.ok) {
        setAlert(alert, result.error?.message ?? 'Não foi possível criar o administrador.');
        return;
      }
      saveSession(result.data);
      window.location.href = './home.html';
    } finally {
      setButtonLoading(button, false, 'Criar administrador');
    }
  });
}

function setAlert(element, message) {
  element.textContent = message;
  element.classList.toggle('d-none', !message);
}

function setButtonLoading(button, loading, label) {
  button.disabled = loading;
  button.querySelector('.button-label').textContent = loading ? `${label}...` : label;
  button.querySelector('.neon-spinner, .spinner-border')?.classList.toggle('d-none', !loading);
}
