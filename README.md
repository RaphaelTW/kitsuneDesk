<div align="center">

<img src="./assets/kitsunedesk-banner.svg" alt="KitsuneDesk" width="100%">

<br>

[![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-00A4EF?style=for-the-badge&logo=windows11&logoColor=white)](#requisitos)
[![Electron](https://img.shields.io/badge/Electron-Desktop-47848F?style=for-the-badge&logo=electron&logoColor=white)](#tecnologias)
[![JavaScript](https://img.shields.io/badge/JavaScript-Puro-F7DF1E?style=for-the-badge&logo=javascript&logoColor=111)](#tecnologias)
[![SQLite](https://img.shields.io/badge/SQLite-Local-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](#tecnologias)
[![Version](https://img.shields.io/badge/versão-0.4.1-8b5cf6?style=for-the-badge)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/licença-MIT-22C55E?style=for-the-badge)](./LICENSE)

### Interface gráfica local para pesquisar animes com GoAnime e reproduzir no MPV.

</div>

---

## Visão geral

O **KitsuneDesk** é uma aplicação desktop para Windows construída com Electron, HTML, CSS, JavaScript puro, Bootstrap e SQLite.

Na versão 0.4.1, o fluxo principal ganhou um seletor unificado de provedores:

1. **GoAnime com interface gráfica** permanece como opção principal;
2. **GoAnime clássico** pode ser aberto pelo mesmo formulário;
3. anime-cli-br, ani-cli experimental e FAST Anime VSR aparecem no mesmo seletor;
4. idioma e resolução são escolhidos antes da execução;
5. **Melhor disponível** é a resolução selecionada por padrão.

A interface possui:

- seletor de provedor na Home;
- idioma legendado ou dublado/PT-BR;
- resolução automática, 360p, 480p, 720p ou 1080p;
- botões para voltar à Home, aos resultados e pesquisar outro anime;
- filtro de episódios;
- atalhos avançados de instalação e reparo.

> O KitsuneDesk não hospeda conteúdo. Ele integra ferramentas e fontes externas instaladas no computador do usuário.

## GoAnime GUI

A busca gráfica utiliza um bridge local compilado a partir do código oficial do GoAnime. O bridge expõe somente operações estruturadas para o Electron:

```text
search   -> pesquisa e devolve resultados em JSON
episodes -> devolve episódios em JSON
stream   -> resolve a URL escolhida e devolve metadados
```

O bridge fica em:

```text
%LOCALAPPDATA%\KitsuneDesk\tools\goanime-bridge\goanime-bridge.exe
```

Para ativá-lo, clique em **Ativar GoAnime GUI**. O assistente:

1. confirma ou instala GoAnime e MPV;
2. confirma ou instala Git;
3. confirma ou instala Go;
4. baixa a versão compatível do GoAnime;
5. compila o bridge local;
6. verifica o executável criado.

O GoAnime clássico continua disponível na área de ferramentas avançadas e também no seletor principal da Home.

### Reprodução na interface gráfica

A versão 0.4.1 usa o mesmo resolvedor e o mesmo proxy de páginas intermediárias do GoAnime clássico antes de abrir o MPV. Isso é necessário principalmente para fontes PT-BR que entregam uma página do Blogger em vez de uma URL de vídeo direta. O KitsuneDesk também aguarda a inicialização do MPV antes de mostrar a confirmação de reprodução.

Depois de atualizar a partir da versão 0.4.0, selecione **GoAnime — Interface gráfica** e use **Ativar / atualizar GoAnime GUI** para recompilar o bridge 1.2.0.

## Provedores e ferramentas

| Componente | Uso | Situação |
|---|---|---|
| **GoAnime GUI** | Pesquisa, episódios e stream dentro do app | Principal e selecionado por padrão |
| **GoAnime clássico** | TUI original no terminal | Disponível no seletor principal |
| **anime-cli-br** | Fonte brasileira baseada em AnimeFire e VLC | Legado e manual |
| **ani-cli** | Provedor em Git Bash | Experimental e manual |
| **FAST Anime VSR** | Super-resolução de arquivos locais | Ferramenta opcional |

### anime-cli-br

O instalador agora cria um ambiente isolado com Python 3.10, 3.11 ou 3.12 em:

```text
%LOCALAPPDATA%\KitsuneDesk\tools\anime-cli-br\.venv
```

A instalação global feita anteriormente pelo Python 3.15 deixa de ser priorizada.

Antes de abrir o terminal, o KitsuneDesk verifica o DNS e a conexão HTTPS de `animefire.net`. Quando a fonte estiver indisponível, a aplicação mostra uma mensagem curta e não abre o traceback Python.

A indisponibilidade do domínio externo não pode ser corrigida pelo KitsuneDesk; nesse caso, use o GoAnime GUI.

### ani-cli

O ani-cli foi mantido no projeto e continua disponível manualmente. A qualidade é enviada no formato esperado:

```text
-q best
-q 720p
-q 1080p
```

O erro abaixo é tratado como problema externo conhecido:

```text
Episode is released, but no valid sources!
```

Quando isso acontecer, o terminal explica o problema e recomenda o GoAnime.

### FAST Anime VSR

FAST Anime VSR não é um provedor de streaming. Ele processa vídeos locais com super-resolução.

O preparador agora procura o Python 3.10 por:

- launcher `py`;
- pastas padrão;
- Registro do Windows;
- instalação pelo winget;
- instalador oficial do Python 3.10.11 como fallback.

Depois ele cria um ambiente virtual e instala as dependências básicas. CUDA, cuDNN, PyTorch, TensorRT e torch2trt continuam dependendo da GPU e precisam ser instalados em versões compatíveis.

## Instalação para desenvolvimento

### Requisitos

- Windows 10 ou 11 x64;
- Node.js;
- npm;
- PowerShell;
- internet para os assistentes de instalação.

### Executar

```powershell
npm install
npm run dev
```

Login inicial:

```text
Usuário: admin
Senha: admin123
```

Na primeira entrada, o sistema exige a troca da senha.

## Build do Windows

```powershell
npm run build:win
```

O instalador será gerado em:

```text
dist\KitsuneDesk-Setup-0.4.1.exe
```

## Arquitetura

```mermaid
flowchart TD
    UI[Renderer HTML/CSS/JS] --> PRELOAD[Preload seguro]
    PRELOAD --> IPC[Electron IPC]
    IPC --> CONTROLLER[PlayerController]
    CONTROLLER --> SERVICE[PlayerService]
    SERVICE --> BRIDGE[GoAnime bridge JSON]
    BRIDGE --> SOURCES[Fontes do GoAnime]
    SERVICE --> MPV[MPV]
    SERVICE --> LEGACY[Provedores legados]
    SERVICE --> TOOLS[FAST Anime VSR]
    UI --> DB[(SQLite local)]
```

O renderer não recebe acesso direto a `fs`, `child_process`, banco de dados ou `ipcRenderer`.

## Estrutura principal

```text
kitsunedesk/
├── resources/
│   ├── goanime-bridge/main.go
│   └── licenses/
├── scripts/windows/
│   ├── install-goanime-gui.ps1
│   ├── install-anime-cli-br.ps1
│   ├── install-ani-cli.ps1
│   └── prepare-fast-anime-vsr.ps1
├── src/
│   ├── main/
│   │   ├── controllers/
│   │   ├── ipc/
│   │   └── services/
│   └── renderer/
│       ├── pages/
│       ├── css/
│       └── js/
├── package.json
└── electron-builder.yml
```

## Tecnologias

- Electron;
- JavaScript puro;
- HTML5 e CSS3;
- Bootstrap e Bootstrap Icons;
- SQLite com better-sqlite3;
- bcryptjs;
- MPV;
- GoAnime;
- PowerShell;
- electron-builder;
- ESLint e Prettier.

## Diagnóstico

### GoAnime GUI não está pronto

Clique em **Ativar GoAnime GUI**, acompanhe o PowerShell até a mensagem de sucesso e depois clique em **Atualizar status**.

### anime-cli-br informa AnimeFire indisponível

O domínio não respondeu ao DNS ou HTTPS. Use GoAnime GUI e teste novamente mais tarde.

### ani-cli encontra o episódio, mas não reproduz

A fonte do ani-cli não entregou uma URL válida. Isso não impede o funcionamento do GoAnime GUI.

### FAST Anime VSR ainda não mostra CUDA pronta

O Python básico foi preparado, mas ainda faltam componentes compatíveis com a placa NVIDIA, principalmente PyTorch/CUDA.

## Licenças e projetos externos

Consulte [THIRD_PARTY.md](./THIRD_PARTY.md) e `resources/licenses/`.
