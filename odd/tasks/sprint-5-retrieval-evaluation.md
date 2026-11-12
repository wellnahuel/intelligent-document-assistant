# Feature: Sprint 5 — Retrieval evaluation, hybrid search and optional reranking

Objective: measure retrieval separately from answer quality, compare vector, lexical, hybrid (RRF) and optional rerank strategies on a small fictional gold set, and leave a reproducible evaluation CLI plus a manual answer-quality template.
Branch: `feat/sprint-5-retrieval-evaluation`, stacked on `feat/sprint-4-rag-answers`.
Delivery: work-unit commits on the feature branch; no push, PR or merge requested. Forecast: ~1,300 authored changed lines (code, tests, fixture, docs); no PR is requested, so the branch keeps reviewable work-unit commits without a chain strategy.
Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run eval:seed`, `npm run eval:retrieval`, migration status and a real report inspection. No build per project rule.

## Specs

- **S1 — Preconditions and preservation.** Before editing, inspect the current schema and services for documents, pages, chunks, embeddings, vector search and RAG answers. Preserve Sprint 1–4 behavior: upload, extraction, chunking, embedding generation, `/search`, `/ask`, error shapes and UI. If a dependency is missing, report it instead of simulating results. Do not use real or sensitive documents in evaluation fixtures.
- **S2 — Typed evaluation cases.** Create a typed JSON format with `id`, `question`, `documentId`, `relevantChunkIds`, `answerable` and optional `expectedFacts`. Validate it with Zod, including unique case ids, referenced document existence, referenced chunk existence and ownership by that document, and consistency between `answerable` and a non-empty relevant-chunk list. Ship a small manually reviewed gold set of 15–30 cases, including unanswerable questions.
- **S3 — Reproducible fictional fixture.** Add a small fixture made of fictional, non-sensitive documents with deterministic document, page and chunk ids. A seed command inserts or replaces the fixture rows and generates embeddings with the existing local provider, model id, revision and dimensions. Re-seeding is idempotent and makes no LLM calls. The gold set references exactly the fixture chunk ids; the loader rejects missing references.
- **S4 — Evaluation CLI without LLM calls.** Add `npm run eval:retrieval` that loads the gold set, computes each question embedding, runs the selected strategies, computes per-case and aggregate metrics, prints a per-strategy summary and writes one JSON report. The normal run must not call a chat LLM. The report records the evaluation date, embedding model id/revision/dimensions, topK, candidate count, RRF constant, dataset and fixture paths plus hashes, case counts, rerank status, per-strategy aggregates and per-case relevant ranks and latencies. Missing fixture data fails with a clear instruction; results are never fabricated.
- **S5 — Metrics.** Implement Recall@k, Precision@k and MRR with known inputs. Precision@k divides by `k`, not by the number actually returned; document that rule and apply it in every report. Recall@k divides by the number of relevant chunks. Cases with no relevant chunks are excluded from retrieval aggregates because they belong to abstention evaluation, and are reported separately. MRR uses the reciprocal rank of the first relevant item in the returned ranked list and contributes 0 when none appears. Deduplicate retrieved ids defensively. Moving a relevant item up must change the metrics as expected.
- **S6 — Vector strategy.** Reuse the existing query embedding and exact cosine search (`<=>`), filtered by document, model id, revision and dimensions, with configurable topK. Do not mix embeddings from incompatible models or revisions. Preserve the existing global `/search` behavior. Keep user filtering only if a user dimension exists; this application has none today, so document that limitation.
- **S7 — Lexical strategy.** Implement PostgreSQL full-text search with `to_tsvector('simple', content)` and `websearch_to_tsquery('simple', $query)`, fully parameterized. Return chunkId, documentId, pageNumber, chunkIndex, content and lexical score, scoped by document. Add a GIN expression index matching the query expression in a migration and document its storage/write cost and the decision. Empty, whitespace-only and punctuation-only queries must return no results without throwing; stopword-only queries must not error. Use a deterministic tie-break.
- **S8 — Hybrid strategy.** Implement Reciprocal Rank Fusion over vector and lexical ranked lists: `score(d) = Σ 1 / (k + rank_s(d))`, with a documented default `k = 60` and a configurable value. Do not sum cosine distance and lexical rank as if they shared a scale. A chunk present in both lists accumulates both contributions exactly once per source list; duplicates inside one list are removed before fusion. Keep each source's original rank and traceability in the fused result. Retrieve candidate lists with a configurable candidate count at least as large as topK, fuse and take topK. The same evaluation case must compare the vector baseline and the hybrid.
- **S9 — Optional reranking.** Define a `Reranker` interface that receives a query and candidates and returns the candidates ordered with relevance scores. Implement an optional OpenRouter client for `POST https://openrouter.ai/api/v1/rerank` with server-only key and model, timeout, safe handling of 429, 5xx, network failures, malformed JSON, empty results and invalid indices. Every returned index must be an integer inside the sent candidate range and appear at most once; unknown or duplicate indices are rejected. Record latency and usage (`search_units`, `total_tokens`, `cost`) without logging query or candidate text. Reranking is enabled only when a model and key are configured; otherwise the normal evaluation command records a skipped status and exits successfully. Do not assume a free or available model; document that enabling reranking sends the query and candidate chunks to an external provider.
- **S10 — Manual answer-quality review.** Add a manual template for Sprint 4 answers covering exactness, fidelity to the sources, citation validity (each citation points to a retrieved source and supports the claim) and abstention, plus latency and token fields. Do not add an LLM judge in this sprint. Do not change the answer prompt; if a change is proposed, explain how it would be evaluated before changing it.
- **S11 — Tests (Vitest).** Cover Recall@k, Precision@k and MRR with known data, cases without relevant chunks, RRF with duplicate documents across lists, empty lexical queries, reranker index validation and the OpenRouter rerank client with a mocked fetch (success, timeout, 429/5xx, malformed response, invalid index). Do not claim tests ran unless they were executed. Keep the existing chunking, embedding and RAG suites passing.
- **S12 — Documentation and honest deliverables.** Update README and `.env.example` with the evaluation flow, metric definitions, RRF explanation, migration/index decision, new modules, environment variables, commands, report format, the external-data caveat for reranking, dataset limits and next steps. Provide an illustrative report example clearly marked as illustrative, or a real report generated by the command. Do not invent results or claim one strategy is better without executing the command.
- **S13 — Scope guard.** Do not add an LLM judge, change the Sprint 4 answer prompt, wire hybrid search or reranking into `/api/ask` or change `/search` behavior, add ANN indexes, add authentication or add unrelated UI. Add only `tsx` as a dev dependency for the TypeScript CLI if needed, and document it.
- **S14 — Compatibility.** Existing upload, extraction, chunking, embedding generation, `/search`, `/ask`, error shapes and UI keep working. New environment variables are optional. The `simple` text-search configuration is an explicit starting point, not a language-specific stemmer; document that Spanish and Italian stemming is future work.

