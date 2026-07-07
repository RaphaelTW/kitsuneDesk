class AppError extends Error {
  /**
   * @param {string} code
   * @param {string} publicMessage
   * @param {object} [options]
   * @param {string} [options.technicalMessage]
   * @param {number} [options.status]
   * @param {Record<string, unknown>} [options.metadata]
   */
  constructor(code, publicMessage, options = {}) {
    super(options.technicalMessage ?? publicMessage);
    this.name = 'AppError';
    this.code = code;
    this.publicMessage = publicMessage;
    this.technicalMessage = options.technicalMessage ?? publicMessage;
    this.status = options.status ?? 400;
    this.metadata = options.metadata ?? {};
  }
}

module.exports = AppError;
