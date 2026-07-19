async function loadFragment(hostId, relativePath) {
  const host = document.getElementById(hostId);
  if (!host) return;
  const response = await fetch(new URL(relativePath, import.meta.url));
  if (!response.ok) throw new Error(`Fragmento indisponível: ${relativePath}`);
  host.innerHTML = await response.text();
}

// O player e opcional para a primeira interacao. A interface principal nao deve
// esperar o fragmento terminar de ler do disco para registrar seus cliques.
globalThis.kitsuneDeskPlayerComponentsReady = loadFragment(
  'player-components',
  '../pages/fragments/player.html'
).then(
  () => true,
  () => false
);

await import('./home.js');