## Tasks

| ID | Specs | Route | Status | Commit / evidence |
| --- | --- | --- | --- | --- |
| T1 | S1 | inline | done | Inspected schema, embeddings, vector SQL, RAG flow, tests, env and local DB; Sprint 4 present; branch created |
| T2 | S2, S5, S6 | inline | done | `d4bf75d`; `src/lib/retrieval/types.ts`, `config.ts`, `src/lib/evaluation/dataset.ts`, `metrics.ts`; 18 tests |
| T3 | S7, S8 | delegated | done | `de7eb78`, `6065b4c`; parallel writer A: `lexical.ts`, `rrf.ts`, `hybrid.ts`, `vector.ts`; lexical OR fix by parent |
| T4 | S9 | delegated | done | `3c7c979`; parallel writer B: `reranker.ts`, `openrouter-reranker.ts`; 24 mocked tests |
| T5 | S2, S3 | inline | done | `4b40131`; `eval/fixtures/fictional-documents.json`, `eval/gold-set.json`, `scripts/eval-seed.ts`; 2 docs/21 chunks/21 embeddings |
| T6 | S4, S5 | inline | done | `4b40131`, `198372c`; `src/lib/evaluation/run.ts`, `report.ts`, `scripts/eval-retrieval.ts`; real report and denominator disclosure |
| T7 | S7 | inline | done | `65cc910`; `20261112220247_add_document_chunk_fts_index`; index applied and usable |
| T8 | S10, S12 | inline | done | `09c96b8`; `eval/answer-quality-review.md`, README, `.env.example`, `eval/README.md` |
| T9 | S1–S14 | delegated | done | `198372c`; verifier `pass_with_advisories`, no blockers; 12 chunker + 169 Vitest; native review unavailable (`unassessable` runtime) |
| T10 | S1–S14 | inline | done | Final report in the conversation; no push/PR/merge |

