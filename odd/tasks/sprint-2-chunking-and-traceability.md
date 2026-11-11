# Feature: Sprint 2 — Chunking and traceability

Objective: split the normalized text of every `DocumentPage` into overlapping character-bounded chunks, persist them in PostgreSQL with page traceability, expose an idempotent regeneration endpoint, and review the result in the document detail UI. No embeddings, no semantic search, no LLM calls.
Branch: `feat/sprint-2-chunking` (created from `main` before the first work-unit commit).
Delivery: one work unit per commit slice; no PR/remote delivery requested.
Checks: `npm run test:chunking`, `npm run typecheck`, `npm run lint`, Prisma migration against the local PostgreSQL on port 5434, HTTP smoke tests through `next dev`, SQL idempotency and traceability checks.

## Specs

- **S1 — Model.** Add `DocumentChunk` related to `DocumentPage`: `id`, `documentPageId`, `chunkIndex`, `content`, `startChar`, `endChar`, `createdAt`. `@@unique([documentPageId, chunkIndex])`, index on `documentPageId`, foreign key with `onDelete: Cascade`. Create a Prisma migration compatible with the existing schema.
- **S2 — Pure module.** The chunking module is pure and separate from the UI and Prisma. Initial configurable values: `CHUNK_TARGET_CHARS=1200`, `CHUNK_OVERLAP_CHARS=150`, `CHUNK_MIN_CHARS=100`.
- **S3 — Algorithm.** (1) Normalize whitespace consistently without destroying meaning. (2) Cut between paragraphs first. (3) When a paragraph exceeds the target, cut by sentences. (4) When a sentence exceeds the target, split by words. (5) Add overlap at the start of the next chunk, avoiding word cuts. (6) Process each page separately; no chunk spans pages. (7) `startChar`/`endChar` are offsets into the normalized text used to generate the chunks. (8) Never emit empty or whitespace-only chunks. (9) Guarantee progress with exceptionally long paragraphs, sentences, or words. (10) Validate positive parameters and `overlap < target`.
- **S4 — Idempotent operation.** Regenerate a document's chunks idempotently: repeated runs must not create duplicates. Replace within a transaction. Do not create embeddings or vector fields.
- **S5 — API.** Add the endpoint to generate chunks for a document. Validate the ID, return appropriate HTTP errors, and never leak internal traces.
- **S6 — UI.** Add “Generar fragmentos” / “Regenerar fragmentos” to the document detail. Show chunks in order with their source page, the target size and overlap used, a message when a page has no text or produced no chunks, and loading, success, empty, and error states. Keep CSS Modules and the existing design. No chat or model calls.
- **S7 — Scope guard.** No embeddings, pgvector queries, semantic/hybrid search, reranking, or chat. Regeneration must not modify or delete documents/pages. Never trust the client for parameter validation. Never log full document content. Keep changes bounded to Sprint 2.
- **S8 — Review summary.** Final report: plain-language algorithm explanation, traceability, files and migration, known limits and decisions to revisit, and which code to read first. Include the manual checklist requested by the user.
- **S9 — Sprint 1 preserved.** Existing upload, extraction, list, detail, API responses, and error behavior keep working unchanged.

## Tasks

| ID | Specs | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| T1 | S2, S3 | inline | done | `src/lib/chunking/chunk-text.ts`, `config.ts`, `tests/chunking.test.mjs`; RED (module missing) → 11/11 GREEN |
| T2 | S1 | inline | done | `prisma/schema.prisma`, migration `20261111203342_add_document_chunk`; `prisma migrate status` up to date |
| T3 | S3, S4 | inline | done | `src/lib/documents/chunks.ts`; same content hash and count after 3 regenerations; rollback trigger left 6 old chunks intact |
| T4 | S5 | inline | done | `src/app/api/documents/[id]/chunks/route.ts`; 200/400/404/405 verified, safe `INTERNAL_ERROR` on forced failure |
| T5 | S1, S6 | inline | done | `queries.ts`, `dto.ts`, `types.ts`; detail API returns chunks ordered by page/index |
| T6 | S6 | inline | done | `DocumentDetail.tsx`, `DocumentChunkViewer.tsx`, CSS module; HTML shows params, page, range, chunk index, empty-page and no-chunk messages |
| T7 | S2, S7, S9 | inline | done | `.env.example`, `README.md`, `package.json`; docs include flow, decisions, limits, manual checks |
| T8 | S1–S9 | inline | done | typecheck, lint, 11 chunk tests, HTTP smoke, SQL integrity, idempotency, rollback, cascade, config fallback |
| T9 | S8 | inline | done | Final response with algorithm, traceability, files, limits and reading order |

