# Changelog

Todas as alterações relevantes do KitsuneDesk serão registradas neste arquivo.

## [0.4.0] - 2026-07-08

### Adicionado

- Interface gráfica real para o GoAnime, sem TUI no fluxo principal.
- Pesquisa de animes dentro do Electron.
- Cards de resultados com capa, fonte, descrição e metadados.
- Tela interna para listar e filtrar episódios.
- Seleção de idioma e qualidade dentro do KitsuneDesk.
- Reprodução direta no MPV sem abrir terminal.
- Botões para voltar à Home, voltar aos resultados e pesquisar outro anime.
- Bridge local em Go com comunicação JSON entre Electron e GoAnime.
- Instalador `install-goanime-gui.ps1` para preparar Go, Git, GoAnime, MPV e compilar o bridge.

### Corrigido

- FAST Anime VSR agora encontra Python 3.10 pelo launcher, pastas padrão e Registro do Windows.
- Adicionado fallback para o instalador oficial do Python 3.10.11.
- anime-cli-br agora usa ambiente Python dedicado entre as versões 3.10 e 3.12.
- Instalações globais incompatíveis do Python 3.15 deixam de ser priorizadas.
- anime-cli-br verifica `animefire.net` antes de abrir e evita traceback em falhas de DNS.
- O retorno do winget quando VLC já está instalado deixa de causar falso erro.

### Mantido

- GoAnime clássico continua disponível manualmente.
- ani-cli continua no projeto como opção experimental.
- anime-cli-br continua disponível como opção legada.
- FAST Anime VSR continua separado do fluxo de streaming.

## [0.3.1] - 2026-07-08

### Corrigido

- O instalador do anime-cli-br não trata mais o retorno “já instalado/sem atualização” do winget como falha automática.
- Detecção ampliada do VLC pelo PATH, pastas padrão e Registro do Windows.
- A pasta real do VLC é adicionada ao PATH do usuário quando necessário.
- Detecção robusta de Python pelo `py`, `python.exe` e instalações em `%LOCALAPPDATA%`.
- O preparador do FAST Anime VSR instala e localiza o Python 3.10 antes de criar o ambiente virtual.
- Instalações incompletas do FAST Anime VSR são recriadas automaticamente.
- Scripts PowerShell passaram a ficar versionados em `scripts/windows`.
- Os scripts de instalação agora também são incluídos no instalador Electron.

### Mantido

- GoAnime continua como provedor principal.
- anime-cli-br continua como alternativa brasileira.
- ani-cli continua disponível no seletor, no modo automático e no botão de instalação.
- FAST Anime VSR continua opcional e separado dos provedores de streaming.

## [0.3.0] - 2026-07-07

### Adicionado

- Provedor `anime-cli-br` baseado no projeto `MtywX/anime-cli-br`.
- Instalação assistida de Python, Git, VLC e dependências do anime-cli-br.
- Detecção do executável `anime-cli-br` em pastas do Python e no PATH.
- Detecção do VLC no PATH e nas pastas padrão do Windows.
- Nova prioridade automática: GoAnime → anime-cli-br → ani-cli.
- Status individual dos três provedores.
- Integração experimental para preparar o FAST Anime VSR.
- Detecção básica de NVIDIA, Python, ffmpeg, ambiente virtual e CUDA para FAST Anime VSR.
- Cards e mensagens específicos para provedores recomendados, alternativos e experimentais.

### Corrigido

- Qualidade do ani-cli agora usa `360p`, `480p`, `720p`, `1080p` ou `best`.
- O ani-cli executa atualização antes da pesquisa.
- O terminal do ani-cli reconhece e explica o erro `Episode is released, but no valid sources!`.
- OpenSSL passou a fazer parte da validação obrigatória do ani-cli.

### Observações

- FAST Anime VSR não é um provedor de streaming; é uma ferramenta para processar vídeos locais.
- O erro de fontes inválidas do ani-cli 4.14.1 depende do projeto e dos provedores externos.
- O anime-cli-br não aceita a consulta como argumento, portanto o usuário precisa digitar novamente o título no terminal.

## [0.2.0] - 2026-07-07

### Adicionado

- Integração principal com GoAnime.
- Instalação assistida do GoAnime.
- Suporte a fonte PT-BR.
- Fallback ani-cli.

## [0.1.2] - 2026-07-07

### Corrigido

- Atualização automática do ani-cli.
- Verificação do OpenSSL.
- Diagnóstico de ausência de resultados.

## [0.1.1] - 2026-07-07

### Corrigido

- Execução do ani-cli por script Bash temporário no Windows Terminal.

## [0.1.0] - 2026-07-07

### Adicionado

- Estrutura inicial do Electron.
- Login local e SQLite.
- Interface em HTML, CSS e JavaScript puro.
