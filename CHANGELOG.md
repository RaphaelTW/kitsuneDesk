# Changelog

## [0.11.0] - 2026-07-09

### Adicionado

- Novos temas: Older Brother Core, Dreamcore, Cottagecore, Cyberpunk e Synthwave.
- Snapshot local da Home, configurações e mini player para renderizar a tela principal imediatamente na abertura.
- Aquecimento em segundo plano das capas vistas na Home para acelerar reaberturas.
- Cache offline dos avatares selecionados também no renderer, evitando tentativa remota quando já existe avatar salvo.
- Endpoint interno para pré-carregar capas em lote sem bloquear a interface.

### Melhorado

- Hidratação inicial da tela principal passa a ser assíncrona e resiliente com `Promise.allSettled`, sem depender de atualização, playback ou dashboard para liberar a UI.
- Cache de capas e avatares ganhou janela `staleUntil`, TTL maior para avatares e limpeza automática de arquivos antigos na inicialização.
- Capas em cache passam a preferir `fileUrl` quando disponível, reduzindo uso repetido de base64 no renderer.
- README e fluxo interativo atualizados para a release `v0.11.0`.

### Alterado

- Versão do aplicativo atualizada para `0.11.0`.

## [0.10.0] - 2026-07-09

### Adicionado

- Cache local de pesquisas e episódios com expiração e uso do último resultado disponível quando a fonte fica temporariamente offline.
- Cache de capas e avatares no diretório local do aplicativo, com limpeza pela interface e fallback offline.
- Backup e restauração da biblioteca em JSON, com modos de mesclagem e substituição.
- Backup criptografado opcional de perfis locais usando `scrypt` e `AES-256-GCM`.
- Tela de gerenciamento da telemetria local com filtros, paginação, detalhes, cópia, exclusão e exportação em JSON ou CSV.
- Novos estilos gratuitos de avatar via DiceBear, incluindo Lorelei, Open Peeps, Pixel Art, Bottts, Avataaars e outros.
- Temas Dracula, Classic 98, Frutiger Aero, Dark Fantasy e Rachni.

### Melhorado

- Inicialização da Home mais rápida: verificações pesadas de provedores e ferramentas deixam de bloquear a abertura do aplicativo.
- Diagnóstico de componentes e saúde dos provedores com cache temporário em memória.
- Imagens de listas passam a usar carregamento preguiçoso e decodificação assíncrona.
- Tema `system` acompanha alterações do tema do Windows em tempo real.
- Estado ativo dos menus usa brilho neon em degradê rosa para azul; o hover usa roxo para azul.
- Cache, backups, avatares, telemetria e temas foram integrados ao fluxo seguro de IPC do Electron.

### Segurança

- Backups de perfis nunca armazenam a senha de proteção e utilizam criptografia autenticada.
- Telemetria continua desativada por padrão e permanece somente no computador do usuário.
- Metadados sensíveis da telemetria continuam passando por remoção de tokens, senhas, cookies, hashes e secrets.

### Alterado

- Versão do aplicativo atualizada para `0.10.0`.

## [0.9.0] - 2026-07-09

### Adicionado

- Primeiro usuário local criado automaticamente como `admin` / `admin123`, com troca obrigatória de senha no primeiro login.
- Política forte para novas senhas: mínimo de oito caracteres, maiúscula, minúscula, número e caractere especial.
- Fila de reprodução com reordenação de episódios pelo mini player.
- Exportação do histórico filtrado em CSV.
- Telemetria local de falhas, desativada por padrão e visível no diagnóstico quando ativada.
- Avatares de usuário via DiceBear, armazenando estilo e semente.
- Teste end-to-end do Electron no Windows com Playwright.

### Segurança

- Release Windows preparada para assinatura digital do instalador por certificado configurado em secrets.
- Verificação de integridade dos binários baixados por SHA-256 publicado ou assinatura Authenticode.
- Melhorias de acessibilidade por teclado e leitores de tela: skip link, foco visível, `aria-current`, rótulos e controles de fila acessíveis.

### Alterado

- Versão do aplicativo atualizada para `0.9.0`.

## [0.8.1] - 2026-07-09

### Corrigido