Route note: T1–T9 run inline. The units are strictly sequential (pure module → schema → persistence → API → UI → docs → verification), so the Writer trigger holds no parallelism reason; there are no independent units with disjoint edit surfaces.

## Log

### L1 — User request (verbatim)

> No te preocupes. No puedo borrar un mensaje que ya se envió, pero dejamos de lado la respuesta anterior. Vamos con el **Sprint 2: chunking y trazabilidad**.
>
> # Sprint 2: dividir los documentos en fragmentos
>
> ## Objetivo
>
> Tomar el texto extraído en el Sprint 1 y dividirlo en fragmentos que después podamos buscar. Cada fragmento debe conservar su documento, su página y su posición dentro del texto original.
>
> Al terminar, vas a poder generar y revisar los fragmentos de un PDF antes de agregar embeddings.
>
> ## ¿Por qué no enviar el documento entero?
>
> El modelo de embeddings convierte texto en vectores. Si representamos un documento de cientos de páginas con un único vector, mezclamos temas distintos y la búsqueda pierde precisión.
>
> Con fragmentos más chicos, cada vector representa una idea o sección más acotada. Después, ante una pregunta, podemos recuperar solo los fragmentos que parecen pertinentes.
>
> La división también tiene que conservar suficiente contexto. Si cortamos justo entre una pregunta y su respuesta, el fragmento recuperado puede resultar incomprensible por sí solo.
>
> ## Qué hace un chunker
>
> Un **chunker** recibe texto y lo divide según reglas configurables. Para este proyecto, priorizamos cortes que respeten la estructura del documento:
>
> 1. Separar por párrafos cuando sea posible.
> 2. Unir párrafos cercanos mientras no se supere el tamaño objetivo.
> 3. Si un párrafo es muy largo, dividirlo por oraciones.
> 4. Si una oración también es muy larga, cortarla por palabras.
>
> Por ejemplo, si el tamaño objetivo es de 1.200 caracteres:
>
> ```text
> Página 1:
>   Chunk 0: primer grupo de párrafos
>   Chunk 1: párrafos siguientes + algo de solapamiento
> ```
>
> El solapamiento —**overlap**— repite una pequeña parte del final de un fragmento al principio del siguiente. Así reducimos el riesgo de perder el contexto que cruza el límite.
>
> Como valores iniciales de aprendizaje podemos usar **1.200 caracteres de objetivo y 150 de overlap**. Son parámetros de partida, no valores universales. En producción conviene ajustar el tamaño al modelo de embeddings y medir la calidad de recuperación.
>
> ## Tamaño y tokens
>
> Un carácter no equivale a un token. Los modelos tokenizan de manera distinta según el idioma y el texto; por eso, medir chunks en caracteres es una aproximación sencilla para este sprint.
>
> Más adelante, al elegir el modelo de embeddings, ajustaremos el tamaño usando su tokenizador y sus límites. También compararemos configuraciones con preguntas de evaluación: un chunk demasiado grande puede mezclar temas; uno demasiado chico puede perder contexto.
>
> ## Trazabilidad de cada fragmento
>
> El sistema debe poder responder: **¿de qué documento y página salió este fragmento?**
>
> Un registro podría verse así:
>
> ```ts
> type DocumentChunk = {
>   id: string;
>   documentPageId: string;
>   chunkIndex: number;
>   content: string;
>   startChar: number;
>   endChar: number;
> };
> ```
>
> `startChar` y `endChar` representan el rango del fragmento dentro del texto normalizado de esa página. En este sprint los usamos para rastrear el origen; en otro sprint nos servirán para mostrar citas más precisas.
>
> Vamos a dividir **página por página**. Así cada fragmento queda asociado a una sola página y podemos mostrar la fuente sin ambigüedad. Si un párrafo continúa en otra página, aceptamos que el corte coincida con ese límite por ahora.
>
> ## Persistencia
>
> Agregaremos una entidad `DocumentChunk` relacionada con `DocumentPage`. Cada página puede producir varios fragmentos:
>
> ```text
> DocumentPage
>   └── DocumentChunk
>         ├── chunkIndex
>         ├── content
>         ├── startChar
>         └── endChar
> ```
>
> La generación debe ser repetible: si volvemos a generar los fragmentos de una página, no deben quedar duplicados. Una opción es reemplazar sus chunks dentro de una transacción.
>
> ## Interfaz del sprint
>
> En la biblioteca de documentos, agregaremos una acción para generar o regenerar los fragmentos. La vista de detalle debe mostrar:
>
> - El texto extraído de cada página.
> - Los fragmentos en orden.
> - La página de origen de cada fragmento.
> - Los parámetros usados: tamaño objetivo y overlap.
> - Mensajes cuando una página no tiene texto o no produce fragmentos.
>
> Todavía no hay embeddings, búsqueda semántica ni respuestas de un LLM.
>
> ## Prompt para OpenCode
>
> ```text
> Actuá como desarrollador senior de TypeScript, Next.js y PostgreSQL. Implementá el Sprint 2 de Intelligent Document Assistant: segmentar el texto extraído en chunks y conservar su trazabilidad.
>
> CONTEXTO
> Este es un proyecto educativo sobre RAG. Quiero entender las decisiones y revisar el código generado. Trabajá sobre la estructura existente y preservá lo ya implementado en el Sprint 1.
>
> ANTES DE CAMBIAR CÓDIGO
> 1. Inspeccioná el repositorio.
> 2. Identificá el modelo actual de Document y DocumentPage, la persistencia y la interfaz de documentos.
> 3. Resumí brevemente qué archivos vas a modificar y cualquier discrepancia con el alcance esperado.
> 4. Si faltan Document o DocumentPage, no inventes datos de negocio: proponé una extensión mínima compatible y explicá la decisión en el resumen final.
>
> OBJETIVO
> Generar chunks desde el texto de cada DocumentPage, guardarlos en PostgreSQL y mostrarlos en la interfaz junto con su página de origen.
>
> STACK
> - Next.js App Router
> - TypeScript strict
> - Prisma
> - PostgreSQL
> - CSS Modules
> - Respetar las librerías existentes del repositorio
> - No agregar LangChain
>
> MODELO
> Agregar DocumentChunk relacionado con DocumentPage:
> - id
> - documentPageId
> - chunkIndex
> - content
> - startChar
> - endChar
> - createdAt
> - unique(documentPageId, chunkIndex)
>
> Usar una clave foránea con eliminación en cascada desde DocumentPage.
> Crear una migración de Prisma compatible con el esquema existente.
>
> CHUNKING
> Implementar un módulo puro y separado de la UI y de Prisma.
> Valores iniciales configurables:
> - CHUNK_TARGET_CHARS=1200
> - CHUNK_OVERLAP_CHARS=150
> - CHUNK_MIN_CHARS=100
>
> El algoritmo debe:
> 1. Normalizar espacios de forma consistente sin destruir el sentido del texto.
> 2. Intentar cortar primero entre párrafos.
> 3. Cuando un párrafo supere el objetivo, intentar cortar por oraciones.
> 4. Si una oración supera el objetivo, dividirla por palabras.
> 5. Agregar overlap al comienzo del chunk siguiente procurando no cortar palabras.
> 6. Procesar cada página por separado. Ningún chunk debe pertenecer a más de una página.
> 7. Guardar startChar y endChar como offsets dentro del texto normalizado usado para generar los chunks.
> 8. Evitar chunks vacíos o compuestos solo de espacios.
> 9. Garantizar progreso del algoritmo ante párrafos, oraciones o palabras excepcionalmente largas.
> 10. Validar que los parámetros sean positivos y que overlap sea menor que el tamaño objetivo.
>
> OPERACIÓN REPETIBLE
> Agregar una acción para generar o regenerar los chunks de un documento.
> Debe ser idempotente: ejecutar la acción varias veces no debe dejar duplicados.
> Usar una transacción al reemplazar los chunks del documento.
> No crear embeddings ni campos vectoriales en este sprint.
>
> API Y UI
> - Agregar el endpoint necesario para generar chunks de un documento.
> - Validar el ID y devolver errores HTTP apropiados sin filtrar trazas.
> - Integrar en la vista del documento una acción “Generar fragmentos” o “Regenerar fragmentos”.
> - Mostrar los chunks ordenados, su página de origen y un indicador si una página no generó chunks.
> - Mostrar el tamaño objetivo y el overlap usados.
> - Incluir estados de carga, éxito, vacío y error.
> - Mantener el diseño existente usando CSS Modules.
> - No agregar chat ni llamadas a modelos.
>
> RESTRICCIONES
> - No implementar embeddings, pgvector queries, búsqueda semántica, búsqueda híbrida, reranking ni chat.
> - No modificar ni borrar documentos o páginas como efecto secundario de regenerar chunks.
> - No confiar en el cliente para validar parámetros.
> - No registrar el contenido completo de documentos en logs.
> - Mantener cualquier cambio acotado al Sprint 2.
>
> REVISIÓN MANUAL
> Al final, incluí una lista de comprobaciones manuales que yo pueda ejecutar:
> - Documento con una página corta.
> - Página con varios párrafos.
> - Párrafo largo que requiera cortes adicionales.
> - Documento con una página vacía.
> - Regeneración repetida sin duplicados.
> - Verificación de que cada chunk conserva la página correcta.
>
> ENTREGA
> En el resumen final:
> 1. Explicá el algoritmo con palabras sencillas.
> 2. Indicá cómo se conserva la trazabilidad.
> 3. Enumerá archivos y migración agregados o modificados.
> 4. Indicá límites conocidos y decisiones que deberían revisarse.
> 5. Decime qué partes del código debería leer primero para comprender el sprint.
> ```
>
> ## Criterios para cerrar el sprint
>
> - Podés generar fragmentos para un documento y verlos en orden.
> - Cada fragmento conserva su página y su rango de caracteres.
> - Regenerar no crea duplicados.
> - El algoritmo respeta párrafos y oraciones cuando puede, y tiene una salida para textos largos.
> - Todavía no se envían documentos a un proveedor externo: en este sprint procesamos y guardamos texto localmente.
>
> ## Preguntas de repaso
>
> 1. ¿Qué problema puede aparecer si representamos un PDF entero con un solo embedding?
> 2. ¿Qué aporta el overlap entre chunks?
> 3. ¿Por qué conviene intentar cortar por párrafos u oraciones antes que por una cantidad fija de caracteres?
> 4. ¿Qué información mínima necesitamos guardar para mostrar la página de origen de un chunk?
> 5. ¿Por qué regenerar chunks debería ser idempotente?
> 6. ¿Por qué los 1.200 caracteres son un punto de partida y no una regla universal?

