# Changelog

Todas as alterações relevantes do KitsuneDesk serão registradas neste arquivo.

## [0.1.1] - 2026-07-07

### Corrigido

- Corrigida a abertura da pesquisa pelo Windows Terminal.
- O comando do `ani-cli` agora é executado por meio de um script Bash temporário.
- Impedido que o Windows Terminal interprete `; read -r -p` como um novo comando do Windows.
- Detecção do Git Bash limitada ao executável `bash.exe`, compatível com os argumentos utilizados.

## [0.1.0] - 2026-07-07

### Adicionado

- Estrutura inicial do Electron.
- Login local e troca obrigatória da senha inicial.
- Banco SQLite local.
- Tela inicial com integração inicial ao `ani-cli`.
- Verificação das dependências Git Bash, MPV, FFmpeg, FZF e ani-cli.
