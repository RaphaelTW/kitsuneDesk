const exposedApi = window.animeDesk;

/**
 * API publica exposta pelo preload seguro.
 *
 * @type {Readonly<Record<string, unknown>>}
 */
export const animeDesk = Object.freeze(exposedApi ?? {});

/**
 * @returns {boolean}
 */
export function hasAnimeDeskApi() {
  return Boolean(exposedApi?.app?.getInfo && exposedApi?.app?.ping);
}