Route note: T3 and T4 are independent units with disjoint edit surfaces, each several files and well over 100 changed lines, so two bounded writers run in parallel after T2 publishes the shared types and config. T5–T8 depend on the shared contracts and run inline once the writers return. The feature names high-risk item 1 (a new database migration/index) and item 2 (an external rerank provider with a server-only secret); one independent verifier runs at the end. No PR is requested; commits stay as work units on the feature branch.

## Log

### L1 — User request (verbatim)

````text
# Sprint 5: evaluar y mejorar la recuperación

En el Sprint 4 ya conectamos búsqueda y generación. Ahora vamos a medir cada parte por separado para responder dos preguntas:

1. **¿La búsqueda recupera los fragmentos que necesitamos?**
2. **¿La respuesta usa esos fragmentos correctamente y los cita bien?**

Después vamos a comparar tres estrategias: búsqueda vectorial, búsqueda híbrida y reranking. En RAG, el reranking suele recibir candidatos recuperados y volver a ordenarlos antes de enviarlos al modelo. 

## 1. Armar un conjunto de evaluación

Necesitamos preguntas cuya respuesta conozcamos y fragmentos relevantes identificados de antemano. Eso forma nuestro pequeño **gold set**:

```json
{
  "id": "q-01",
  "question": "¿Cuántos días de aviso exige el contrato?",
  "documentId": "doc-demo",
  "relevantChunkIds": ["chunk-12", "chunk-13"],
  "answerable": true,
  "expectedFacts": ["Se requieren treinta días de aviso."]
}
```

Y también preguntas que el documento no pueda responder:

```json
{
  "id": "q-02",
  "question": "¿Cuál es el número de teléfono del propietario?",
  "documentId": "doc-demo",
  "relevantChunkIds": [],
  "answerable": false,
  "expectedFacts": []
}
```

Para empezar, alcanza con unas **15–30 preguntas** creadas y revisadas manualmente. No las vamos a generar con el mismo modelo que después evaluaremos: necesitamos respuestas de referencia independientes.

## 2. Medir la búsqueda

Supongamos que la respuesta está en `chunk-12` y `chunk-13`, y la búsqueda devuelve:

```text
1. chunk-7
2. chunk-12
3. chunk-18
4. chunk-13
5. chunk-2
```

Tres métricas útiles:

- **Recall@k:** qué proporción de los fragmentos relevantes apareció entre los primeros `k`.
- **Precision@k:** qué proporción de los primeros `k` resultados era relevante.
- **MRR:** qué tan arriba apareció el primer fragmento relevante. Si apareció en el segundo puesto, aporta `1/2`.

Estas métricas ayudan a diagnosticar problemas distintos. Un Recall bajo indica que el fragmento importante ni siquiera aparece en los candidatos. Un MRR bajo indica que suele aparecer, pero demasiado abajo en la lista.

## 3. Medir la respuesta generada

Una buena búsqueda no garantiza una buena respuesta. Vamos a revisar por separado:

| Aspecto | Qué comprobamos |
|---|---|
| Exactitud | ¿La respuesta contiene los hechos esperados? |
| Fidelidad | ¿Cada afirmación importante está respaldada por las fuentes? |
| Citas | ¿Las citas apuntan a fuentes recuperadas que sostienen la afirmación? |
| Abstención | ¿Reconoce cuando el documento no contiene la respuesta? |
| Latencia y uso | ¿Cuánto tarda y cuántos tokens consume? |

Para este sprint empezamos con evaluación manual y registro estructurado. Un juez basado en LLM puede servir más adelante, pero también puede equivocarse y agregar costo.

## 4. Búsqueda híbrida

La búsqueda vectorial encuentra textos de significado parecido. La búsqueda de texto completo encuentra coincidencias de términos. Combinarlas puede ayudar en preguntas con nombres, códigos, fechas o números exactos.

PostgreSQL ofrece `tsvector` para representar texto y `tsquery` para representar consultas. También tiene funciones para transformar y comparar texto con consultas. 

Ejemplo ilustrativo:

```sql
SELECT
  id,
  ts_rank_cd(
    to_tsvector('simple', content),
    websearch_to_tsquery('simple', $1)
  ) AS lexical_score
FROM "DocumentChunk"
WHERE to_tsvector('simple', content)
      @@ websearch_to_tsquery('simple', $1)
ORDER BY lexical_score DESC
LIMIT 20;
```

