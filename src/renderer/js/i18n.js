const dictionaries = Object.freeze({
  'pt-BR': {
    appLanguageApplied: 'Interface em português do Brasil.',
    embeddedHeadersFallback:
      'Este stream precisa de cabeçalhos/HLS/codecs que o Chromium pode não tocar. O KitsuneDesk usa fallback seguro quando necessário.'
  },
  'en-US': {
    appLanguageApplied: 'Interface set to English.',
    embeddedHeadersFallback:
      'This stream may require headers/HLS/codecs Chromium cannot play. KitsuneDesk uses a safe fallback when needed.'
  },
  'es-ES': {
    appLanguageApplied: 'Interfaz en español.',
    embeddedHeadersFallback:
      'Este stream puede requerir encabezados/HLS/códecs que Chromium no reproduce. KitsuneDesk usa un respaldo seguro cuando hace falta.'
  }
});

let currentLanguage = 'pt-BR';

export function applyInterfaceLanguage(language) {
  currentLanguage = dictionaries[language] ? language : 'pt-BR';
  document.documentElement.lang = currentLanguage.toLowerCase();
  document.body.dataset.interfaceLanguage = currentLanguage;
  return currentLanguage;
}

export function translate(key) {
  return dictionaries[currentLanguage]?.[key] || dictionaries['pt-BR'][key] || key;
}
