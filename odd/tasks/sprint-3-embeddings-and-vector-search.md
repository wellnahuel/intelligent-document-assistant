# Feature: Sprint 3 — Local embeddings and vector search

Objective: generate local embeddings for every existing `DocumentChunk` with `Xenova/multilingual-e5-small`, persist them in PostgreSQL with pgvector, and add a diagnostic search that returns the closest chunks for a question. No generative answer in this sprint.
Branch: `feat/sprint-3-embeddings` (to be created from `feat/sprint-2-chunking`).
Delivery: one work unit per commit slice; no PR/remote delivery requested.
Checks: `npm test` (chunking + Vitest), `npm run typecheck`, `npm run lint`, Prisma migration against the local PostgreSQL on port 5434, real local inference through `next dev`, HTTP smoke tests, SQL idempotency/dimension/ordering checks, partial-failure drill.

## Specs

- **S1 — Preconditions and preservation.** Before editing, inspect the current schema and data. Confirm that a `Document` has `DocumentPage` rows and that `DocumentChunk` rows exist. Preserve Sprint 1 (upload, extraction, library, detail, API, errors) and Sprint 2 (chunker, chunk regeneration, traceability). Never duplicate tables or replace prior implementations. If documents/pages/chunks are missing, report it before changing the schema.
- **S2 — Embedding provider.** Use `@huggingface/transformers` (Transformers.js) locally in the Node.js runtime, never Edge. Load `Xenova/multilingual-e5-small` lazily and reuse one instance per process. Expose `EmbeddingProvider` with `embedPassages(texts)` and `embedQuery(text)`. Prefix every passage with `"passage: "` and every question with `"query: "`. Use mean pooling and L2 normalization. Validate every returned vector: exactly 384 finite numbers. Do not add an OpenRouter key. Document that the first call may download the model into a local cache.
- **S3 — Model metadata and configuration.** Read model id, revision, cache directory, and batch size from environment variables with safe defaults. Pin the default revision to the Hugging Face commit `761b726dd34fb83930e26aab4e9ac3899aa1fa78` (the revision of `Xenova/multilingual-e5-small` inspected for this sprint). Persist `modelId`, `modelRevision`, and `dimensions` with every embedding. Vectors from different model id/revision are never compared in one search.
- **S4 — Schema and migration.** Enable pgvector with `CREATE EXTENSION IF NOT EXISTS vector` in a SQL migration. Add `ChunkEmbedding` related to `DocumentChunk`: `id`, `chunkId`, `modelId`, `modelRevision`, `dimensions`, `embedding vector(384)`, `createdAt`. Use a unique constraint on `(chunkId, modelId, modelRevision)`, an index for the model filter, and a foreign key with `ON DELETE CASCADE`. Keep the vector column as `vector(384)`; Prisma may expose it as `Unsupported`, so every vector read/write/search uses parameterized raw SQL. Never use `$queryRawUnsafe` or string-concatenated user input. Validate dimension and reject `NaN`/`Infinity` before persistence.
- **S5 — Idempotent generation.** Add a per-document “Generar embeddings” action. Fail clearly if the document has no chunks. Process chunks in small batches. Skip rows that already exist for the same chunk/model/revision unless the caller explicitly requests regeneration. Upsert with a unique-conflict target so repeated runs never duplicate. Report `complete`, `partial`, or `failed`; a document without chunks fails with HTTP 409. A partial run must say how many chunks were generated, skipped, or failed and must not claim the whole document succeeded. Never log full document text. Do not regenerate existing rows unless `regenerate: true`.
- **S6 — Diagnostic search.** Add a search screen and API that accepts a question. Validate and limit its length. Generate the query embedding with the `query: ` prefix. Run exact cosine-distance search with `<=>`, filter by current `modelId`, `modelRevision`, and dimensions, order ascending by distance, and return a configurable `topK` (default 5, bounded maximum). Return chunk content, source page number, document name, and cosine distance. Do not apply an invented distance threshold. Do not call a generative model. Do not expose full vectors in the API or UI.
- **S7 — Security and access.** Validate query length and `topK` server-side. Use parameterized SQL. Respect the existing access model: this local app has no authentication or per-user isolation, so all documents in the single-tenant library are searchable; document that limitation instead of inventing user filters or document ids. Do not allow a client-supplied model id to select arbitrary vector sets.
- **S8 — Unit tests (Vitest).** Add Vitest tests for pure functions: exact dimension validation, rejection of `NaN`/`Infinity`, formatting vectors for parameterized insertion, `passage:`/`query:` prefix application (including through the provider with a fake extractor), and query/topK validation. Keep the existing `node:test` chunking suite working.
- **S9 — UI.** Keep CSS Modules and the existing visual language. Add an embeddings panel to the document detail with counts, model metadata, loading/success/partial/error states, a “Generar embeddings” action, and an explicit “Regenerar todos” action when rows already exist. Add a `/search` page with question input, topK control, loading/empty/error states, and results showing document, page, distance, and text. Update the global sprint label to Sprint 3 and link the search page.
- **S10 — Documentation and honest verification.** Update README with what an embedding is, cosine distance, the chunk → embedding → search flow, migrations, dependencies, environment variables, commands, idempotency, partial-failure behavior, manual checks, and known limits. Run the actual checks: typecheck, lint, unit tests, migration status, real model inference, database dimension/idempotency checks, HTTP search ordering, invalid-input responses, and a forced partial failure. Do not claim PostgreSQL or inference was tested when only unit tests ran.
- **S11 — Scope guard.** Do not implement generative answers/chat, reranking, hybrid search, HNSW/IVFFlat indexes, OCR, or unrelated redesigns. No LangChain or other RAG framework.
- **S12 — Compatibility.** Existing upload, extraction, list, detail, chunk generation, error shape, and styles keep working. Deleting a chunk/document must cascade to its embeddings.

