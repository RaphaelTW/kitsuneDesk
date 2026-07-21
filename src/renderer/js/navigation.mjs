export function createNavigationController(context) {
  const {
    $,
    activateView,
    applyLanguage,
    getLanguage,
    hydrateView,
    showToast,
    translate,
    viewMeta,
    documentRef = globalThis.document,
    fetchImpl = globalThis.fetch,
    locationHref = globalThis.location?.href
  } = context;
  const fragmentPromises = new Map();
  let sequence = 0;

  function bind() {
    documentRef.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', () => showView(button.dataset.view));
    });
    bindViewLinks(documentRef);
  }

  async function showView(view) {
    if (!viewMeta[view]) return;
    const requestSequence = ++sequence;
    const panel = documentRef.querySelector(`[data-view-panel="${view}"]`);
    renderActiveView(view);
    panel?.classList.add('is-loading');
    panel?.setAttribute('aria-busy', 'true');
    if (panel) panel.dataset.navigationSequence = String(requestSequence);

    try {
      await loadViewFragment(view);
      if (requestSequence !== sequence) return;
      await activateView(view);
      if (requestSequence !== sequence) return;
      await hydrateView(view);
    } catch (error) {
      if (requestSequence === sequence) {
        showToast({
          title: 'Tela indisponível',
          message: error?.message || 'Não foi possível abrir esta tela.',
          variant: 'error'
        });
      }
    } finally {
      if (panel?.dataset.navigationSequence === String(requestSequence)) {
        panel.classList.remove('is-loading');
        panel.removeAttribute('aria-busy');
        delete panel.dataset.navigationSequence;
      }
    }
  }

  function renderActiveView(view) {
    documentRef.querySelectorAll('[data-view-panel]').forEach((panel) => {
      panel.classList.toggle('d-none', panel.dataset.viewPanel !== view);
    });
    documentRef.querySelectorAll('.nav-item[data-view]').forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    const [eyebrow, title] = viewMeta[view];
    $('view-eyebrow').textContent = translate(eyebrow);
    $('view-title').textContent = translate(title);
    $('content-area').focus({ preventScroll: true });
  }

  async function loadViewFragment(view) {
    const panel = documentRef.querySelector(`[data-view-panel="${view}"]`);
    if (!panel?.dataset.fragment || panel.dataset.fragmentLoaded === 'true') return;
    if (!fragmentPromises.has(view)) {
      const loadPromise = (async () => {
        const fragmentUrl = new globalThis.URL(
          `./fragments/${panel.dataset.fragment}`,
          locationHref
        );
        const response = await fetchImpl(fragmentUrl);
        if (!response.ok) throw new Error(`Não foi possível carregar a tela ${view}.`);
        panel.innerHTML = await response.text();
        panel.dataset.fragmentLoaded = 'true';
        bindViewLinks(panel);
        applyLanguage(getLanguage());
      })().catch((error) => {
        fragmentPromises.delete(view);
        throw error;
      });
      fragmentPromises.set(view, loadPromise);
    }
    await fragmentPromises.get(view);
  }

  function bindViewLinks(root) {
    root.querySelectorAll('[data-go-view]').forEach((button) => {
      button.addEventListener('click', () => showView(button.dataset.goView));
    });
  }

  function updateHeading(view) {
    if (!viewMeta[view]) return;
    const [eyebrow, title] = viewMeta[view];
    $('view-eyebrow').textContent = translate(eyebrow);
    $('view-title').textContent = translate(title);
  }

  return { bind, showView, updateHeading };
}
