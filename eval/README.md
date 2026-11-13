# Evaluación de recuperación — Sprint 5

Este directorio contiene el gold set, el fixture ficticio y la plantilla manual
de calidad de respuesta. La explicación completa de métricas, RRF, reranking e
índice GIN está en la sección **Flujo de evaluación de recuperación (Sprint 5)**
del README principal.

## Archivos

| Archivo | Qué contiene |
| --- | --- |
| `gold-set.json` | 25 casos tipados: 20 respondibles y 5 no respondibles. Cada caso declara documento, chunks relevantes y hechos esperados. |
| `fixtures/fictional-documents.json` | Dos documentos ficticios con IDs deterministas: un contrato y un manual. No contiene datos reales. |
| `answer-quality-review.md` | Plantilla manual para revisar exactitud, fidelidad, citas y abstención de las respuestas del Sprint 4. |
| `reports/reference-report.json` | Ejecución real de referencia del comando de evaluación. Los reportes nuevos se ignoran por git. |

## Uso

```bash
npm run eval:seed
npm run eval:retrieval
npm run eval:retrieval -- --top-k 5 --candidates 20 --rrf-k 60
```

El primer comando inserta o reemplaza el fixture y genera sus embeddings
locales. El segundo ejecuta las estrategias vectorial, léxica, híbrida y
híbrida+rerank (si está configurada) sin llamar a un LLM. El reporte se escribe
en `eval/reports/retrieval-<fecha>.json`; `--out` permite elegir la ruta.

## Reglas

- No agregues documentos reales ni sensibles al fixture.
- No inventes resultados: el reporte debe salir de `npm run eval:retrieval`.
- Si editás el fixture o el gold set, volvé a ejecutar `npm run eval:seed`.
- Si activás el reranker, la pregunta y los chunks candidatos se envían a
  OpenRouter. El fixture ficticio está pensado para eso.
- La revisión de respuestas es manual en este sprint; no hay LLM juez.
