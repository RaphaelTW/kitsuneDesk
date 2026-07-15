function analyzeEmbeddedCompatibility(stream) {
  const metadata = stream?.metadata || {};
  const urlLower = String(stream?.url || '').toLowerCase();
  const container = String(metadata.container || metadata.format || '').toLowerCase();
  const codec = String(
    metadata.videoCodec || metadata.codec || metadata.codecs || ''
  ).toLowerCase();
  const requiresHeaders = String(metadata.requiresHeaders || '').toLowerCase() === 'true';

  if (/\.m3u8(?:$|[?#])/.test(urlLower) || container === 'hls') {
    return { compatible: false, reason: 'HLS detectado. Reprodução encaminhada ao MPV.' };
  }
  if (metadata.referer || requiresHeaders) {
    return {
      compatible: false,
      reason: 'A fonte exige cabeçalhos HTTP. Reprodução encaminhada ao MPV.'
    };
  }
  if (/\.(mkv|avi|flv|ts)(?:$|[?#])/.test(urlLower) || ['matroska', 'mpegts'].includes(container)) {
    return { compatible: false, reason: 'Contêiner encaminhado ao MPV por compatibilidade.' };
  }
  if (/\b(hevc|h265|h\.265|av1|ac3|eac3|dts)\b/.test(codec)) {
    return { compatible: false, reason: 'Codec encaminhado ao MPV por compatibilidade.' };
  }
  return { compatible: true, reason: null };
}

module.exports = { analyzeEmbeddedCompatibility };
