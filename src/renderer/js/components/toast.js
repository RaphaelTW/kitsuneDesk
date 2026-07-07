const toastVariantClass = Object.freeze({
  info: 'text-bg-dark',
  success: 'text-bg-success',
  warning: 'text-bg-warning',
  error: 'text-bg-danger'
});

/**
 * Exibe uma notificacao visual sem usar alert nativo.
 *
 * @param {{title: string, message: string, variant?: 'info'|'success'|'warning'|'error'}} options
 */
export function showToast({ title, message, variant = 'info' }) {
  const container = getToastContainer();
  const toastElement = document.createElement('div');
  toastElement.className = `toast ${toastVariantClass[variant] ?? toastVariantClass.info}`;
  toastElement.setAttribute('role', 'status');
  toastElement.setAttribute('aria-live', 'polite');
  toastElement.setAttribute('aria-atomic', 'true');

  const header = document.createElement('div');
  header.className = 'toast-header';

  const heading = document.createElement('strong');
  heading.className = 'me-auto';
  heading.textContent = title;

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'btn-close';
  closeButton.setAttribute('data-bs-dismiss', 'toast');
  closeButton.setAttribute('aria-label', 'Fechar');

  const body = document.createElement('div');
  body.className = 'toast-body';
  body.textContent = message;

  header.append(heading, closeButton);
  toastElement.append(header, body);
  container.append(toastElement);

  const toast = new bootstrap.Toast(toastElement, { delay: 3600 });
  toast.show();
  toastElement.addEventListener('hidden.bs.toast', () => toastElement.remove(), { once: true });
}

/**
 * @returns {HTMLElement}
 */
function getToastContainer() {
  const existingContainer = document.getElementById('toast-container');

  if (existingContainer) {
    return existingContainer;
  }

  const container = document.createElement('div');
  container.id = 'toast-container';
  container.className = 'toast-container position-fixed top-0 end-0 p-3';
  document.body.append(container);
  return container;
}
