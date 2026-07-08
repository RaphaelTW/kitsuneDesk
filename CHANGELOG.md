# Changelog

Todas as alterações relevantes do KitsuneDesk serão registradas neste arquivo.

## [0.5.2] - 2026-07-08

### Corrigido

- Corrigido o erro `no source URLs found for episode 1` no GoAnime com interface gráfica.
- O bridge tenta automaticamente os modos legendado, dublado e `raw` quando a fonte selecionada não entrega URLs no idioma solicitado.
- A qualidade escolhida passa a usar `Melhor disponível` como fallback quando a resolução específica não existir.
- Adicionado fallback para outra fonte compatível do mesmo anime e episódio antes de encerrar a reprodução.
- Erros `no source URLs` e `no suitable quality` agora são classificados como fonte de vídeo indisponível, em vez de erro genérico do GoAnime.
- A confirmação do MPV informa quando idioma, qualidade ou fonte alternativa foram usados.
- Adicionado o comando opcional `npm run rebuild:native` para recompilar `better-sqlite3` para o ABI do Electron e evitar o aviso `NODE_MODULE_VERSION`.

### Alterado

- Bridge gráfico atualizado para a versão 1.3.0; a instalação automática recompila somente o bridge incompatível.
- Versão do aplicativo atualizada para 0.5.2.

## [0.5.1] - 2026-07-08

### Corrigido

- Corrigida a falha `Não é possível converter o valor para o tipo System.String` ao preparar o bridge do GoAnime GUI.
- Eventos de progresso agora são enviados diretamente ao `stdout`, sem contaminarem os valores retornados pelas funções PowerShell.
- Saída do Scoop é encaminhada ao visor da instalação sem transformar caminhos de executáveis em arrays.
- Scripts temporários agora são gravados em UTF-8 com BOM para compatibilidade com Windows PowerShell 5.1.
- Corrigidos textos corrompidos como `grÃ¡fica` e `instalaÃ§Ã£o` no monitor de instalação.
- Mensagens de erro deixam de ser repetidas pelo formato expandido do `Write-Error`.

### Mantido

- Instalação silenciosa dentro do KitsuneDesk, barra de progresso e visor de componentes.
- GoAnime clássico, GoAnime GUI, anime-cli-br, ani-cli experimental e FAST Anime VSR.

## [0.5.0] - 2026-07-08

### Adicionado

- Instalação automática dos quatro grupos: GoAnime completo, anime-cli-br, ani-cli experimental e FAST Anime VSR.
- Painel de instalação dentro do Electron, sem abrir PowerShell ou Windows Terminal.
- Barra de progresso percentual, etapa atual, monitor de eventos e lista explicando para que serve cada componente.
- Estados visuais para componente pendente, em andamento, já instalado, instalado, aviso, erro e cancelado.
- Instalações executadas em segundo plano com eventos IPC seguros entre o processo principal e o renderer.
- Botões para ocultar a instalação sem interromper e para cancelar a árvore do processo.
- Runtime Go portátil baixado apenas quando o bridge gráfico precisa ser compilado.
- Instalação do GoAnime portátil com MPV gerenciado localmente quando necessário.
- Instalação automática de Python 3.12 e VLC para o anime-cli-br.
- Instalação automática de Scoop, Git Bash, fzf, FFmpeg, MPV e OpenSSL para o ani-cli.
- Instalação automática de Python 3.10, FFmpeg, bibliotecas e PyTorch para FAST Anime VSR.

### Alterado

- Os instaladores agora verificam cada dependência e ignoram o que já estiver funcionando.
- Winget deixou de ser requisito para a configuração dos provedores.
- O status é atualizado automaticamente ao concluir uma instalação.
- FAST Anime VSR pode ficar com o ambiente base pronto mesmo sem CUDA ativa; a interface informa a situação da aceleração.
- GoAnime GUI e GoAnime clássico compartilham a ação “GoAnime completo”, mantendo os dois modos disponíveis.

### Corrigido

- Eliminado o erro “Go não encontrado e winget indisponível” por meio do runtime Go portátil.
- Evitada a abertura de terminais que poderia confundir usuários durante a instalação.
- Erros dos scripts agora retornam código diferente de zero e aparecem no visor da interface.

## [0.4.1] - 2026-07-08

- Corrigida a reprodução do GoAnime gráfico: o bridge agora usa o resolvedor completo do GoAnime, inicia o MPV e permanece ativo enquanto o vídeo toca, preservando proxies locais necessários por fontes como Blogger/Goyabu.
- O aviso de sucesso só aparece depois que o MPV confirma um processo ativo.
- Corrigido o texto duplicado “Episódio Episódio 1”.
- Quando um bridge antigo estiver instalado, a interface exige atualização para a versão compatível antes de pesquisar.

### Adicionado

- Seletor principal de provedor na Home.
- GoAnime com interface gráfica definido como opção principal e selecionado por padrão.
- GoAnime clássico disponível no mesmo formulário de pesquisa.
- anime-cli-br, FAST Anime VSR e ani-cli experimental disponíveis no seletor.
- Cartão dinâmico com descrição, prontidão e ação de instalação/reparo do provedor escolhido.
- Abertura assistida do ambiente FAST Anime VSR em PowerShell e no Explorador de Arquivos.
- Resolver gráfico atualizado para usar a mesma extração e proxy de vídeo do GoAnime clássico.
- O bridge permanece ativo durante a reprodução para manter proxies locais de fontes como Blogger/Goyabu.
- Atualização obrigatória do bridge gráfico para a versão 1.2.0.

### Ajustado

- Idioma e resolução permanecem visíveis no fluxo principal.
- `Melhor disponível` passa a ser explicitamente a resolução padrão.
- Idioma e resolução são desativados apenas quando a ferramenta selecionada não oferece esses controles.
- O botão principal muda de texto e comportamento conforme o provedor escolhido.
- Corrigido o texto duplicado `Episódio Episódio 1` em fontes PT-BR.
- Erros do MPV agora são exibidos em vez de informar que o player abriu sem confirmação.
- A área avançada foi mantida como atalho adicional para instalação, reparo e abertura manual.

### Mantido

- Interface gráfica interna do GoAnime.
- Fluxo clássico original do GoAnime no terminal.
- Botões para voltar à Home e pesquisar outro anime.
- GoAnime como primeira recomendação do KitsuneDesk.

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
