const AppError = require('../utils/AppError');
const { requireUserId } = require('./authService');

class LibraryService {
  constructor({ libraryRepository, sessionRepository }) {
    this.libraryRepository = libraryRepository;
    this.sessionRepository = sessionRepository;
  }

  dashboard() {
    return this.libraryRepository.dashboard(requireUserId(this.sessionRepository));
  }

  continueWatching() {
    return this.libraryRepository.continueWatching(requireUserId(this.sessionRepository));
  }

  history(filters) {
    return this.libraryRepository.history(requireUserId(this.sessionRepository), {
      limit: Math.min(300, Math.max(1, Number(filters?.limit ?? 100))),
      query: String(filters?.query ?? '')
    });
  }

  async exportHistoryCsv(filters) {
    const rows = await this.libraryRepository.history(requireUserId(this.sessionRepository), {
      limit: Math.min(5000, Math.max(1, Number(filters?.limit ?? 5000))),
      query: String(filters?.query ?? '')
    });
    return {
      fileName: `kitsunedesk-historico-${new Date().toISOString().slice(0, 10)}.csv`,
      mimeType: 'text/csv;charset=utf-8',
      csv: toHistoryCsv(rows)
    };
  }

  favorites() {
    return this.libraryRepository.favorites(requireUserId(this.sessionRepository));
  }

  watchlist() {
    return this.libraryRepository.watchlist(requireUserId(this.sessionRepository));
  }

  toggleFavorite(payload) {
    return this.libraryRepository.toggleCollection(
      'favorites',
      requireUserId(this.sessionRepository),
      normalizeCollectionItem(payload)
    );
  }

  toggleWatchlist(payload) {
    return this.libraryRepository.toggleCollection(
      'watchlist',
      requireUserId(this.sessionRepository),
      normalizeCollectionItem(payload)
    );
  }

  collectionState(payload) {
    return this.libraryRepository.collectionState(
      requireUserId(this.sessionRepository),
      String(payload?.providerId || 'goanime-gui'),
      normalizeAnimeId(payload?.animeId)
    );
  }

  async removeHistory(payload) {
    await this.libraryRepository.removeHistory(
      requireUserId(this.sessionRepository),
      Number(payload?.historyId)
    );
    return { removed: true };
  }

  clearHistory() {
    return this.libraryRepository.clearHistory(requireUserId(this.sessionRepository));
  }

  markCompleted(payload) {
    return this.libraryRepository.markCompleted(
      requireUserId(this.sessionRepository),
      Number(payload?.historyId),
      Boolean(payload?.completed)
    );
  }

  savePlayback(playback) {
    return this.libraryRepository.savePlayback(
      requireUserId(this.sessionRepository),
      normalizePlayback(playback)
    );
  }

  report(payload) {
    const report = normalizeReport(payload);
    return this.libraryRepository.report(requireUserId(this.sessionRepository), report);
  }
}

function normalizeCollectionItem(payload) {
  const animePayload =
    payload?.animePayload && typeof payload.animePayload === 'object' ? payload.animePayload : {};
  return {
    providerId: String(payload?.providerId || 'goanime-gui'),
    animeId: normalizeAnimeId(payload?.animeId || animePayload.url),
    animeTitle: normalizeTitle(payload?.animeTitle || animePayload.name),
    animeCover: String(payload?.animeCover || animePayload.imageUrl || '').slice(0, 1000),
    animePayload
  };
}

function normalizePlayback(value) {
  return {
    providerId: String(value?.providerId || 'goanime-gui'),
    animeId: normalizeAnimeId(value?.animeId),
    animeTitle: normalizeTitle(value?.animeTitle),
    animeCover: String(value?.animeCover || '').slice(0, 1000),
    episodeNumber: Number(value?.episodeNumber || 1),
    episodeTitle: String(value?.episodeTitle || '').slice(0, 300),
    language: value?.language === 'dub' ? 'dub' : 'sub',
    quality: String(value?.quality || 'auto'),
    position: Number(value?.position || 0),
    duration: Number(value?.duration || 0),
    source: String(value?.source || '').slice(0, 200),
    completed: Boolean(value?.completed),
    animePayload:
      value?.animePayload && typeof value.animePayload === 'object' ? value.animePayload : {},
    episodePayload:
      value?.episodePayload && typeof value.episodePayload === 'object' ? value.episodePayload : {}
  };
}

function normalizeReport(value) {
  return {
    animeId: normalizeAnimeId(value?.animeId),
    animeTitle: normalizeTitle(value?.animeTitle),
    episodeNumber: Number(value?.episodeNumber || 1),
    language: value?.language === 'dub' ? 'dub' : 'sub',
    providerId: String(value?.providerId || 'goanime-gui'),
    source: String(value?.source || '').slice(0, 200),
    errorCode: String(value?.errorCode || '').slice(0, 100),
    technicalError: String(value?.technicalError || '').slice(0, 4000)
  };
}

function normalizeAnimeId(value) {
  const animeId = String(value ?? '').trim();
  if (!animeId) {
    throw new AppError('INVALID_ANIME', 'Anime inválido.', { status: 400 });
  }
  return animeId.slice(0, 1000);
}

function normalizeTitle(value) {
  const title = String(value ?? '').trim();
  if (!title) {
    throw new AppError('INVALID_ANIME', 'Título do anime não informado.', { status: 400 });
  }
  return title.slice(0, 300);
}

function toHistoryCsv(rows) {
  const header = [
    'anime',
    'episodio',
    'titulo_episodio',
    'idioma',
    'qualidade',
    'posicao_segundos',
    'duracao_segundos',
    'concluido',
    'fonte',
    'assistido_em'
  ];
  const body = rows.map((row) =>
    [
      row.anime_title,
      row.episode_number,
      row.episode_title,
      row.language,
      row.quality,
      row.playback_position,
      row.duration,
      row.completed ? 'sim' : 'nao',
      row.source,
      row.watched_at
    ]
      .map(csvCell)
      .join(',')
  );
  return [header.join(','), ...body].join('\r\n');
}

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

module.exports = LibraryService;