Usar `simple` acá es un punto de partida que evita depender del stemming de un solo idioma. Más adelante podemos evaluar configuraciones para documentos en español o italiano.

### Cómo combinar resultados sin mezclar escalas

La distancia vectorial y la relevancia de texto completo no tienen necesariamente escalas comparables. En vez de sumarlas directamente, podemos combinar las posiciones de los chunks con **Reciprocal Rank Fusion (RRF)**:

\[
\operatorname{RRF}(d)=\sum_s \frac{1}{k+\operatorname{rank}_s(d)}
\]

Un chunk que queda bien posicionado en ambos rankings sube en el resultado combinado. Así comparamos una búsqueda vectorial con una híbrida sin asumir que sus scores tienen el mismo significado.

## 5. Reranking

El reranker recibe la pregunta y una lista chica de candidatos. En vez de representar cada texto por separado, compara la pregunta y cada candidato juntos y los vuelve a ordenar.

Una secuencia posible:

```text
Búsqueda vectorial: primeros 20
Búsqueda léxica:    primeros 20
RRF:                mejores 20 combinados
Reranker opcional:  mejores 5
LLM:                responde con esos 5
```

OpenRouter ofrece un endpoint de reranking en `/api/v1/rerank`, que recibe el modelo, la pregunta y los documentos candidatos. El modelo disponible y su precio pueden cambiar; por eso el reranking va a ser opcional y configurable, no una dependencia obligatoria del sistema. 

Si usamos ese endpoint, los textos recuperados salen de nuestro entorno y se envían a un proveedor externo. Para los primeros experimentos, usá documentos de prueba que puedas compartir.

## Objetivos del sprint

- Crear un conjunto pequeño de evaluación con preguntas respondibles y no respondibles.
- Medir Recall@k, Precision@k y MRR de búsqueda vectorial.
- Agregar búsqueda léxica con PostgreSQL y comparar sus resultados.
- Combinar rankings con RRF y medir otra vez.
- Dejar un adaptador de reranking opcional para comparar cuando haya un modelo disponible.
- Crear una revisión manual de calidad de respuesta y citas.
- Registrar configuración, modelo, latencia y resultados para poder reproducir cada comparación.

## Prompt para OpenCode

