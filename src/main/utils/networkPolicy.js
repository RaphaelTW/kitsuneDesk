const dns = require('dns').promises;
const net = require('net');

async function assertPublicHttpUrl(value) {
  return (await resolvePublicHttpUrl(value)).url;
}

async function resolvePublicHttpUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value));
  } catch {
    throw new Error('URL remota invalida.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('URL remota nao permitida.');
  }
  const addresses = net.isIP(parsed.hostname)
    ? [{ address: parsed.hostname }]
    : await dns.lookup(parsed.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Endereco de rede privado nao permitido.');
  }
  return {
    url: parsed.href,
    address: addresses[0].address,
    family: net.isIPv6(addresses[0].address) ? 6 : 4
  };
}

function isPrivateAddress(address) {
  const normalized = String(address || '')
    .toLowerCase()
    .split('%')[0];
  if (net.isIPv4(normalized)) {
    const [a, b] = normalized.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (!net.isIPv6(normalized)) return true;
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized)) {
    return true;
  }
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateAddress(mapped[1]) : false;
}

module.exports = { assertPublicHttpUrl, isPrivateAddress, resolvePublicHttpUrl };