- Corrigida a publicação das atualizações automáticas com envio obrigatório de `latest.yml`, instalador `.exe` e arquivo `.blockmap` para a mesma GitHub Release.
- A release criada por tag agora é marcada explicitamente como **Latest**, impedindo que versões antigas continuem sendo consultadas pelo aplicativo.
- O workflow gera e valida todos os artefatos antes de publicar a release, evitando releases vazias ou incompletas.
- Removida a configuração duplicada do `electron-builder` no `package.json`; `electron-builder.yml` passa a ser informado explicitamente em todos os comandos de build.
- Erros técnicos extensos do atualizador deixam de aparecer para o usuário e passam a ser convertidos em mensagens curtas e orientativas.

### Adicionado

- Script `npm run release:verify-artifacts` para validar versão, nome do instalador, `sha512`, `.blockmap` e conteúdo do `latest.yml`.
- Testes para impedir regressões na configuração de release e na sanitização dos erros de atualização.
- Ícones do KitsuneDesk aplicados ao instalador, à janela principal e às telas da aplicação.

### Alterado

- Versão do aplicativo atualizada para `0.8.1`.

## [0.8.0] - 2026-07-09

### Stable

- O player MPV passa a abrir exclusivamente em uma janela externa para eliminar a superfície preta observada em alguns computadores.
- Os controles de pausa, volume, progresso, anterior, próximo e parada continuam disponíveis no mini player do KitsuneDesk por IPC.
- Preferências antigas de player integrado são migradas automaticamente para `external`.
- Removidos a janela nativa auxiliar, os canais IPC de posicionamento e visibilidade e o argumento `--wid` do bridge.
- O fluxo de reprodução ficou menor e mais previsível, sem tentativa dupla de inicialização.

### Melhorado

- README dinâmico e interativo com badges, prévias, Mermaid, navegação rápida e seções recolhíveis.
- Fluxo HTML interativo corrigido, incluindo a remoção de uma declaração JavaScript duplicada que impedia o mapa de funcionar.
- Adicionado `npm run validate` para executar lint, verificação de formatação e testes em sequência.
- Workflow de release atualizado para validar a compilação estável antes de publicar.
- Testes atualizados para impedir regressões que voltem a enviar identificadores de janela ao MPV.
- Versão do aplicativo atualizada para `0.8.0`.

## [0.7.1] - 2026-07-09

### Corrigido

- Corrigida a tela preta com áudio no player integrado do Windows.
- O `HWND` fornecido pelo Electron agora é convertido somente para os 32 bits (`uint32_t`) aceitos pela opção `--wid` do MPV.
- O bridge força o backend gráfico nativo Direct3D 11 ao reproduzir dentro do KitsuneDesk.
- O aplicativo confirma por IPC se o MPV criou faixa de vídeo, saída gráfica e dimensões válidas antes de informar que o player integrado está pronto.
- Se o MPV iniciar somente o áudio ou não configurar a saída de vídeo em até oito segundos, a reprodução é reiniciada automaticamente na janela externa.

### Alterado

- Bridge GoAnime atualizado para `1.5.1`.
- Versão do aplicativo atualizada para `0.7.1`.

## [0.7.0] - 2026-07-09

### Adicionado

- Player MPV incorporado à interface no Windows usando uma superfície nativa e `--wid`.
- Modos de player **Integrado**, **Automático** e **Janela externa** nas configurações de cada usuário.
- Fallback automático para a janela externa quando o MPV não consegue iniciar incorporado.
- Controles para expandir, ocultar, reabrir e parar o player integrado.
- Barras de instalação e atualização com gradiente azul, violeta e roxo, brilho neon e animação.
- Spinners neon no login, configuração inicial, carregamentos e reinicialização de atualização.
- Atalhos para catálogos oficiais de anime em português na área Ferramentas.
- Mapa completo em Mermaid no README e mapa interativo em `docs/fluxo-interativo.html`.
- Testes das funções puras usadas para converter o identificador nativo da janela do Windows e normalizar o tamanho do player.

### Alterado

- Bridge GoAnime atualizado para `1.5.0`, com suporte ao identificador da janela nativa do player.
- A tela de configurações passa a salvar o modo preferido de reprodução por usuário.
- A área administrativa deixa mais explícito que somente administradores podem criar e gerenciar outros perfis.
- README reorganizado com fluxo de primeira execução, player, usuários, releases e atualização automática.
- Versão do aplicativo atualizada para `0.7.0`.

### Mantido