```text
Actuá como desarrollador senior de TypeScript, PostgreSQL y aplicaciones RAG. Implementá el Sprint 5 de Intelligent Document Assistant: evaluación de recuperación, búsqueda híbrida y reranking opcional.

CONTEXTO
Este proyecto se desarrolla por sprints. Inspeccioná el repositorio actual antes de cambiarlo. No asumas que los sprints anteriores fueron implementados ni reemplaces código existente sin justificarlo.

ANTES DE EDITAR
1. Verificá las entidades y servicios existentes para documentos, páginas, chunks, embeddings, búsqueda vectorial y respuestas.
2. Explicá brevemente qué encontraste y qué archivos vas a modificar.
3. Si falta una dependencia, indicá cuál y proponé un cambio mínimo compatible.
4. No uses documentos reales sensibles para crear fixtures de evaluación.

OBJETIVO
Crear un flujo reproducible para evaluar la recuperación de fragmentos y comparar:
A. búsqueda vectorial;
B. búsqueda de texto completo;
C. búsqueda híbrida combinada con RRF;
D. reranking opcional de candidatos, si está configurado.

EVALUACIÓN
1. Crear un formato tipado de casos de evaluación con:
   - id
   - question
   - documentId
   - relevantChunkIds
   - answerable
   - expectedFacts opcional
2. Agregar un fixture pequeño con documentos de prueba y casos conocidos.
3. Crear un comando CLI, por ejemplo `pnpm eval:retrieval`, que ejecute los casos sin llamadas al LLM.
4. Calcular Recall@k, Precision@k y MRR para cada estrategia.
5. Documentar si Precision@k divide por k o por la cantidad efectivamente devuelta, y aplicar la misma regla en todos los reportes.
6. Mostrar los resultados por estrategia y un resumen agregado reproducible.
7. Guardar parámetros, modelo de embedding, k y fecha de evaluación en la salida.
8. No inventar resultados de evaluación ni afirmar que una estrategia es mejor sin ejecutar el comando.

BÚSQUEDA VECTORIAL
- Reutilizar el proveedor y la consulta vectorial existentes.
- Mantener filtros de documento y usuario existentes.
- No mezclar embeddings de modelos o revisiones incompatibles.
- Mantener topK configurable.

BÚSQUEDA LÉXICA
- Implementar búsqueda de texto completo en PostgreSQL con tsvector/tsquery.
- Empezar con configuración `simple` para evitar depender de un único idioma.
- Usar consulta parametrizada.
- Usar un índice GIN si es compatible con el esquema y migración existentes; documentar el costo y la decisión.
- Preservar documentId, página, chunkId y contenido para las citas.
- Evitar que consultas vacías o solo de stopwords provoquen errores.

BÚSQUEDA HÍBRIDA
- Implementar Reciprocal Rank Fusion sobre las listas de resultados vectoriales y léxicos.
- No sumar directamente distancia coseno y ranking léxico como si fueran la misma escala.
- Definir y documentar la constante RRF y el tratamiento de duplicados.
- Mantener la trazabilidad del ranking original de cada fuente.
- Permitir comparar resultados del vector baseline y del híbrido en el mismo caso de evaluación.

RERANKING OPCIONAL
- Crear una interfaz Reranker que reciba query y candidatos y devuelva los candidatos ordenados.
- Implementar cliente opcional de OpenRouter mediante POST /api/v1/rerank.
- Configurar clave y modelo exclusivamente con variables del servidor.
- Dejar reranking desactivado si no hay configuración.
- Manejar timeout, 429, 5xx y errores de respuesta.
- Validar que los índices devueltos por el proveedor correspondan a candidatos enviados.
- Registrar latencia y usage si está disponible, sin registrar texto sensible.
- No asumir que hay un modelo gratuito disponible; no hacer que el comando normal falle por no tenerlo.
- Documentar que la consulta y los fragmentos candidatos se envían a un proveedor externo cuando se activa.

CALIDAD DE RESPUESTA
- Crear una plantilla manual para evaluar respuestas del Sprint 4:
  exactitud, fidelidad a las fuentes, validez de las citas y abstención.
- No agregar un LLM juez en este sprint.
- No modificar el prompt de respuesta sin explicar cómo se evaluaría el cambio.

PRUEBAS
Usar Vitest para probar:
- métricas Recall@k, Precision@k y MRR con datos conocidos;
- casos sin chunks relevantes;
- combinación RRF con documentos duplicados entre listas;
- consultas léxicas vacías;
- validación de índices del reranker.
Mockear el proveedor remoto.
No afirmar que se ejecutaron pruebas si no se ejecutaron.

ENTREGA
Al final:
1. Explicá qué problema mide cada métrica.
2. Explicá cómo funciona RRF y por qué no sumamos scores incompatibles.
3. Enumerá las migraciones, módulos y variables de entorno.
4. Proporcioná el comando para ejecutar la evaluación.
5. Incluí un ejemplo de reporte sin inventar resultados reales.
6. Indicá límites del dataset y próximos pasos para mejorar la evaluación.
```

## Comprobaciones manuales

- Crear preguntas cuyo fragmento relevante conozcas y confirmar que estén en el dataset.
- Comparar qué devuelve la búsqueda vectorial y qué devuelve la híbrida.
- Revisar si los resultados léxicos ayudan con nombres, números o códigos exactos.
- Confirmar que las métricas cambian como se espera al mover un resultado relevante de posición.
- Activar el reranker solo con un modelo configurado y comparar el orden antes y después.
- Revisar una respuesta y comprobar manualmente que cada cita respalda la afirmación correspondiente.

## Preguntas de repaso

1. ¿Qué diferencia hay entre evaluar la recuperación y evaluar la respuesta generada?
2. Si Recall@5 es bajo, ¿qué parte del pipeline conviene investigar primero?
3. ¿Por qué la búsqueda léxica puede encontrar un código exacto que la búsqueda vectorial no priorice?
4. ¿Qué combina RRF: los scores originales o las posiciones de los resultados?
5. ¿Qué agrega el reranker y qué costo puede introducir?
6. ¿Por qué necesitamos etiquetar manualmente qué chunks son relevantes en el conjunto de evaluación?
````

### L2 — Repository inspection and scope decisions

