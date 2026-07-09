const path = require('path');
const bcrypt = require('bcryptjs');
const AppError = require('../utils/AppError');
const { requireUserId } = require('./authService');

const PROVIDERS = new Set(['goanime-gui', 'goanime', 'anime-cli-br', 'ani-cli']);
const LANGUAGES = new Set(['sub', 'dub']);
const QUALITIES = new Set(['auto', '360', '480', '720', '1080']);
const THEMES = new Set(['dark', 'light', 'system']);

class SettingsService {
  constructor({ settingsRepository, sessionRepository }) {
    this.settingsRepository = settingsRepository;
    this.sessionRepository = sessionRepository;
  }

  get() {
    const userId = requireUserId(this.sessionRepository);
    this.settingsRepository.createDefaultForUser(userId);
    return mapSettings(this.settingsRepository.findByUserId(userId));
  }

  update(payload) {
    const userId = requireUserId(this.sessionRepository);
    const current = this.get();
    const settings = {
      defaultProvider: PROVIDERS.has(payload?.defaultProvider)
        ? payload.defaultProvider
        : current.defaultProvider,
      defaultLanguage: LANGUAGES.has(payload?.defaultLanguage)
        ? payload.defaultLanguage
        : current.defaultLanguage,
      defaultQuality: QUALITIES.has(String(payload?.defaultQuality))
        ? String(payload.defaultQuality)
        : current.defaultQuality,
      autoPlayNext: Boolean(payload?.autoPlayNext),
      playerVolume: clamp(Number(payload?.playerVolume), 0, 100, current.playerVolume),
      playerMode: 'external',
      theme: THEMES.has(payload?.theme) ? payload.theme : current.theme,
      downloadsPath: normalizePath(payload?.downloadsPath),
      audioPreference: LANGUAGES.has(payload?.audioPreference)
        ? payload.audioPreference
        : current.audioPreference,
      parentalControlEnabled: Boolean(payload?.parentalControlEnabled),
      maxContentRating: ['10', '12', '14', '16', '18'].includes(String(payload?.maxContentRating))
        ? String(payload.maxContentRating)
        : current.maxContentRating,
      rememberPosition: payload?.rememberPosition !== false,
      checkUpdates: payload?.checkUpdates !== false,
      localTelemetryEnabled: Boolean(payload?.localTelemetryEnabled)
    };
    this.settingsRepository.update(userId, settings);
    return this.get();
  }

  async setParentalPin(payload) {
    const userId = requireUserId(this.sessionRepository);
    const pin = normalizePin(payload?.pin);
    const pinHash = await bcrypt.hash(pin, 12);
    this.settingsRepository.updateParentalPin(userId, pinHash);
    return { configured: true };
  }

  async verifyParentalPin(payload) {
    const userId = requireUserId(this.sessionRepository);
    const settings = this.settingsRepository.findByUserId(userId);
    if (!settings?.parental_pin_hash) {
      throw new AppError('PARENTAL_PIN_NOT_SET', 'Configure um PIN parental primeiro.', {
        status: 409
      });
    }
    const valid = await bcrypt.compare(normalizePin(payload?.pin), settings.parental_pin_hash);
    if (!valid) {
      throw new AppError('PARENTAL_PIN_INVALID', 'PIN parental incorreto.', { status: 401 });
    }
    return { verified: true, validForMinutes: 30 };
  }
}

function mapSettings(row) {
  return {
    defaultProvider: row?.default_provider || 'goanime-gui',
    defaultLanguage: row?.default_language || 'sub',
    defaultQuality: row?.default_quality || 'auto',
    autoPlayNext: Boolean(row?.auto_play_next),
    playerVolume: Number(row?.player_volume ?? 80),
    playerMode: 'external',
    theme: row?.theme || 'dark',
    downloadsPath: row?.downloads_path || '',
    audioPreference: row?.audio_preference || row?.default_language || 'sub',
    parentalControlEnabled: Boolean(row?.parental_control_enabled),
    parentalPinConfigured: Boolean(row?.parental_pin_hash),
    maxContentRating: row?.max_content_rating || '18',
    rememberPosition: row?.remember_position !== 0,
    checkUpdates: row?.check_updates !== 0,
    localTelemetryEnabled: Boolean(row?.local_telemetry_enabled)
  };
}

function normalizePin(value) {
  const pin = String(value ?? '').trim();
  if (!/^\d{4,8}$/.test(pin)) {
    throw new AppError('INVALID_PARENTAL_PIN', 'O PIN deve ter entre 4 e 8 números.', {
      status: 400
    });
  }
  return pin;
}

function normalizePath(value) {
  const candidate = String(value ?? '').trim();
  if (!candidate) return '';
  return path.normalize(candidate).slice(0, 500);
}

function clamp(value, min, max, fallback) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

module.exports = SettingsService;
module.exports.mapSettings = mapSettings;