## Tasks

| ID | Specs | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| T1 | S4, S12 | inline | done | `prisma/schema.prisma`; migration `20261112153534_add_chunk_embeddings`; vector 0.8.7 installed; `migrate status` up to date |
| T2 | S2, S3, S8 | inline | done | `config.ts`, `vector.ts`, `types.ts`; 37 Vitest tests passing |
| T3 | S2, S3 | inline | done | `provider-core.ts`, `provider.ts`; real inference 384 dims, norm 1.0; singleton reused across searches |
| T4 | S4, S5 | inline | done | `store.ts`, `generate.ts`; 2 generated → 0/2 skip → 2 regenerate; forced partial 1/1 and recovery |
| T5 | S5, S9 | inline | done | `summary.ts`, `DocumentEmbeddingsPanel.tsx`, `DocumentDetail.tsx`; detail shows 2/2 and regenerate action |
| T6 | S6, S7 | inline | done | `search.ts`, `store.ts`, `api/search/route.ts`; exact `<=>`, filters, topK, no vectors |
| T7 | S6, S9 | inline | done | `app/search/page.tsx`, `SearchPanel.tsx`, nav and Sprint 3 labels |
| T8 | S3, S10 | inline | done | `README.md`, `.env.example`, `.gitignore`, scripts, `next.config.ts`, `vitest.config.ts` |
| T9 | S8, S10 | inline | done | typecheck, lint, 12 chunking + 37 Vitest, migration, real inference, SQL/HTTP checks, partial failure, model isolation, cascade |
| T10 | S10 | inline | done | Final response with design, flow, files, commands, limits |

Route note: T1–T10 are sequential and share the same types/schema/API surface; there are no independent units with disjoint edit surfaces that justify parallel writers. The parent works inline. A single independent verifier runs at the end because the feature names high-risk items 1 (new persisted data/migration), 2 (security: SQL injection, query validation), and 3 (new API contract).

## Log

### L1 — User request (verbatim)

````text
# Sprint 3: embeddings y búsqueda vectorial

Ahora sí: pasamos a **generar embeddings para los chunks y guardarlos en pgvector**. La meta de este sprint es poder buscar fragmentos por similitud semántica y ver cuáles recupera una pregunta, todavía sin pedirle una respuesta al LLM.

No doy por hecho que tu repositorio ya tenga terminados los sprints anteriores. El prompt le pide a OpenCode revisar la estructura y avisar si faltan las páginas o los chunks necesarios.

## Qué es un embedding

Un embedding es una lista de números que representa un texto:

```text
"El contrato se puede cancelar con treinta días de aviso"
→ [0.13, -0.08, 0.41, ...]
```

No es una traducción directa ni una descripción que podamos leer. Es una representación numérica que el modelo construye para facilitar comparaciones entre textos.