### L2 — Exploration (2026-11-11)

- `Document` and `DocumentPage` already exist (Sprint 1) with cascade delete and `unique(documentId, pageNumber)`. No schema extension is needed beyond `DocumentChunk`.
- Page text is normalized during extraction (`extract-text.ts`): CRLF → LF, trailing horizontal whitespace removed, horizontal runs collapsed, 3+ newlines collapsed, trimmed. The chunker repeats normalization idempotently; offsets refer to the chunker's normalized text.
- Current detail page is a Server Component (`DocumentDetail`) and the API detail route returns `pages` ordered by `pageNumber`. Chunks will be included in the same query/DTO.
- No test framework is installed. Node 22.13 supports `--experimental-strip-types`, so the pure chunking module can be tested with `node:test` and a `.mjs` test importing the `.ts` module directly, with no new dependency. The test file is typechecked by Node, not by `tsc`, so no tsconfig change is needed.
- Local PostgreSQL container `ida-postgres` is healthy on host port 5434.
- Uncommitted Sprint 1 artifacts (`README.md`, `package.json`, `docs/`, `samples/`, `scripts/`) pre-exist this sprint. They are not part of Sprint 2 and must not be staged accidentally.

### L3 — Implementation decisions and discoveries (2026-11-11)

- The pure module is `src/lib/chunking/chunk-text.ts` (no Prisma, no UI, no env reads). `config.ts` reads env and falls back to defaults when the combination is invalid. Tests import the `.ts` module directly with Node's strip-types support, so no test framework or dependency was added.
- Algorithm: normalize → paragraph ranges → sentence ranges when a paragraph exceeds the target → word ranges when a sentence exceeds the target → hard target-sized pieces for an oversized word → greedy packing → trailing `minChars` merge → overlap at word boundaries. Chunk content is exactly `normalized.slice(startChar, endChar)`.
- `minChars` merge can make the final chunk exceed `targetChars` by less than `minChars` plus the whitespace separator. This is intentional: losing the tail of a page is worse than a slightly larger final chunk.
- The overlap is measured over new content, not over the final content. A chunk with overlap can exceed `targetChars`; the effective overlap is often a few characters smaller than configured because the start moves forward to a word boundary.
- Verification confirmed that Sprint 1's extraction normalization and the chunker's normalization are compatible: every stored `content` matched `substring(page.text, startChar, endChar)` exactly.
- Discovery/limitation: PDF.js emits a newline per line but does not preserve blank lines, so extracted pages usually contain no `\n\n`. The chunker therefore sees one paragraph per page and falls back to sentence cuts. Paragraph-first behavior is covered with synthetic text in tests and remains correct for any input that preserves paragraph breaks. Improving paragraph detection in extraction is out of Sprint 2 scope.
- Parameters are read from the server environment on every generation and are not persisted per document. The UI shows the current configuration; existing chunks keep their old ranges until regenerated.
- Concurrent regeneration is not serialized with an explicit lock. The transaction and unique constraint protect integrity, but one concurrent request could fail with a safe 500. This is documented as a known limit.
- No embeddings, vector fields, search, reranking, chat, or model calls were added. Regeneration does not modify `Document` or `DocumentPage`.
- The API detail response now includes chunks; the list endpoint is unchanged. The POST endpoint validates the id format before querying.