Sprint 4 is present and closed on `feat/sprint-4-rag-answers`: `Document`, `DocumentPage`, `DocumentChunk`, `ChunkEmbedding` with `vector(384)`, exact cosine search, the local E5 provider, `/api/ask` and the `/ask` UI all exist. The schema has no user model, so the only existing retrieval filter is `documentId`; no user filter was invented. The local database had five chunks from two non-eval documents; the Sprint 5 fixture uses reserved `eval-` ids to avoid touching them. Added `tsx` as the only new dev dependency because the TypeScript CLI must run outside Next.js and path aliases/`server-only` cannot be loaded by plain `node --experimental-strip-types`.

### L3 — Lexical AND defect found by the real run

The first real `eval:retrieval` run returned 0 lexical hits for every case. Direct PostgreSQL probes showed `websearch_to_tsquery('simple', '<full question>')` joins every word with AND, so a chunk would have to contain all question words. Fixed in `src/lib/retrieval/lexical.ts` by extracting Unicode letter/number terms (preserving codes such as `ESC-104`), lowercasing/deduplicating them, quoting each one and joining with ` or ` before sending the string as a bound parameter to `websearch_to_tsquery`. The GIN expression still matches `to_tsvector('simple', content)`. After the fix, lexical Recall@5 rose from 0.0000 to 0.9500. The lexical tests were updated to assert the OR expression and parameter binding.

### L4 — Real evaluation and metric decisions

`npm run eval:seed` loaded 2 fictional documents, 21 chunks and 21 embeddings with `Xenova/multilingual-e5-small@761b726...` (384 dimensions). `npm run eval:retrieval` over 25 cases (20 answerable, 5 unanswerable) produced: vector Recall@5 1.0000, Precision@5 0.2100, MRR 0.9667; lexical 0.9500 / 0.2000 / 0.6350; hybrid 1.0000 / 0.2100 / 0.9000; hybrid-rerank skipped (`missing_model`). Precision@5 divides by k, so the maximum for a single relevant chunk is 0.2; the 0.21 average comes from q-06 having two relevant chunks. `--top-k 1` lowered vector Recall to 0.9250 and MRR to 0.9500, confirming the cutoff changes metrics as expected. `--no-rerank` exited successfully with `disabled_by_flag`. No result was invented; the real report is `eval/reports/reference-report.json`.

### L5 — Migration and index evidence

`npx prisma migrate dev --create-only --name add_document_chunk_fts_index` created `20261112220247_add_document_chunk_fts_index`; the SQL was edited to add the GIN expression index and applied with `prisma migrate deploy`. `pg_indexes` shows `DocumentChunk_content_simple_fts_idx` on `to_tsvector('simple'::regconfig, content)`. With `enable_seqscan = off`, `EXPLAIN` shows `Bitmap Index Scan on DocumentChunk_content_simple_fts_idx`; on the tiny corpus the planner may choose a sequential scan. Prisma cannot declare expression indexes in `schema.prisma`, so the schema has a warning comment and future `--create-only` migrations must be reviewed.

### L6 — Verification evidence

`npm run typecheck` and `npm run lint` pass. `npm test` passes with 12 chunker tests and 161 Vitest tests in 18 files (the previous 65-test RAG/embedding suite is included). `npx prisma migrate status` reports 4 migrations applied and the schema up to date. The real evaluation command, the `--top-k 1` probe and the `--no-rerank` probe ran against the local PostgreSQL/pgvector and local E5 model. Reranking was not executed against the real provider because no `RERANK_MODEL` is configured; its client is covered by mocked fetch tests for success, timeout, 429/500, malformed JSON/shape, upstream error, empty results and invalid/duplicate/out-of-range indices. No real OpenRouter generation call was made in this sprint, no `next build` was run (project rule), and no push/PR/merge was performed.

### L7 — Independent verification and advisory correction

The independent verifier returned `pass_with_advisories` with no blockers. It reproduced the reference metrics, checked the fixture/gold set hashes, the GIN index, the non-eval document rows, the no-LLM eval path, the prompt/API/UI diffs and the full suite. Advisory: aggregate means were computed over successful cases only without an explicit denominator. Fixed by adding `metricCaseCount` to each strategy aggregate, printing the denominator when it differs from `answerableCaseCount`, and regenerating `eval/reports/reference-report.json`. The verifier's durable probes were added as `tests/unit/sprint5-verification.test.ts` (8 assertions covering S2/S3, S5, S7, S8 and S9). Final suite: 12 chunker + 169 Vitest tests in 19 files. The native receipt review could not run because the active OpenCode runtime is not eligible for immutable review (`unassessable`); the switch stays on by default and was not changed. No push, PR or merge was performed.