Si dos textos tratan temas parecidos, sus vectores suelen quedar más cerca según la métrica elegida. Esto permite encontrar una cláusula relevante aunque la pregunta no repita exactamente las palabras del PDF.

## Similitud coseno

Una forma común de comparar dos vectores es medir el ángulo entre ellos:

\[
\operatorname{similitud}(A,B)=
\frac{A\cdot B}{\|A\|\|B\|}
\]

Por ejemplo, `[1, 0]` y `[0.9, 0.1]` apuntan casi en la misma dirección y tienen similitud cercana a `0.994`. `[1, 0]` y `[0, 1]` apuntan en direcciones distintas.

En pgvector, el operador `<=>` calcula **distancia coseno**. Menor distancia significa mayor similitud; si necesitamos mostrar similitud, se puede calcular como `1 - distancia`.

## Decisión para el proyecto: embeddings locales

Para empezar, vamos a ejecutar embeddings localmente con `Transformers.js` y el modelo multilingüe `Xenova/multilingual-e5-small`. Tiene una variante compatible con Transformers.js; el modelo original E5 recomienda usar el prefijo `passage:` al representar los fragmentos y `query:` al representar las preguntas. Son parte de cómo fue entrenado, así que hay que respetarlos.

Ejemplo conceptual:

```ts
const passage = await embed("passage: " + chunkText);
const query = await embed("query: " + question);
```

La primera carga del modelo puede descargar archivos y tardar más. La ventaja es que el texto de tus documentos no se envía a un servicio externo para generar embeddings. Más adelante podemos comparar esta opción con modelos alojados en OpenRouter; su catálogo actual incluye embeddings gratuitos, aunque esos modelos pueden tener límites y enviarían el texto al proveedor.

## Por qué guardar el modelo usado

Los vectores solo se comparan de manera válida si se generaron con el mismo modelo y configuración. Por eso vamos a guardar con cada embedding:

- El identificador del modelo.
- La dimensión del vector.
- La versión o revisión configurada.
- El chunk al que corresponde.

Si cambiamos el modelo, primero tendremos que regenerar los vectores de los documentos y las preguntas con el mismo modelo nuevo. **No vamos a mezclar vectores de modelos distintos en una misma búsqueda.**

## Cómo se relaciona pgvector con Prisma

Prisma nos sirve para las entidades y relaciones habituales. El tipo `vector` de pgvector es una extensión de PostgreSQL; Prisma no siempre lo maneja como un campo normal, así que las inserciones y búsquedas vectoriales se harán con SQL parametrizado.

Para este sprint empezamos con búsqueda exacta:

```sql
SELECT
  c.id,
  c.content,
  p."pageNumber",
  e.embedding <=> $1::vector AS distance
FROM "DocumentChunk" c
JOIN "DocumentPage" p ON p.id = c."documentPageId"
JOIN "ChunkEmbedding" e ON e."chunkId" = c.id
WHERE e."modelId" = $2
ORDER BY e.embedding <=> $1::vector
LIMIT 5;
```

`$1` es el vector de la pregunta; `$2`, el modelo. En el código vamos a usar consultas parametrizadas de Prisma, no concatenación de SQL con texto del usuario.

pgvector también ofrece índices aproximados como HNSW, que intercambian algo de exactitud por velocidad. Para un corpus chico conviene aprender primero con búsqueda exacta y considerar un índice cuando podamos medir que la búsqueda realmente lo necesita.

## Flujo del sprint

1. Leer los chunks creados en el Sprint 2.
2. Generar un embedding `passage:` por cada chunk.
3. Guardarlo en PostgreSQL junto con el ID del modelo y la dimensión.
4. Recibir una pregunta de prueba.
5. Generar su embedding con `query:`.
6. Buscar los chunks más cercanos por distancia coseno.
7. Mostrar el texto, la página y la distancia para inspeccionar el resultado.

Esta búsqueda todavía no genera una respuesta. En el Sprint 4 vamos a pasar los fragmentos recuperados al modelo generativo.

## Esquema de datos sugerido

Una tabla separada permite conservar los chunks y sus fuentes independientemente de los embeddings:

```text
ChunkEmbedding
- id
- chunkId
- modelId
- modelRevision
- dimensions
- embedding vector(384)
- createdAt
```

`vector(384)` corresponde a la dimensión de la variante E5 pequeña que usaremos. Si el modelo configurado produce otra dimensión, el esquema y la migración también deben cambiar; no se puede guardar un vector de cualquier tamaño en esa columna.