### L4 — Verification evidence (2026-11-11)

- `npm run typecheck` ✅, `npm run lint` ✅, `npm run test:chunking` ✅ (11/11).
- `npx prisma migrate status` ✅: 2 migrations applied, schema up to date.
- HTTP smoke: short page 1 chunk; long page 3+3 chunks; paragraphs fixture 2 chunks; long sentence 3+3 chunks; empty page document 1+0 chunks; invalid id 400 `INVALID_DOCUMENT_ID`; missing id 404 `DOCUMENT_NOT_FOUND`; `GET` on the generation endpoint 405; detail API and HTML show chunks ordered by page/index with ranges and parameters.
- Idempotency: 3 regenerations produced the same count (6) and the same content/range hash; row ids changed, proving replacement rather than duplication.
- SQL integrity: 0 out-of-bounds ranges; 0 content/slice mismatches; 0 duplicate or discontinuous `(documentPageId, chunkIndex)`; overlap 143–148 chars (≤150); 0 chunks without a page.
- Rollback: a temporary BEFORE INSERT trigger forced a failure; the endpoint returned a safe 500 `INTERNAL_ERROR` and the 6 old chunks survived. After dropping the trigger, regeneration returned 200 with 6 chunks.
- Cascade: deleting one page removed only its 3 chunks; deleting all test documents left 0 documents, 0 pages, 0 chunks.
- Config fallback: `CHUNK_TARGET_CHARS=100` + `CHUNK_OVERLAP_CHARS=200` logged the validation warning and used 1200/150/100.
- `next build` was not run (workspace rule). The dev server was stopped and all test documents were removed after verification.
