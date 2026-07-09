# KitsuneDesk 0.6.1

Aplicativo desktop em Electron para pesquisar, assistir e acompanhar animes com perfis locais, biblioteca, progresso de reprodução, controles do MPV, diagnóstico e instalação gráfica dos componentes.

> O KitsuneDesk não hospeda vídeos. A disponibilidade de títulos e episódios depende dos projetos e fontes externas utilizados pelos provedores.

## Principais recursos

### Biblioteca por usuário

- Continuar assistindo com porcentagem e posição salva;
- últimos episódios abertos;
- favoritos;
- lista **Quero assistir**;
- histórico pesquisável;
- marcação de episódios concluídos;
- estatísticas de reproduções, animes, episódios e tempo assistido.

### Reprodução

O **GoAnime — Interface gráfica** continua como provedor principal. O sistema também mantém:

- GoAnime clássico;
- anime-cli-br;
- ani-cli experimental.

O seletor oferece idioma legendado ou dublado/PT-BR e resolução **Melhor disponível** como padrão, além de 360p, 480p, 720p e 1080p.

Quando a fonte principal não entrega um stream, o bridge tenta outros modos, qualidade automática e fontes compatíveis. Alguns episódios ainda podem ficar indisponíveis quando nenhuma fonte externa possui um link válido.

### Controle do MPV

Durante a reprodução, o KitsuneDesk mostra um mini-player com:

- reproduzir e pausar;
- posição e duração;
- avançar e retroceder;
- volume;
- episódio anterior e próximo;
- encerramento;
- nome, episódio, qualidade e fonte utilizada;
- botão para reportar um episódio com problema.

A posição é salva periodicamente. A opção de reprodução automática abre o episódio seguinte quando ele estiver disponível.

### Configurações persistentes

Cada perfil possui suas próprias preferências:

- provedor padrão;
- idioma e áudio preferidos;
- resolução padrão;
- reprodução automática;
- volume inicial;
- retomada da posição;
- tema claro, escuro ou do sistema;
- pasta de downloads;
- controle parental e classificação máxima;
- verificação de atualizações.

### Usuários e segurança

Na primeira execução, o sistema solicita a criação do administrador. Não existe mais usuário ou senha padrão.

- criação e edição de usuários;
- perfis com histórico e configurações independentes;
- papéis Administrador e Usuário;
- ativação e desativação de contas;
- redefinição de senha;
- proteção do último administrador;
- bloqueio por 15 minutos após cinco falhas consecutivas;
- PIN parental com liberação temporária por 30 minutos.

A senha precisa ter pelo menos oito caracteres, uma letra e um número.

### Instalação gráfica dos componentes

Os comandos de instalação são executados ocultos. O aplicativo mostra barra de progresso, etapa atual, componentes encontrados e a finalidade de cada item.

| Componente | Instalação preparada pelo KitsuneDesk |
|---|---|
| GoAnime GUI e clássico | GoAnime, MPV, runtime Go portátil quando necessário e bridge gráfico |
| anime-cli-br | Python 3.12 isolado, VLC, código e dependências |
| ani-cli experimental | Git Bash, fzf, FFmpeg, MPV, OpenSSL e ani-cli |
| FAST Anime VSR | Python 3.10, FFmpeg, projeto, PyTorch e diagnóstico de CUDA |

O FAST Anime VSR fica em **Ferramentas** porque processa arquivos locais e não funciona como provedor de streaming.

### Diagnóstico e reparo

A área de diagnóstico permite:

- verificar GoAnime GUI, GoAnime clássico, bridge e MPV;
- verificar anime-cli-br, ani-cli e FAST Anime VSR;
- reconstruir o `better-sqlite3` no modo de desenvolvimento;
- atualizar ou reinstalar cada componente pela área Ferramentas;
- limpar caches e arquivos temporários;
- restaurar componentes locais sem apagar biblioteca, usuários ou configurações;
- exportar um relatório técnico em JSON;
- verificar e instalar atualizações do KitsuneDesk.

No desenvolvimento, `npm run dev` verifica automaticamente se o módulo SQLite foi preparado para a versão atual do Electron. Se o reparo não for possível, o aplicativo tenta o modo de compatibilidade.

## Requisitos

- Windows 10 ou Windows 11 de 64 bits;
- conexão com a internet para instalar componentes e acessar fontes;
- Node.js 24 recomendado para desenvolvimento;
- PowerShell do Windows para a instalação automática;
- GPU NVIDIA e CUDA são opcionais e usadas apenas pelo FAST Anime VSR.

## Executar em desenvolvimento

```powershell
npm install
npm run dev
```

Na primeira inicialização, crie o administrador pela própria tela de configuração.

Comandos úteis:

```powershell
npm run lint
npm run format:check
npm test
npm run rebuild:native
```

## Gerar o instalador do Windows

```powershell
npm install
npm run build:win
```

O arquivo será criado em:

```text
dist\KitsuneDesk-Setup-0.6.1.exe
```

O instalador NSIS cria atalhos, permite escolher a pasta e preserva os dados locais durante a desinstalação.

## Atualizações e releases

O projeto possui workflow em `.github/workflows/windows-build.yml`.

- pushes e pull requests executam lint, formatação, testes e build;
- o instalador é disponibilizado como artefato do workflow;
- uma tag como `v0.6.1` publica o instalador, `latest.yml` e o arquivo de atualização no GitHub Releases;
- o aplicativo instalado consulta esses releases por meio do `electron-updater`.

Para criar uma release:

```powershell
git tag v0.6.1
git push origin v0.6.1
```

## Estrutura principal

```text
src/main/
  controllers/       controladores IPC
  database/          SQLite e migrações
  ipc/               canais seguros entre renderer e main
  repositories/      acesso aos dados
  services/          autenticação, biblioteca, player, diagnóstico e atualização
src/renderer/
  pages/              login e aplicação principal
  js/                 interface e componentes
  css/                estilos
resources/
  goanime-bridge/     bridge Go da interface gráfica
scripts/windows/      instaladores automáticos
scripts/              inicialização e preparação do desenvolvimento
tests/                testes unitários e de integração
.github/workflows/    build e releases do Windows
```

## Dados locais

O banco SQLite, logs e configurações ficam na pasta de dados do aplicativo do Windows. A restauração de componentes não apaga esses dados.

## Limitações conhecidas

- fontes externas podem alterar páginas, bloquear regiões ou remover episódios;
- ani-cli é experimental e pode encontrar o episódio sem receber um stream válido;
- anime-cli-br depende da disponibilidade do AnimeFire;
- a aceleração do FAST Anime VSR depende da combinação de GPU, driver, CUDA e PyTorch;
- a atualização automática funciona no aplicativo instalado a partir de uma release publicada, não no `npm run dev`.

## Licença

KitsuneDesk é distribuído sob a licença MIT. Consulte `THIRD_PARTY.md` para os projetos externos.