## Prompt para OpenCode

```text
Actuá como desarrollador senior de TypeScript, Next.js, PostgreSQL y pgvector. Implementá el Sprint 3 de Intelligent Document Assistant: generar embeddings locales para los chunks y recuperar los más cercanos a una consulta de prueba.

CONTEXTO
Estoy aprendiendo AI Engineering y RAG. Quiero comprender el diseño, no aceptar código opaco. Trabajá sobre el repositorio existente y preservá lo implementado en los sprints anteriores.

ANTES DE EDITAR
1. Inspeccioná la estructura y el esquema actuales.
2. Verificá que existan documentos, páginas y chunks persistidos.
3. Explicá brevemente qué encontraste y qué archivos vas a tocar.
4. Si falta alguno de esos requisitos, informalo antes de agregar tablas duplicadas o cambiar el esquema sin una razón clara.
5. No asumas que el repositorio está completo ni reemplaces implementaciones anteriores.

OBJETIVO
Generar embeddings para los chunks, almacenarlos en PostgreSQL con pgvector y añadir una herramienta de prueba que permita buscar chunks similares a una pregunta. No generar respuestas con un LLM en este sprint.

STACK
- Next.js App Router
- TypeScript strict
- Prisma para entidades y relaciones
- PostgreSQL + pgvector
- CSS Modules
- Transformers.js para inferencia local
- Modelo: Xenova/multilingual-e5-small
- Vitest para pruebas unitarias de funciones puras
- No agregar LangChain ni otro framework de RAG

MODELO DE EMBEDDING
1. Cargar el modelo de manera lazy y reutilizar una sola instancia en el proceso.
2. Crear una abstracción pequeña EmbeddingProvider con funciones diferenciadas para:
   - embedPassages(texts)
   - embedQuery(text)
3. Usar el prefijo "passage: " para los chunks y "query: " para las preguntas.
4. Aplicar pooling mean y normalización, conforme al modelo y API instalados.
5. Confirmar durante la implementación que cada vector tiene 384 dimensiones; no asumirlo silenciosamente.
6. Mantener toda la inferencia en runtime Node.js, no Edge.
7. No agregar una clave de OpenRouter. El modelo de embeddings corre localmente.
8. Documentar que el primer uso puede descargar el modelo y llenar la caché local.

PERSISTENCIA
1. Habilitar pgvector mediante una migración SQL con CREATE EXTENSION IF NOT EXISTS vector.
2. Crear ChunkEmbedding relacionado con DocumentChunk:
   - id
   - chunkId
   - modelId
   - modelRevision
   - dimensions
   - embedding vector(384)
   - createdAt
3. Agregar una restricción única apropiada para impedir duplicados del mismo chunk, modelo y revisión.
4. Mantener el vector en SQL como vector(384). Si Prisma lo representa como Unsupported, usar SQL parametrizado para operaciones vectoriales.
5. No usar $queryRawUnsafe ni concatenar valores del usuario en SQL.
6. Validar que el vector no tenga NaN, Infinity ni una dimensión incorrecta antes de persistirlo.
7. Hacer el proceso idempotente: repetir la generación del mismo modelo no debe crear registros duplicados.
8. Procesar chunks en lotes pequeños y manejar errores parciales con un estado o resultado claro; no marcar todo el documento como exitoso si falló una parte.

GENERACIÓN
- Añadir una acción “Generar embeddings” por documento.
- Verificar que el documento tenga chunks.
- Mostrar estado de procesamiento y errores comprensibles.
- No registrar el texto completo de documentos en logs.
- Guardar metadatos del modelo con cada embedding.
- No regenerar embeddings ya existentes del mismo modelo/revisión, salvo que se solicite una regeneración explícita.

BÚSQUEDA DE PRUEBA
- Añadir una pantalla o componente de diagnóstico que acepte una pregunta.
- Generar embedding con el prefijo de query.
- Ejecutar búsqueda exacta por distancia coseno usando <=>.
- Filtrar por modelId/modelRevision para comparar solo vectores compatibles.
- Devolver topK configurable con valor por defecto 5.
- Mostrar contenido, página de origen, nombre del documento y distancia coseno.
- Ordenar por distancia ascendente.
- No aplicar todavía un umbral de distancia inventado.
- No llamar a un modelo generativo.

SEGURIDAD
- Validar y limitar el tamaño de la pregunta.
- Usar consultas SQL parametrizadas.
- Respetar el acceso existente a documentos si ya hay autenticación.
- No inventar IDs de documentos ni permitir búsquedas globales que filtren información de otros usuarios.
- No exponer vectores enteros en la API ni en la interfaz.

PRUEBAS
Agregar pruebas unitarias con Vitest para:
- validar la dimensión del embedding;
- rechazar NaN e Infinity;
- formatear vectores para la inserción parametrizada;
- comprobar que se aplican los prefijos query y passage.
No afirmar que PostgreSQL o la inferencia se probaron si solo se ejecutaron pruebas unitarias.

NO IMPLEMENTAR
- Respuestas generativas o chat.
- Reranking.
- Búsqueda híbrida.
- Índices HNSW o IVFFlat todavía.
- OCR.
- Cambios amplios de diseño no relacionados con el sprint.

ENTREGA
Al final:
1. Explicá qué es un embedding y cómo se calcula la distancia coseno con palabras sencillas.
2. Describí el recorrido desde un chunk hasta el resultado de búsqueda.
3. Listá las migraciones, dependencias, archivos y variables de entorno.
4. Explicá el comportamiento idempotente y cómo detectar fallos parciales.
5. Indicá qué revisar manualmente y qué limitaciones quedan.
6. Mostrá los comandos para instalar dependencias, migrar la base y arrancar la aplicación.
```

