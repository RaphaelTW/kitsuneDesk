# Changelog

Todas as alterações relevantes do KitsuneDesk serão documentadas neste arquivo.

## [0.2.0] - 2026-07-07

### Adicionado

- Integração do GoAnime como provedor principal.
- Seleção de provedor: Automático, GoAnime ou ani-cli.
- Modo Automático com prioridade para GoAnime e fallback para ani-cli.
- Instalação do GoAnime pela release oficial do GitHub.
- Detecção de `C:\Program Files\GoAnime\goanime.exe`.
- Detecção do MPV incluído em `C:\Program Files\GoAnime\bin\mpv.exe`.
- Suporte à instalação via `go install` e executável portátil.
- Filtro Dublado / PT-BR usando `--source ptbr`.
- Conversão de qualidade para o formato aceito pelo GoAnime.
- Status visual separado para GoAnime, MPV e ani-cli.
- Licença MIT do GoAnime em `resources/licenses`.

### Alterado

- Tela inicial redesenhada para trabalhar com múltiplos provedores.
- Botão de instalação dividido entre GoAnime e ani-cli.
- Mensagens de erro e diagnóstico de dependências aprimoradas.
- Versão atualizada para `0.2.0`.

### Mantido

- ani-cli disponível como fallback opcional.
- Login local, SQLite e preload seguro do Electron.

## [0.1.1] - 2026-07-07

### Corrigido

- Execução do ani-cli por script Bash temporário para evitar interpretação incorreta do comando `read` pelo Windows Terminal.
