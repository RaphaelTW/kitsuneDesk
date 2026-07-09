class LibraryRepository {
  constructor(database) {
    this.database = database;
  }

  dashboard(userId) {
    return {
      continueWatching: this.continueWatching(userId, 8),
      recent: this.history(userId, { limit: 8 }),
      favorites: this.favorites(userId, 8),
      watchlist: this.watchlist(userId, 8),
      stats: this.stats(userId)
    };
  }

  continueWatching(userId, limit = 30) {
    return this.database.all(
      `SELECT *,
              CASE WHEN duration > 0
                THEN MIN(100, ROUND((playback_position * 100.0) / duration, 1))
                ELSE 0 END AS progress_percent
       FROM playback_sessions
       WHERE user_id = ? AND playback_position > 0
       ORDER BY updated_at DESC
       LIMIT ?`,
      [userId, limit]
    );
  }

  history(userId, { limit = 100, query = '' } = {}) {
    const normalizedQuery = `%${String(query).trim()}%`;
    return this.database.all(
      `SELECT *,
              CASE WHEN duration > 0
                THEN MIN(100, ROUND((playback_position * 100.0) / duration, 1))
                ELSE 0 END AS progress_percent
       FROM watch_history
       WHERE user_id = ? AND anime_title LIKE ?
       ORDER BY watched_at DESC
       LIMIT ?`,
      [userId, normalizedQuery, limit]
    );
  }

  favorites(userId, limit = 100) {
    return this.database.all(
      `SELECT * FROM favorites
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, limit]
    );
  }

  watchlist(userId, limit = 100) {
    return this.database.all(
      `SELECT * FROM watchlist
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, limit]
    );
  }

  stats(userId) {
    const history = this.database.get(
      `SELECT COUNT(*) AS total_plays,
              COUNT(DISTINCT anime_id) AS distinct_animes,
              SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS completed_episodes,
              COALESCE(SUM(playback_position), 0) AS seconds_watched
       FROM watch_history WHERE user_id = ?`,
      [userId]
    );
    const favoriteCount = this.database.get(
      'SELECT COUNT(*) AS total FROM favorites WHERE user_id = ?',
      [userId]
    );
    const watchlistCount = this.database.get(
      'SELECT COUNT(*) AS total FROM watchlist WHERE user_id = ?',
      [userId]
    );
    return {
      ...history,
      favorites: Number(favoriteCount?.total ?? 0),
      watchlist: Number(watchlistCount?.total ?? 0)
    };
  }

  toggleCollection(table, userId, item) {
    const existing = this.database.get(
      `SELECT id FROM ${table} WHERE user_id = ? AND provider_id = ? AND anime_id = ?`,
      [userId, item.providerId, item.animeId]
    );

    if (existing) {
      this.database.run(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`, [existing.id, userId]);
      return { active: false };
    }

    this.database.run(
      `INSERT INTO ${table} (
         user_id, provider_id, anime_id, anime_title, anime_cover, anime_payload
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        item.providerId,
        item.animeId,
        item.animeTitle,
        item.animeCover,
        JSON.stringify(item.animePayload)
      ]
    );
    return { active: true };
  }

  collectionState(userId, providerId, animeId) {
    const favorite = this.database.get(
      'SELECT id FROM favorites WHERE user_id = ? AND provider_id = ? AND anime_id = ?',
      [userId, providerId, animeId]
    );
    const watchlist = this.database.get(
      'SELECT id FROM watchlist WHERE user_id = ? AND provider_id = ? AND anime_id = ?',
      [userId, providerId, animeId]
    );
    return { favorite: Boolean(favorite), watchlist: Boolean(watchlist) };
  }

  removeHistory(userId, historyId) {
    return this.database.run('DELETE FROM watch_history WHERE id = ? AND user_id = ?', [
      historyId,
      userId
    ]);
  }

  clearHistory(userId) {
    this.database.run('DELETE FROM watch_history WHERE user_id = ?', [userId]);
    return { cleared: true };
  }

  markCompleted(userId, historyId, completed) {
    this.database.run(
      `UPDATE watch_history
       SET completed = ?,
           playback_position = CASE WHEN ? = 1 AND duration > 0 THEN duration ELSE playback_position END
       WHERE id = ? AND user_id = ?`,
      [completed ? 1 : 0, completed ? 1 : 0, historyId, userId]
    );
    return { completed: Boolean(completed) };
  }

  savePlayback(userId, playback) {
    const completed =
      playback.completed || (playback.duration > 0 && playback.position >= playback.duration * 0.9);
    this.database.run(
      `INSERT INTO playback_sessions (
         user_id, provider_id, anime_id, anime_title, anime_cover, current_episode,
         episode_title, language, quality, playback_position, duration, source,
         anime_payload, episode_payload, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, provider_id, anime_id, language) DO UPDATE SET
         anime_title = excluded.anime_title,
         anime_cover = excluded.anime_cover,
         current_episode = excluded.current_episode,
         episode_title = excluded.episode_title,
         quality = excluded.quality,
         playback_position = excluded.playback_position,
         duration = excluded.duration,
         source = excluded.source,
         anime_payload = excluded.anime_payload,
         episode_payload = excluded.episode_payload,
         updated_at = CURRENT_TIMESTAMP`,
      [
        userId,
        playback.providerId,
        playback.animeId,
        playback.animeTitle,
        playback.animeCover,
        playback.episodeNumber,
        playback.episodeTitle,
        playback.language,
        playback.quality,
        Math.max(0, Math.round(playback.position || 0)),
        Math.max(0, Math.round(playback.duration || 0)),
        playback.source || '',
        JSON.stringify(playback.animePayload || {}),
        JSON.stringify(playback.episodePayload || {})
      ]
    );

    const latest = this.database.get(
      `SELECT id FROM watch_history
       WHERE user_id = ? AND provider_id = ? AND anime_id = ?
         AND episode_number = ? AND language = ?
       ORDER BY watched_at DESC LIMIT 1`,
      [userId, playback.providerId, playback.animeId, playback.episodeNumber, playback.language]
    );

    if (latest) {
      this.database.run(
        `UPDATE watch_history SET
           anime_title = ?, anime_cover = ?, episode_title = ?, quality = ?,
           playback_position = ?, duration = ?, completed = ?, source = ?,
           anime_payload = ?, episode_payload = ?, watched_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          playback.animeTitle,
          playback.animeCover,
          playback.episodeTitle,
          playback.quality,
          Math.max(0, Math.round(playback.position || 0)),
          Math.max(0, Math.round(playback.duration || 0)),
          completed ? 1 : 0,
          playback.source || '',
          JSON.stringify(playback.animePayload || {}),
          JSON.stringify(playback.episodePayload || {}),
          latest.id
        ]
      );
    } else {
      this.database.run(
        `INSERT INTO watch_history (
           user_id, provider_id, anime_id, anime_title, anime_cover, episode_number,
           episode_title, language, quality, playback_position, duration, completed,
           source, anime_payload, episode_payload, watched_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          userId,
          playback.providerId,
          playback.animeId,
          playback.animeTitle,
          playback.animeCover,
          playback.episodeNumber,
          playback.episodeTitle,
          playback.language,
          playback.quality,
          Math.max(0, Math.round(playback.position || 0)),
          Math.max(0, Math.round(playback.duration || 0)),
          completed ? 1 : 0,
          playback.source || '',
          JSON.stringify(playback.animePayload || {}),
          JSON.stringify(playback.episodePayload || {})
        ]
      );
    }

    if (completed) {
      this.database.run(
        `DELETE FROM playback_sessions
         WHERE user_id = ? AND provider_id = ? AND anime_id = ? AND language = ?`,
        [userId, playback.providerId, playback.animeId, playback.language]
      );
    }

    return { saved: true, completed: Boolean(completed) };
  }

  report(userId, report) {
    const result = this.database.run(
      `INSERT INTO episode_reports (
         user_id, anime_id, anime_title, episode_number, language,
         provider_id, source, error_code, technical_error
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        report.animeId,
        report.animeTitle,
        report.episodeNumber,
        report.language,
        report.providerId,
        report.source,
        report.errorCode,
        report.technicalError
      ]
    );
    return { id: result.lastInsertRowid, saved: true };
  }
}

module.exports = LibraryRepository;
