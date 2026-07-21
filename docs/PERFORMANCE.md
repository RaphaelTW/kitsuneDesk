# Performance da v0.17.0

## Resultado pós-refatoração

Uma amostra curta de três aberturas frias e três quentes, registrada em `artifacts/post-refactor.json`, mediu 9 ms de mediana e 346,4 MB na abertura fria, e 11 ms e 344,3 MB na abertura quente. A amostra confirma a ausência de regressão imediata; comparações de release continuam exigindo as 20 iterações descritas abaixo.

O benchmark pode ser repetido com:

```powershell
npm run benchmark:startup
```

Uma avaliação mais curta de memória pode ser executada com:

```powershell
npm run benchmark:memory
```

O relatório separa a memória por processo (`Browser`, `Tab`, `GPU` e serviços
utilitários), registra as versões de Electron/Chromium/Node e o estado dos recursos da
GPU. Para comparar uma versão futura sem alterar primeiro o projeto, informe o executável:

```powershell
node scripts/benchmark-startup.js --iterations 5 --label electron-candidate `
  --electron-executable "C:\caminho\para\electron.exe" `
  --output artifacts/memory-electron-candidate.json
```

A comparação só é válida na mesma máquina, com o mesmo perfil e quantidade de iterações.
O relatório também registra se encontrou `--disable-gpu` ou `--disable-gpu-compositing`;
o aplicativo não chama `disableHardwareAcceleration()`.

Cada rodada executa 20 aberturas frias e 20 aberturas quentes, usando um perfil local isolado. Os arquivos JSON preservam todas as amostras em `artifacts/`.

## Avaliação para uma atualização futura do Electron

A avaliação comparou cinco aberturas frias e cinco quentes na mesma máquina. A atualização
de Electron 43.0.0 para 43.1.1 foi adotada porque reduziu a mediana de memória e manteve
ativos `gpu_compositing`, `video_decode`, `video_encode`, WebGL e WebGPU.

| Cenário                | Electron 43.0.0 | Electron 43.1.1 |  Resultado |
| ---------------------- | --------------: | --------------: | ---------: |
| Memória fria mediana   |        362,3 MB |        349,1 MB | 3,6% menor |
| Memória quente mediana |        360,2 MB |        344,1 MB | 4,5% menor |
| GPU fria mediana       |         96,2 MB |         92,4 MB | 4,0% menor |
| Renderer frio mediano  |        108,0 MB |        105,4 MB | 2,4% menor |

Os relatórios completos estão em `artifacts/memory-current.json` e
`artifacts/memory-electron-43.1.1.json`.

A análise também concluiu que não existe uma configuração adicional segura que garanta
redução sem afetar vídeo: a aplicação já usa uma única janela, sandbox,
`contextIsolation`, `spellcheck: false`, fragmentos sob demanda e cache com limite. Flags
que removem o processo GPU ou forçam renderização por software foram descartadas.

Assim, a decisão de atualizar o Electron passa a ser baseada na mediana total e na divisão
por processo produzidas pelo benchmark. A versão candidata deve manter os testes MP4/HLS,
não apresentar switches de GPU desativada e demonstrar redução consistente antes de ser
adotada.

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