- GoAnime GUI como provedor principal, GoAnime clássico, anime-cli-br e ani-cli experimental.
- Biblioteca, histórico, favoritos, controle parental, diagnóstico e atualização automática pelo GitHub Releases.
- Janela externa do MPV como alternativa de compatibilidade.

## [0.6.2] - 2026-07-09

### Adicionado

- Verificação automática de atualizações alguns segundos após iniciar o aplicativo instalado.
- Novas verificações periódicas em segundo plano enquanto o KitsuneDesk estiver aberto.
- Notificação nativa do Windows quando uma versão estiver disponível ou pronta para instalar.
- Faixa de atualização dentro da interface com versão, progresso, notas da release e botão **Instalar e reiniciar**.
- Consulta do estado da atualização ao entrar no aplicativo, evitando perder eventos disparados antes do login.
- Script `release:verify` que impede a publicação quando a tag não corresponde à versão do `package.json`.
- GitHub Actions cria a release com notas automáticas antes de publicar o instalador e os metadados do atualizador.

### Alterado

- O atualizador passa a usar avisos próprios do KitsuneDesk, mantendo download em segundo plano e instalação ao fechar.
- Mensagens de atualização agora mostram claramente a versão encontrada e o percentual baixado.

### Mantido

- O vídeo continua sendo exibido pela janela externa do MPV; os controles permanecem integrados ao KitsuneDesk.

## [0.6.1] - 2026-07-08

### Corrigido

- Removidas referências acidentais a um registro npm interno do arquivo `package-lock.json`.
- Todas as dependências agora são baixadas pelo registro público oficial `registry.npmjs.org`.
- Adicionado `.npmrc` com tentativas automáticas e tempo limite ampliado para conexões instáveis.
- Corrigido o erro `ETIMEDOUT` ao instalar `electron-updater`, `builder-util-runtime`, `lodash.escaperegexp`, `lodash.isequal` e `tiny-typed-emitter`.

## [0.6.0] - 2026-07-08

### Adicionado

- Biblioteca individual por usuário com **Continuar assistindo**, favoritos, lista “Quero assistir”, histórico, estatísticas e marcação de episódios concluídos.
- Persistência do episódio, posição, duração, idioma, qualidade, fonte e dados do anime para retomada posterior.
- Configurações persistentes de provedor, idioma, resolução, áudio, volume, reprodução automática, posição, tema, pasta de downloads e atualização automática.
- Controles do MPV no KitsuneDesk: pausar, continuar, avançar, retroceder, volume, barra de progresso, episódio anterior, próximo episódio e encerramento.
- Reprodução automática do próximo episódio e retomada na posição salva.
- Painel de saúde dos provedores e registro local de episódios com problema.
- Área de diagnóstico com verificação do GoAnime, bridge, MPV, banco, cache, componentes e exportação de relatório JSON.
- Reparação do `better-sqlite3`, limpeza de cache e restauração dos componentes sem apagar histórico ou configurações.
- Perfis separados, administração de usuários, primeiro administrador criado no primeiro acesso e bloqueio persistente depois de cinco tentativas inválidas.
- Controle parental por perfil, PIN de 4 a 8 números e liberação temporária de conteúdo protegido.
- FAST Anime VSR movido definitivamente para **Ferramentas**, fora do seletor de provedores.
- Atualização automática do aplicativo por releases do GitHub usando `electron-updater`.
- Workflow do GitHub Actions para lint, formatação, testes, instalador do Windows, artefatos e publicação por tag.
- Suíte inicial de testes para autenticação, configurações, bridge, fallback, instalação, reprodução e migrações.

### Corrigido

- Bridge GoAnime atualizado para `1.4.0`, com IPC do MPV, volume inicial, posição de retomada e manutenção do proxy durante a reprodução.
- Eventos tardios de um MPV anterior não interrompem mais o próximo episódio.
- Episódios concluídos deixam de aparecer em “Continuar assistindo”.
- O desenvolvimento prepara automaticamente o `better-sqlite3` para a versão instalada do Electron, mantendo o modo de compatibilidade caso o reparo falhe.
- User-Agent dos instaladores e verificações atualizado para a versão 0.6.0.

### Segurança

- Removida a conta padrão `admin/admin123`.
- Senhas armazenadas com bcrypt e exigência mínima de oito caracteres, uma letra e um número.
- Proteção contra desativar ou rebaixar o último administrador ativo.

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
