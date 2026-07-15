# Performance da v0.15.0

O benchmark pode ser repetido com:

```powershell
npm run benchmark:startup
```

Cada rodada executa 20 aberturas frias e 20 aberturas quentes, usando um perfil local isolado. Os arquivos JSON preservam todas as amostras em `artifacts/`.

## Comparativo com a v0.14.0

| Cenário                                   |                v0.14.0 |                v0.15.0 | Resultado                                 |
| ----------------------------------------- | ---------------------: | ---------------------: | ----------------------------------------- |
| Abertura fria, mediana de `coreReadyMs`   |                  31 ms |                  28 ms | 9,7% menor                                |
| Abertura fria, P95 de `coreReadyMs`       |                  39 ms |                  58 ms | meta não atingida; duas amostras atípicas |
| Abertura quente, mediana de `coreReadyMs` |                  28 ms |                  24 ms | 14,3% menor                               |
| Abertura quente, P95 de `coreReadyMs`     |                  34 ms |                  44 ms | meta não atingida                         |
| Memória ociosa mediana                    | aproximadamente 360 MB | aproximadamente 360 MB | estável                                   |
| Instalador Windows                        |      125.281.891 bytes |      108.476.666 bytes | 13,4% menor                               |

As metas de reduzir a mediana em 30%, o P95 em 20% e a memória em 10–15% não foram atingidas neste hardware. Por isso, a v0.15.0 é descrita como uma release estável com melhorias de desempenho, e não como uma release que concluiu todas as metas de otimização.

O ganho mais determinístico está no fallback SQLite: os testes que anteriormente levavam aproximadamente 1,95 s e 2,78 s passaram para aproximadamente 1,0 s e 0,45–0,58 s sem criar um processo Node por consulta. O tamanho do instalador também superou a meta estabelecida.

Não foi desativada a aceleração gráfica para reduzir memória artificialmente, porque isso poderia degradar o player embutido e a renderização de vídeo. O MPV externo continua sendo o modo padrão estável.
