# Ferramentas e projetos externos

O KitsuneDesk não hospeda conteúdo. A integração depende de projetos externos e de suas respectivas fontes.

## GoAnime

- Repositório: `https://github.com/alvarorichard/GoAnime`
- Licença: MIT
- Uso: pesquisa, episódios, resolução de streams e MPV.
- Integração gráfica: o KitsuneDesk inclui um pequeno bridge próprio em Go. O assistente baixa a versão oficial compatível do GoAnime e compila o bridge localmente no computador do usuário.
- Cópia da licença: `resources/licenses/GoAnime-LICENSE.txt`.

## ani-cli

- Repositório: `https://github.com/pystardust/ani-cli`
- Uso: alternativa experimental executada pelo Git Bash.
- O código do ani-cli não é redistribuído no pacote do KitsuneDesk; o assistente usa o Scoop.

## anime-cli-br

- Repositório: `https://github.com/MtywX/anime-cli-br`
- Uso: alternativa legada baseada em AnimeFire e VLC.
- O código é clonado no computador do usuário pelo assistente e instalado em ambiente Python isolado.
- O repositório consultado não apresenta arquivo de licença explícito; o KitsuneDesk não incorpora seu código-fonte no pacote.

## FAST Anime VSR

- Repositório: `https://github.com/Kiteretsu77/FAST_Anime_VSR`
- Uso: preparação opcional para super-resolução de vídeos locais.
- Não é um provedor de streaming.
- O repositório é clonado no computador do usuário e não é redistribuído no pacote do KitsuneDesk.

## Bootstrap e Bootstrap Icons

As licenças ficam em `resources/licenses/`.
