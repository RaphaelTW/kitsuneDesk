/**
 * A partir da v0.6.0 não existe senha padrão. O primeiro administrador é criado
 * pela tela segura de configuração inicial.
 *
 * @param {import('better-sqlite3').Database} _database
 */
function seedInitialData() {
  // Mantido como ponto de extensão para futuras configurações globais.
}

module.exports = {
  seedInitialData
};
