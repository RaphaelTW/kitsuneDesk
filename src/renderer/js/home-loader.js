async function loadFragment(hostId, relativePath) {
  const host = document.getElementById(hostId);
  if (!host) return;
  const response = await fetch(new URL(relativePath, import.meta.url));
  if (!response.ok) throw new Error(`Fragmento indisponível: ${relativePath}`);
  host.innerHTML = await response.text();
}

await loadFragment('player-components', '../pages/fragments/player.html');
await import('./home.js');