## Comprobaciones manuales

- Generar embeddings para un documento con chunks.
- Ejecutar la misma operación otra vez y confirmar que no duplica registros.
- Probar preguntas relacionadas con distintos temas del PDF y revisar el orden de resultados.
- Confirmar que cada resultado muestra documento y página.
- Forzar una pregunta vacía o demasiado larga y comprobar que la API la rechaza.
- Cambiar el ID del modelo y confirmar que no mezcla sus vectores con los anteriores.

## Preguntas de repaso

1. ¿Qué representa un embedding y por qué no es una palabra clave?
2. ¿Qué diferencia hay entre similitud coseno y distancia coseno?
3. ¿Por qué usamos `passage:` para documentos y `query:` para preguntas con E5?
4. ¿Por qué no conviene comparar embeddings generados con modelos distintos?
5. ¿Qué aporta pgvector sobre guardar una lista de números como JSON?
6. ¿Por qué empezamos con búsqueda exacta antes de agregar HNSW?
````

### L2 — Exploration (2026-11-12)

- Repository is on `feat/sprint-2-chunking` with a clean worktree. Previous commits implement upload/extraction (`Document`, `DocumentPage`) and chunking (`DocumentChunk`) with 12 chunking tests.
- Local PostgreSQL container `ida-postgres` is healthy on host port 5434. It uses `pgvector/pgvector:pg17`, but the `vector` extension is not installed yet.
- Existing data: 2 documents, 3 pages, 5 chunks. Preconditions are satisfied.
- Prisma 7.10.1 with the `prisma-client` generator and `@prisma/adapter-pg`. Prisma 7 documents `Unsupported("vector")` fields as raw columns with no client field; all vector operations must use parameterized raw SQL.
- `next.config.ts` already externalizes `pdfjs-dist`; Transformers.js and its native dependencies also need `serverExternalPackages`.
- Model metadata inspected from Hugging Face: revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78`, hidden size 384, max positions 512, fp32 ONNX ~470 MB. The first inference may download and cache the model.
- Existing UI is Spanish, CSS Modules, Server Components plus client islands. Layout still labels Sprint 1 and must be updated.

### L3 — Implementation decisions (2026-11-12)

- Installed `@huggingface/transformers@4.3.2` and `vitest@5.1.0` exact versions. The model uses fp32 because the SQL column and `modelRevision` identify an exact configuration; precision is not exposed as an environment switch.
- The default model revision is pinned to `761b726dd34fb83930e26aab4e9ac3899aa1fa78`, the Hugging Face commit inspected in L2. `EMBEDDING_MODEL_ID` and `EMBEDDING_MODEL_REVISION` remain configurable, but changing them creates a separate vector set.
- Prisma declares `embedding Unsupported("vector(384)")`; Prisma Client omits that field. Chunk listing, existing-row detection and counts use Prisma. Vector upsert and search use `Prisma.sql` with `$executeRaw`/`$queryRaw`; no unsafe raw API or user-input concatenation.
- Idempotency uses two layers: compatible rows are skipped unless `regenerate: true`, and the multi-row insert uses `ON CONFLICT ("chunkId","modelId","modelRevision") DO UPDATE`.
- Generation is sequential by batch so memory stays bounded. A failed inference or persistence batch is counted, recorded with its stage and batch number, and does not stop later batches. The overall status is `complete`, `partial` or `failed`; a document without chunks returns 409 `DOCUMENT_WITHOUT_CHUNKS`.
- Search validates the question and topK before loading the model. If the current model/revision has no embeddings, it returns `indexedChunkCount: 0` without downloading the model. Otherwise it embeds the query, runs exact `<=>` search with model/revision/dimension filters, orders ascending and limits to topK. No threshold and no generative call.
- The detail page renders a client embeddings panel. When chunks are regenerated, a `document-chunks-regenerated` window event resets the panel counters because the cascade removed the old embeddings. The search page is a server shell around a client form.
- `next.config.ts` externalizes Transformers.js, ONNX Runtime, Sharp and the Hugging Face tokenizer package for the Node server runtime.

### L4 — Verification evidence (2026-11-12)

- `npm run typecheck` ✅, `npm run lint` ✅, `npm run test:chunking` ✅ 12/12, `npm run test:unit` ✅ 37/37 in 4 files.
- `npx prisma migrate status` ✅ 3 migrations applied. `vector` 0.8.7 installed. `ChunkEmbedding` has `vector(384)`, the unique key on chunk/model/revision, the model/revision index and the cascade FK.
- Real inference: model loaded in 101.6 s including download; vectors are 384 finite values with norm 1.000000. Standalone probe: cancellation query vs cancellation passage 0.884, vs payment passage 0.793.
- Generation on `documento-de-prueba.pdf`: 2 chunks → 2 generated; repeat `{}` → 0 generated, 2 skipped; `{"regenerate":true}` → 2 generated; table stayed at 2 rows with 0 duplicate keys; `vector_dims=384`, self-similarity 1.000000.
- Search: guarantee query returned page 1 first at distance 0.13657888232091797; text query “¿Qué hace el asistente con el texto del documento?” returned page 2 first at 0.13679848217918789. Ascending order, document/page correct, no vector in the response.
- Invalid input: empty and 1001-char questions 400; topK 0/21/string 400; bad JSON 400; invalid id 400; missing document 404; document without chunks 409; invalid model id 503.
- Partial failure drill: `EMBEDDING_BATCH_SIZE=1` plus a temporary trigger on the second chunk produced `status: "partial"`, 1 generated, 1 failed, batch 2 `persistence`; removing the trigger produced `complete` with 2 generated.
- Model isolation: with `EMBEDDING_MODEL_ID=test/other-model` and `EMBEDDING_MODEL_REVISION=test-revision`, search returned `indexedChunkCount: 0` and `results: []` without loading the model.
- Cascade: deleting one chunk inside a transaction removed its embedding; `ROLLBACK` restored the 2 rows.
- UI: `GET /`, `GET /documents/[id]` and `GET /search` returned 200 with Sprint 3 labels, the embeddings panel and the search form.
- `npm run build` was not executed (project rule). No browser-level interaction was automated; API and rendered HTML were the UI evidence.

### L5 — Independent verification and corrections (2026-11-12)

- `gentle-ai-verify` reviewed the diff against baseline `cf99eec` read-only and returned **pass-with-advisories**, no blockers.
- Advisories corrected: removed the unreachable `no_chunks` status (the API returns 409), rejected explicit `topK: null`, softened the offline-cache claim because Transformers.js may still resolve remote metadata, corrected the README distance/query pair, and added the verifier's probe suites as regression tests (generation orchestration, SQL parameterization and boundary/status coverage).
- Advisories accepted as documentation: the standalone cancellation/payment probe is now labelled as outside the DB; the existing Sprint 1/2 source is unchanged except the shared document-id helper.
- Remaining limitation: `npm run build` was not run, and the app's cache path was not proven to work with all remote metadata disabled. The README states both.

### L6 — Closure

- T10 is complete with the final Sprint 3 report in the conversation: embedding explanation, end-to-end trace, files/dependencies/environment variables, idempotency and partial-failure behavior, manual review checklist, limitations and commands.
