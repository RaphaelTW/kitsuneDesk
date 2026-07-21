export const viewMeta = Object.freeze({
  home: ['navHome', 'navHome'],
  search: ['navSearch', 'navSearch'],
  continue: ['navContinue', 'navContinue'],
  lists: ['navLists', 'navLists'],
  history: ['navHistory', 'navHistory'],
  tools: ['navTools', 'navTools'],
  settings: ['navSettings', 'navSettings'],
  diagnostics: ['navDiagnostics', 'navDiagnostics'],
  telemetry: ['navTelemetry', 'navTelemetry'],
  admin: ['navUsers', 'navUsers']
});

export const viewModules = Object.freeze({
  search: './views/search.js',
  continue: './views/library.js',
  lists: './views/library.js',
  history: './views/library.js',
  tools: './views/tools.js',
  settings: './views/settings.js',
  diagnostics: './views/maintenance.js',
  telemetry: './views/telemetry.js',
  admin: './views/admin.js'
});
