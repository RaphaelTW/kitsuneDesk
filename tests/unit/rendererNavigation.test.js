const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const navigationModule = import(
  pathToFileURL(path.join(__dirname, '..', '..', 'src', 'renderer', 'js', 'navigation.mjs'))
);

test('navegacao ativa a tela imediatamente antes da hidratacao', async () => {
  const { createNavigationController } = await navigationModule;
  const fixture = createFixture();
  let releaseHydration;
  const hydration = new Promise((resolve) => {
    releaseHydration = resolve;
  });
  const controller = createController(createNavigationController, fixture, {
    hydrateView: () => hydration
  });

  const pending = controller.showView('tools');
  assert.equal(fixture.toolsPanel.classList.contains('d-none'), false);
  assert.equal(fixture.toolsButton.classList.contains('is-active'), true);
  assert.equal(fixture.toolsPanel.getAttribute('aria-busy'), 'true');

  releaseHydration();
  await pending;
  assert.equal(fixture.toolsPanel.getAttribute('aria-busy'), null);
});

test('falha de fragmento informa o usuario e permite nova tentativa', async () => {
  const { createNavigationController } = await navigationModule;
  const fixture = createFixture({ fragment: 'views/tools.html' });
  const toasts = [];
  let requests = 0;
  const controller = createController(createNavigationController, fixture, {
    fetchImpl: async () => {
      requests += 1;
      if (requests === 1) return { ok: false };
      return { ok: true, text: async () => '<div>Ferramentas</div>' };
    },
    showToast: (toast) => toasts.push(toast)
  });

  await controller.showView('tools');
  assert.equal(toasts.length, 1);
  assert.match(toasts[0].message, /carregar a tela tools/);
  assert.equal(fixture.toolsPanel.dataset.fragmentLoaded, undefined);

  await controller.showView('tools');
  assert.equal(requests, 2);
  assert.equal(fixture.toolsPanel.dataset.fragmentLoaded, 'true');
  assert.equal(fixture.toolsPanel.innerHTML, '<div>Ferramentas</div>');
});

test('navegacao antiga nao ativa nem hidrata uma tela depois de troca rapida', async () => {
  const { createNavigationController } = await navigationModule;
  const fixture = createFixture({ fragment: 'views/tools.html' });
  let releaseFragment;
  const fragment = new Promise((resolve) => {
    releaseFragment = () => resolve({ ok: true, text: async () => '<div>Ferramentas</div>' });
  });
  const activated = [];
  const hydrated = [];
  const controller = createController(createNavigationController, fixture, {
    activateView: async (view) => activated.push(view),
    fetchImpl: () => fragment,
    hydrateView: async (view) => hydrated.push(view)
  });

  const toolsRequest = controller.showView('tools');
  await controller.showView('home');
  releaseFragment();
  await toolsRequest;

  assert.deepEqual(activated, ['home']);
  assert.deepEqual(hydrated, ['home']);
});

function createController(createNavigationController, fixture, overrides = {}) {
  return createNavigationController({
    $: (id) => fixture.byId[id],
    activateView: async () => {},
    applyLanguage: () => {},
    documentRef: fixture.document,
    fetchImpl: async () => ({ ok: true, text: async () => '' }),
    getLanguage: () => 'pt-BR',
    hydrateView: async () => {},
    locationHref: 'file:///app/pages/home.html',
    showToast: () => {},
    translate: (key) => key,
    viewMeta: { home: ['home', 'home'], tools: ['tools', 'tools'] },
    ...overrides
  });
}

function createFixture(options = {}) {
  const homePanel = element({ viewPanel: 'home' });
  homePanel.classList.remove('d-none');
  const toolsPanel = element({ viewPanel: 'tools', fragment: options.fragment });
  const homeButton = element({ view: 'home' });
  homeButton.classList.add('nav-item', 'is-active');
  const toolsButton = element({ view: 'tools' });
  toolsButton.classList.add('nav-item');
  const viewEyebrow = element();
  const viewTitle = element();
  const contentArea = element();
  const all = [homePanel, toolsPanel, homeButton, toolsButton];
  const document = {
    querySelector: (selector) => select(all, selector)[0] || null,
    querySelectorAll: (selector) => select(all, selector)
  };
  return {
    byId: { 'view-eyebrow': viewEyebrow, 'view-title': viewTitle, 'content-area': contentArea },
    document,
    toolsButton,
    toolsPanel
  };
}

function select(elements, selector) {
  if (selector === '[data-view-panel]') return elements.filter((item) => item.dataset.viewPanel);
  if (selector === '.nav-item[data-view]') {
    return elements.filter((item) => item.dataset.view && item.classList.contains('nav-item'));
  }
  if (selector === '[data-view]' || selector === '[data-go-view]') {
    const key = selector === '[data-view]' ? 'view' : 'goView';
    return elements.filter((item) => item.dataset[key]);
  }
  const match = selector.match(/^\[data-(view-panel|view)="([^"]+)"\]$/);
  if (!match) return [];
  const key = match[1] === 'view-panel' ? 'viewPanel' : 'view';
  return elements.filter((item) => item.dataset[key] === match[2]);
}

function element(dataset = {}) {
  const classes = new Set(['d-none']);
  const attributes = new Map();
  return {
    dataset: Object.fromEntries(Object.entries(dataset).filter(([, value]) => value)),
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      contains: (name) => classes.has(name),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, enabled) => (enabled ? classes.add(name) : classes.delete(name))
    },
    addEventListener() {},
    focus() {},
    getAttribute: (name) => attributes.get(name) ?? null,
    innerHTML: '',
    querySelectorAll: () => [],
    removeAttribute: (name) => attributes.delete(name),
    setAttribute: (name, value) => attributes.set(name, value),
    textContent: ''
  };
}
