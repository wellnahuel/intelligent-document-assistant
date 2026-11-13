# Intelligent Document Assistant — Sprint 5

Aplicación web educativa para subir PDFs, extraer su texto página por página, dividirlo en fragmentos trazables, generar **embeddings locales**, recuperar los fragmentos más cercanos con **pgvector** y responder preguntas con un modelo de **OpenRouter** y **citas verificadas** a las páginas del documento.

Este es el quinto hito del proyecto de RAG. El recorrido completo es **indexar → recuperar → generar**, y ahora también **medir**. Los documentos se procesan y se vectorizan localmente; la pregunta se convierte en un vector con el mismo modelo; los chunks del documento elegido se envían como contexto a OpenRouter; el servidor valida las citas antes de mostrarlas; y un conjunto de evaluación pequeño compara búsqueda vectorial, búsqueda léxica, búsqueda híbrida con RRF y reranking opcional. La respuesta sigue siendo de un solo turno: no hay historial de conversación, herramientas ni agentes.

> **Solo para desarrollo local.** Esta versión no incluye autenticación ni aislamiento entre usuarios. No la expongas a Internet ni la uses con documentos reales. Los fixtures de evaluación son ficticios a propósito: si activás el reranking, la pregunta y los fragmentos candidatos salen hacia un proveedor externo.

## Qué incluye

- Todo lo del Sprint 1: carga de PDF, validación, extracción por página y biblioteca.
- Todo lo del Sprint 2: chunking con overlap, offsets de caracteres y regeneración idempotente.
- `EmbeddingProvider` local con `Transformers.js` y el modelo multilingüe `Xenova/multilingual-e5-small`.
- Prefijos E5 `passage: ` y `query: `, pooling mean y normalización L2.
- Validación de vectores de exactamente 384 dimensiones y rechazo de `NaN`/`Infinity`.
- Migración con `CREATE EXTENSION IF NOT EXISTS vector` y tabla `ChunkEmbedding`.
- Generación de embeddings por documento, en lotes pequeños, con omisión de los ya existentes y regeneración explícita.
- Resultado `complete`, `partial` o `failed`; un fallo de un lote no se presenta como éxito total.
- Búsqueda exacta con el operador `<=>` de pgvector, filtrada por modelo, revisión y dimensión.
- Pantalla `/search` con pregunta, topK configurable (5 por defecto), documento, página, distancia y similitud. Sigue disponible como diagnóstico de recuperación.
- Pantalla `/ask` con selector de documento, pregunta, respuesta, estado de carga y fuentes expandibles.
- Recuperación filtrada por documento con el mismo modelo, revisión y prefijo `query: ` del Sprint 3.
- Contexto limitado con `RAG_TOP_K` y `RAG_MAX_CONTEXT_CHARS`.
- Identificadores temporales `[S1]`, `[S2]`, ... que el servidor mapea a chunks reales.
- System prompt que trata las fuentes como datos de referencia, no como instrucciones, y permite abstenerse.
- Cliente de OpenRouter Chat Completions sin streaming, con timeout y errores seguros.
- Validación y limpieza de citas: los IDs inventados no generan metadata ni se muestran como fuentes válidas.
- Fuentes verificadas con documento, página, fragmento, distancia y estado de cita.
- Pruebas unitarias con Vitest para prompt, citas, entrada, cliente HTTP mockeado y camino sin evidencia.
- Conjunto de evaluación tipado con 25 casos: 20 respondibles y 5 no respondibles, con chunks relevantes y hechos esperados.
- Fixture ficticio y determinista de dos documentos, 21 chunks y embeddings generados con el mismo modelo local.
- Comando `npm run eval:retrieval` sin llamadas a un LLM, con reporte JSON reproducible.
- Métricas Recall@k, Precision@k (denominador `k`) y MRR, por caso y agregadas.
- Búsqueda léxica PostgreSQL con `tsvector`/`tsquery`, configuración `simple`, consulta parametrizada e índice GIN.
- Búsqueda híbrida con Reciprocal Rank Fusion (RRF), sin sumar distancias coseno y scores léxicos.
- Adaptador `Reranker` y cliente opcional de OpenRouter `/api/v1/rerank`, desactivado si no hay modelo o clave.
- Plantilla manual para revisar exactitud, fidelidad, citas y abstención de las respuestas del Sprint 4.
- Reporte de referencia generado por una ejecución real en `eval/reports/reference-report.json`.
- Documentación de decisiones, límites y comprobaciones manuales.

## Documentación del sprint

- `docs/sprint-5-como-funciona.pdf` — guía de estudio del Sprint 5 (17 páginas): gold set, métricas, búsqueda vectorial y léxica, RRF, reranking opcional, CLI, reporte reproducible, resultados reales, límites y checklist para el Sprint 6.
- `docs/sprint-5-como-funciona.html` — fuente editable de la guía; el PDF se genera con Chrome headless.
- **Sprint 5:** la sección [Evaluación de recuperación](#flujo-de-evaluación-de-recuperación-sprint-5) de este README explica el gold set, las métricas, RRF, el reranking opcional, el índice GIN y los límites. Los artefactos viven en `eval/gold-set.json`, `eval/fixtures/fictional-documents.json`, `eval/answer-quality-review.md` y `eval/reports/reference-report.json`.
- `docs/sprint-4-como-funciona.pdf` — guía de estudio del Sprint 4 (20 páginas): RAG, recuperación por documento, contexto, OpenRouter, citas verificadas, pruebas reales, límites y checklist para el Sprint 5.
- `docs/sprint-4-como-funciona.html` — fuente editable de la guía; el PDF se genera con Chrome headless.
- `docs/sprint-3-como-funciona.pdf` — guía de estudio del Sprint 3 (19 páginas): embeddings, distancia coseno, pgvector, generación idempotente, búsqueda y límites.
- `docs/sprint-3-como-funciona.html` — fuente editable de la guía anterior.

Las guías de los sprints 1 y 2 siguen disponibles en `docs/sprint-1-como-funciona.pdf` y `docs/sprint-2-como-funciona.pdf`.

## Qué no incluye (a propósito)

- Streaming de la respuesta.
- Historial de conversación, herramientas o agentes.
- Conectar la búsqueda híbrida o el reranking al flujo de `/ask`; por ahora se comparan en la evaluación.
- Un LLM juez automático para calidad de respuesta.
- Umbral universal de similitud.
- Índices HNSW o IVFFlat.
- Stemming específico para español o italiano; la búsqueda léxica usa la configuración `simple`.
- OCR para PDFs escaneados.
- Autenticación, permisos por documento, rate limiting o aislamiento entre usuarios.
- Almacenamiento del archivo PDF original.
- Controles de prompt injection más allá de la instrucción del prompt.

## Stack

| Parte | Tecnología |
| --- | --- |
| Framework | Next.js 16 (App Router) + React 19 |
| Lenguaje | TypeScript en modo `strict` |
| Estilos | CSS Modules, sin Tailwind |
| Base de datos | PostgreSQL 17 con pgvector, vía Docker |
| ORM | Prisma 7 + `@prisma/adapter-pg` |
| Extracción | PDF.js (`pdfjs-dist` 6) |
| Chunking | Módulo TypeScript puro, sin dependencias de IA |
| Embeddings | `@huggingface/transformers` 4 + ONNX Runtime local |
| Modelo de embeddings | `Xenova/multilingual-e5-small` (384 dimensiones) |
| Generación | OpenRouter Chat Completions vía `fetch` en el servidor |
| Búsqueda léxica | PostgreSQL `tsvector`/`tsquery` con configuración `simple` e índice GIN |
| Búsqueda híbrida | Reciprocal Rank Fusion sobre rankings vectorial y léxico |
| Reranking opcional | OpenRouter `/api/v1/rerank` vía `fetch` en el servidor |
| Scripts de evaluación | `tsx` para ejecutar TypeScript fuera de Next.js |
| Validación de entrada | Zod |
| Tests | `node:test` para el chunker + Vitest para embeddings, RAG, métricas y retrieval |

## Requisitos

- **Node.js 22.13 o superior** (probado con 22.13.1). `pdfjs-dist` 6 y Transformers.js lo requieren.
- **npm 10 o superior**.
- **Docker** con Docker Compose.
- Puerto **3000** libre para Next.js.
- Puerto **5434** libre para PostgreSQL en el host.
- Espacio en disco y conexión a Internet la primera vez que se usa el modelo. El archivo ONNX fp32 pesa unos **470 MB** y se guarda en `.cache/transformers/`; después los archivos se reutilizan desde la caché, aunque Transformers.js puede seguir consultando metadatos remotos para resolver el modelo.
- Una cuenta de OpenRouter con una API key y un ID de modelo compatible con Chat Completions. La clave se usa solo en el servidor.

## Puesta en marcha

```bash
# 1. Variables de entorno locales
cp .env.example .env
# Completá OPENROUTER_API_KEY y OPENROUTER_MODEL en .env

# 2. Dependencias
npm install

# 3. PostgreSQL
docker compose up -d

# 4. Cliente de Prisma
npm run db:generate

# 5. Migraciones (incluye CREATE EXTENSION vector y el índice GIN de Sprint 5)
npm run db:migrate

# 6. Fixture de evaluación ficticio (opcional; requiere el modelo local)
npm run eval:seed
npm run eval:retrieval

# 7. Servidor de desarrollo
npm run dev
```

Abre <http://localhost:3000>, sube un PDF con texto seleccionable, genera los fragmentos y después los embeddings. La primera generación de embeddings descarga el modelo y puede tardar varios minutos; las siguientes usan la caché.

### Detener y reiniciar

```bash
# Detener PostgreSQL sin borrar datos
docker compose down

# Borrar también el volumen de la base y empezar de cero
docker compose down -v
docker compose up -d
npm run db:migrate
```

La caché del modelo se puede borrar sin afectar la base:

```bash
rm -rf .cache/transformers
```

## Variables de entorno

| Variable | Obligatoria | Valor por defecto | Descripción |
| --- | --- | --- | --- |
| `DATABASE_URL` | Sí | — | Cadena de conexión de PostgreSQL. |
| `MAX_PDF_SIZE_MB` | No | `10` | Tamaño máximo del PDF en MB. |
| `MAX_PDF_PAGES` | No | `50` | Cantidad máxima de páginas. |
| `CHUNK_TARGET_CHARS` | No | `1200` | Tamaño objetivo de cada fragmento, en caracteres. |
| `CHUNK_OVERLAP_CHARS` | No | `150` | Caracteres que se repiten desde el fragmento anterior. |
| `CHUNK_MIN_CHARS` | No | `100` | Tamaño mínimo del último fragmento antes de fusionarlo. |
| `EMBEDDING_MODEL_ID` | No | `Xenova/multilingual-e5-small` | Modelo local de Transformers.js. |
| `EMBEDDING_MODEL_REVISION` | No | `761b726dd34fb83930e26aab4e9ac3899aa1fa78` | Commit de Hugging Face usado para descargar el modelo. |
| `EMBEDDING_CACHE_DIR` | No | `.cache/transformers` | Carpeta de caché del modelo. Está ignorada por git. |
| `EMBEDDING_BATCH_SIZE` | No | `4` | Chunks por lote de inferencia y escritura. Rango: 1–16. |
| `SEARCH_DEFAULT_TOP_K` | No | `5` | Cantidad de resultados por defecto en `/search`. |
| `SEARCH_MAX_TOP_K` | No | `20` | Máximo permitido para `topK` en `/search`. |
| `SEARCH_QUERY_MAX_CHARS` | No | `1000` | Longitud máxima de la pregunta en `/search`. |
| `OPENROUTER_API_KEY` | Sí, para generar respuestas | — | API key del servidor. Nunca debe tener el prefijo `NEXT_PUBLIC_`. |
| `OPENROUTER_MODEL` | Sí, para generar respuestas | — | ID de modelo de OpenRouter, por ejemplo el que elijas de su catálogo. No hay un modelo gratuito garantizado. |
| `RAG_TOP_K` | No | `5` | Fragmentos recuperados para `/api/ask`. Rango: 1–20. |
| `RAG_MAX_CONTEXT_CHARS` | No | `8000` | Máximo de caracteres de fuentes enviados al modelo. Rango: 500–50000. |
| `RAG_QUESTION_MAX_CHARS` | No | `1000` | Longitud máxima de la pregunta en `/api/ask`. Rango: 1–4000. |
| `RAG_PROVIDER_TIMEOUT_MS` | No | `30000` | Timeout de la llamada a OpenRouter. Rango: 1000–120000. |
| `EVAL_TOP_K` | No | `5` | Corte de Recall@k/Precision@k en la evaluación. Rango: 1–50. |
| `RETRIEVAL_CANDIDATES` | No | `20` | Candidatos que devuelve cada fuente antes de RRF. Rango: 1–100. |
| `RETRIEVAL_RRF_K` | No | `60` | Constante `k` de Reciprocal Rank Fusion. Rango: 1–1000. |
| `RERANK_MODEL` | No | vacío | Modelo de reranking de OpenRouter, por ejemplo `cohere/rerank-v3.5`. Vacío desactiva el reranking. |
| `RERANK_API_KEY` | No | vacío | Clave opcional del reranker; si falta, se usa `OPENROUTER_API_KEY`. Solo servidor. |
| `RERANK_TOP_N` | No | `5` | Cantidad de candidatos que devuelve el reranker. Rango: 1–50. |
| `RERANK_TIMEOUT_MS` | No | `20000` | Timeout del reranker. Rango: 1000–120000. |

Los valores inválidos generan una advertencia en la terminal y se usan los valores por defecto. La dimensión **no** es configurable: la columna SQL es `vector(384)` y el proveedor valida que el modelo produzca exactamente 384 números. Cambiar de modelo exige una migración y regenerar los vectores.

`OPENROUTER_API_KEY` y `OPENROUTER_MODEL` se leen solo en el servidor. Si faltan, `/api/ask` responde `503` con un mensaje seguro después de recuperar los fragmentos; el camino sin evidencia sigue funcionando sin llamar al proveedor. La clave no aparece en el bundle del navegador, en la API ni en los logs.

El reranking es opcional: con `RERANK_MODEL` vacío o sin clave, `npm run eval:retrieval` lo marca como `skipped` y termina normalmente. Cuando se activa, la pregunta y los fragmentos candidatos se envían a OpenRouter; usá solo documentos ficticios o que puedas compartir. No se asume que exista un modelo gratuito disponible.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo con Turbopack. |
| `npm run build` | Compilación de producción. |
| `npm run start` | Servidor de producción (requiere `build`). |
| `npm run lint` | ESLint con la configuración de Next.js. |
| `npm run typecheck` | `tsc --noEmit` con TypeScript estricto. |
| `npm test` | Ejecuta los tests del chunker y los tests unitarios de embeddings y RAG. |
| `npm run test:chunking` | Tests del chunker con el runner nativo de Node. |
| `npm run test:unit` | Tests de embeddings y RAG con Vitest. |
| `npm run test:unit:watch` | Vitest en modo watch. |
| `npm run db:generate` | Genera el cliente de Prisma en `src/generated/prisma`. |
| `npm run db:migrate` | Aplica migraciones en desarrollo. |
| `npm run db:deploy` | Aplica migraciones en un entorno desplegado. |
| `npm run db:studio` | Abre Prisma Studio. |
| `npm run sample:pdf` | Regenera el PDF de prueba en `samples/`. |
| `npm run eval:seed` | Inserta o reemplaza el fixture ficticio de evaluación y genera sus embeddings locales. Es idempotente. |
| `npm run eval:retrieval` | Ejecuta los 25 casos de evaluación sin llamar a un LLM, imprime el resumen y escribe un reporte JSON en `eval/reports/`. Acepta `-- --top-k`, `--candidates`, `--rrf-k`, `--no-rerank` y `--out`. |

## Estructura del proyecto

```text
.
├── prisma/
│   ├── schema.prisma              # Document, DocumentPage, DocumentChunk, ChunkEmbedding
│   └── migrations/                # Inicial, chunks, embeddings/pgvector e índice GIN
├── eval/
│   ├── gold-set.json              # 25 casos con chunks relevantes y hechos esperados
│   ├── fixtures/
│   │   └── fictional-documents.json
│   ├── answer-quality-review.md   # Plantilla manual de respuesta y citas
│   └── reports/
│       └── reference-report.json  # Ejecución real de referencia
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── documents/
│   │   │   │   ├── route.ts       # GET (lista) y POST (carga)
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts   # GET de un documento con páginas y chunks
│   │   │   │       ├── chunks/route.ts
│   │   │   │       └── embeddings/route.ts
│   │   │   ├── search/route.ts    # POST de búsqueda vectorial
│   │   │   └── ask/route.ts       # POST de pregunta + generación
│   │   ├── documents/[id]/page.tsx
│   │   ├── search/page.tsx        # Pantalla de diagnóstico
│   │   ├── ask/page.tsx           # Pantalla de pregunta y respuesta
│   │   ├── error.tsx
│   │   ├── not-found.tsx
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── documents/
│   │   │   ├── DocumentLibrary.tsx
│   │   │   ├── UploadForm.tsx
│   │   │   ├── DocumentDetail.tsx
│   │   │   ├── DocumentChunkViewer.tsx
│   │   │   ├── DocumentEmbeddingsPanel.tsx
│   │   │   └── StatusBadge.tsx
│   │   ├── search/
│   │   │   └── SearchPanel.tsx    # Formulario y resultados de la búsqueda
│   │   └── ask/
│   │       └── AskPanel.tsx       # Pregunta, respuesta y fuentes verificadas
│   ├── generated/prisma/          # Cliente generado (ignorado por git)
│   └── lib/
│       ├── chunking/
│       │   ├── chunk-text.ts
│       │   └── config.ts
│       ├── client/
│       │   └── read-error.ts      # Lectura segura de errores de la API
│       ├── config.ts
│       ├── db.ts
│       ├── documents/
│       │   ├── chunks.ts
│       │   ├── create-document.ts
│       │   ├── dto.ts
│       │   ├── id.ts              # Validación compartida del id
│       │   ├── queries.ts
│       │   └── types.ts
│       ├── embeddings/
│       │   ├── config.ts          # Modelo, lotes y límites de búsqueda
│       │   ├── generate.ts        # Generación por lotes y resultado parcial
│       │   ├── input.ts           # Validación de pregunta, topK y cuerpo
│       │   ├── load-extractor.ts  # Carga compartida de Transformers.js
│       │   ├── load-provider.ts   # Traducción de errores del modelo
│       │   ├── node-provider.ts   # Singleton para scripts fuera de Next
│       │   ├── provider.ts        # Carga lazy y singleton del modelo
│       │   ├── provider-core.ts   # Prefijos, pooling y validación
│       │   ├── search.ts          # Búsqueda exacta por distancia coseno
│       │   ├── store.ts           # Prisma + SQL parametrizado de vectores
│       │   ├── summary.ts         # Conteo por documento para la UI
│       │   ├── types.ts
│       │   └── vector.ts          # Validación y formato pgvector
│       ├── evaluation/
│       │   ├── dataset.ts         # Zod, fixture y validación referencial
│       │   ├── metrics.ts         # Recall@k, Precision@k y MRR
│       │   ├── report.ts          # Reporte JSON y resumen de consola
│       │   └── run.ts             # Orquestación de estrategias y agregados
│       ├── retrieval/
│       │   ├── config.ts          # Candidatos, RRF y reranking opcional
│       │   ├── hybrid.ts          # Vector + léxico + RRF
│       │   ├── lexical.ts         # tsvector/tsquery con configuración simple
│       │   ├── openrouter-reranker.ts
│       │   ├── reranker.ts        # Validación de índices y mapping
│       │   ├── rrf.ts             # Reciprocal Rank Fusion
│       │   ├── types.ts
│       │   └── vector.ts          # Wrapper de la búsqueda vectorial existente
│       ├── rag/
│       │   ├── ask.ts             # Orquestación: retrieval → prompt → proveedor
│       │   ├── citations.ts       # Limpieza y validación de [S#]
│       │   ├── config.ts          # Límites RAG y credenciales del servidor
│       │   ├── generate.ts        # Presupuesto de contexto y respuesta final
│       │   ├── input.ts           # Validación Zod de documentId y pregunta
│       │   ├── openrouter.ts      # Cliente Chat Completions no streaming
│       │   ├── prompt.ts          # System prompt y fuentes etiquetadas
│       │   ├── queries.ts         # Opciones de documento para la UI
│       │   ├── retrieval.ts       # Búsqueda filtrada por documento
│       │   └── types.ts
│       ├── errors.ts
│       ├── format.ts
│       ├── http.ts
│       └── pdf/
│           ├── validation.ts
│           ├── extract-text.ts
│           └── pdfjs-config.ts
├── tests/
│   ├── chunking.test.mjs
│   └── unit/
│       ├── embeddings.test.ts
│       ├── embeddings-boundaries.test.ts
│       ├── embeddings-generate.test.ts
│       ├── embeddings-sql-params.test.ts
│       ├── eval-dataset.test.ts
│       ├── eval-metrics.test.ts
│       ├── openrouter-reranker.test.ts
│       ├── rag-citations.test.ts
│       ├── rag-generate.test.ts
│       ├── rag-input.test.ts
│       ├── rag-openrouter.test.ts
│       ├── rag-prompt.test.ts
│       ├── rag-verification.test.ts
│       ├── reranker-validation.test.ts
│       ├── retrieval-hybrid.test.ts
│       ├── retrieval-lexical.test.ts
│       ├── retrieval-rrf.test.ts
│       └── retrieval-vector.test.ts
├── samples/
│   └── documento-de-prueba.pdf
├── scripts/
│   ├── eval-retrieval.ts
│   ├── eval-seed.ts
│   └── generate-sample-pdf.mjs
├── docker-compose.yml
├── prisma.config.ts
├── next.config.ts
├── vitest.config.ts
└── package.json
```

## Flujo completo de una carga (Sprint 1)

1. **Selección del archivo.** `UploadForm` acepta un PDF por clic o arrastre y hace una comprobación local de tamaño y tipo para dar feedback rápido.
2. **Envío.** `DocumentLibrary.handleUpload` construye `FormData` y hace `POST /api/documents`.
3. **Validación en servidor.** `validatePdfUpload` comprueba campo, tamaño, MIME declarado, firma `%PDF-` y tamaño real.
4. **Extracción.** `extractPdfPages` abre el PDF con PDF.js, verifica `numPages`, recorre cada página y normaliza espacios conservando `pageNumber`.
5. **Persistencia.** `createDocumentWithPages` crea el `Document` y todas las `DocumentPage` en una transacción. Si algo falla, no queda un registro parcial.
6. **Lectura.** `/documents/[id]` es un Server Component que consulta el documento, sus páginas y sus chunks. La API `GET /api/documents/[id]` expone lo mismo en JSON.

## Flujo de generación de fragmentos (Sprint 2)

1. En el detalle, “Generar fragmentos” llama a `POST /api/documents/[id]/chunks`.
2. El Route Handler valida el id y lee la configuración `CHUNK_*`.
3. `regenerateDocumentChunks` borra los chunks anteriores de las páginas y crea los nuevos dentro de una transacción.
4. Cada `DocumentChunk` guarda `documentPageId`, `chunkIndex`, `content`, `startChar` y `endChar`.
5. La UI muestra los fragmentos por página, su rango de caracteres y los parámetros usados.

El chunker corta primero por párrafos, después por oraciones y al final por palabras. El overlap copia el final del fragmento anterior al principio del siguiente, procurando no cortar palabras.

## Flujo de embeddings y búsqueda (Sprint 3)

### Generación

1. En el detalle del documento, el panel **Embeddings** llama a `POST /api/documents/[id]/embeddings` con `{ "regenerate": false }` o `{ "regenerate": true }`.
2. El servidor valida el id y el cuerpo, y busca los chunks del documento. Si no hay chunks, responde `409`.
3. `findExistingChunkIds` consulta las filas compatibles con el `modelId`, `modelRevision` y `dimensions` actuales. Sin `regenerate`, esos chunks se omiten.
4. Los chunks pendientes se procesan en lotes de `EMBEDDING_BATCH_SIZE`.
5. Para cada lote, `EmbeddingProvider.embedPassages` agrega `"passage: "` a cada texto, ejecuta el modelo, aplica mean pooling y normalización, y valida que cada vector tenga 384 números finitos.
6. `upsertEmbeddingBatch` inserta el lote con una sola sentencia parametrizada. El `ON CONFLICT` sobre `(chunkId, modelId, modelRevision)` actualiza la fila existente en lugar de duplicarla.
7. Si un lote falla, se registra el número de lote y la etapa (`embedding` o `persistence`), y se continúa con los demás. El resultado final indica `complete`, `partial` o `failed`.
8. La UI actualiza el conteo y muestra el detalle de los lotes fallidos.

### Búsqueda

1. `/search` envía `{ "query": "...", "topK": 5 }` a `POST /api/search`.
2. El servidor valida la pregunta (no vacía, máximo `SEARCH_QUERY_MAX_CHARS`) y `topK` (entero entre 1 y `SEARCH_MAX_TOP_K`).
3. Si no hay embeddings para el modelo actual, devuelve `indexedChunkCount: 0` sin cargar el modelo.
4. Si hay embeddings, `EmbeddingProvider.embedQuery` agrega `"query: "`, genera el vector y lo valida.
5. La consulta SQL usa `<=>` para calcular distancia coseno, filtra por `modelId`, `modelRevision` y `dimensions`, ordena ascendente y limita a `topK`.
6. La API devuelve contenido, documento, página, `chunkIndex`, distancia y similitud (`1 - distancia`). No devuelve el vector.
7. La UI muestra los resultados en orden, con el documento y la página de origen.

## Flujo de respuesta RAG (Sprint 4)

1. `/ask` muestra un selector con los documentos y su cantidad de embeddings compatibles con el modelo actual.
2. El formulario envía `{ "documentId": "...", "question": "..." }` a `POST /api/ask`.
3. Zod valida el cuerpo; el id usa la misma validación que el resto de la app. Una pregunta vacía o demasiado larga se rechaza con `400`.
4. El servidor busca el documento. Si no existe, responde `404`. Si no tiene embeddings compatibles, responde `200` con `noEvidence: true` sin cargar el modelo ni llamar a OpenRouter.
5. `EmbeddingProvider.embedQuery` agrega `query: ` y genera el vector de la pregunta con el mismo modelo/revisión del índice.
6. `findNearestChunksForDocument` ejecuta la búsqueda exacta `<=>` filtrada por documento, modelo, revisión y dimensión. Ordena por distancia ascendente y limita a `RAG_TOP_K`.
7. `prepareRagPrompt` asigna `[S1]`, `[S2]`, ... en orden de recuperación y arma bloques con nombre de documento, página y texto. Solo incluye los bloques que caben en `RAG_MAX_CONTEXT_CHARS`; el último puede truncarse.
8. El system prompt indica que las fuentes son datos de referencia, no instrucciones, y que el modelo debe abstenerse si no alcanza la evidencia.
9. `requestChatCompletion` envía el prompt a OpenRouter sin streaming, con timeout y errores seguros. El servidor no envía `temperature` ni `top_p`, porque no todos los modelos los aceptan.
10. `sanitizeAnswerCitations` conserva solo los `[S#]` que existen entre las fuentes. Los IDs inventados se eliminan del texto y nunca crean metadata.
11. La API devuelve la respuesta, los IDs citados y **todas** las fuentes que llegaron al prompt, con documento, página, fragmento, distancia y estado de cita. La UI las muestra en una sección expandible.

### Qué es un embedding

Un embedding es una lista de números que representa un texto. No es una palabra clave ni una traducción legible: es una posición en un espacio vectorial construida por el modelo. Textos con temas parecidos suelen quedar cerca. E5 produce vectores de 384 dimensiones para este proyecto.

### Similitud y distancia coseno

La similitud coseno mide el ángulo entre dos vectores:

```text
similitud(A, B) = (A · B) / (||A|| * ||B||)
```

Si los vectores están normalizados, el denominador vale 1 y la similitud es el producto punto. pgvector calcula **distancia coseno** con `<=>`:

```text
distancia = 1 - similitud
```

Menor distancia significa mayor similitud. La UI muestra la distancia y también `1 - distancia` como porcentaje para facilitar la lectura. No se aplica un umbral: se muestran los `topK` más cercanos aunque estén lejos.

## Flujo de evaluación de recuperación (Sprint 5)

La pregunta central del sprint es doble: **¿la búsqueda recupera los fragmentos correctos?** y **¿la respuesta usa esos fragmentos y los cita bien?** Son problemas distintos. Una búsqueda perfecta no garantiza una buena respuesta, y una respuesta convincente puede estar basada en fragmentos irrelevantes.

### Gold set y fixture

`eval/gold-set.json` contiene 25 casos revisados manualmente: 20 respondibles y 5 no respondibles. Cada caso declara el documento, los chunks relevantes y, cuando corresponde, los hechos esperados:

```json
{
  "id": "q-02",
  "question": "¿Cuántos días de aviso exige el contrato para cancelar el servicio?",
  "documentId": "eval-doc-contrato",
  "relevantChunkIds": ["eval-chunk-contrato-04"],
  "answerable": true,
  "expectedFacts": ["Se requieren treinta (30) días corridos de aviso por escrito."]
}
```

`eval/fixtures/fictional-documents.json` define dos documentos ficticios con IDs deterministas: un contrato de servicios y un manual de producto. No se usan documentos reales ni sensibles. `npm run eval:seed` inserta o reemplaza esos documentos y genera sus 21 embeddings con el modelo local configurado; es idempotente y no llama a ningún LLM. La validación con Zod rechaza IDs duplicados, documentos inexistentes, chunks de otro documento y casos donde `answerable` no coincide con la lista de chunks relevantes.

### Métricas

| Métrica | Qué mide | Fórmula |
| --- | --- | --- |
| Recall@k | Qué proporción de los chunks relevantes aparece en los primeros `k`. | `aciertos en top-k / total de chunks relevantes` |
| Precision@k | Qué proporción de los primeros `k` resultados es relevante. | `aciertos en top-k / k` |
| MRR | Qué tan arriba aparece el primer chunk relevante. | `1 / posición del primer relevante`, o `0` si no aparece |

**Precision@k divide por `k`, no por la cantidad efectivamente devuelta.** Si una estrategia devuelve menos de `k` resultados, las posiciones ausentes cuentan como no relevantes. La regla se aplica en todos los reportes y está registrada en el JSON (`precisionAtKDenominator: "k"`). Los casos no respondibles no tienen chunks relevantes: se excluyen de los promedios de recuperación y quedan para la evaluación de abstención.

En este dataset la mayoría de los casos tiene un solo chunk relevante; con `k = 5`, el máximo de Precision@5 por caso es `0.2`. Por eso un valor cercano a `0.21` no significa “mal retrieval”: significa que hay un chunk relevante y cuatro posiciones que no lo son. El caso `q-06` tiene dos chunks relevantes y eleva levemente el promedio.

### Estrategias comparadas

1. **Vectorial:** reutiliza el embedding `query: ` y la búsqueda exacta `<=>` sobre pgvector, filtrada por documento, modelo, revisión y dimensiones.
2. **Léxica:** `to_tsvector('simple', content)` contra `websearch_to_tsquery('simple', $1)`, con `ts_rank_cd` y un índice GIN. La consulta se parametriza y se construye con los términos de la pregunta unidos por OR, porque `websearch_to_tsquery` interpreta una pregunta completa como AND y exige que el chunk contenga todas las palabras. Los términos entre comillas evitan que palabras como `or` se conviertan en operadores.
3. **Híbrida:** pide 20 candidatos a cada fuente, los fusiona con RRF y devuelve el top-k.
4. **Híbrida + rerank:** si hay un modelo configurado, envía los candidatos fusionados al reranker y vuelve a ordenar. Si no hay configuración, la estrategia se reporta como `skipped` y el comando termina normalmente.

### Reciprocal Rank Fusion

RRF combina **posiciones**, no scores:

```text
RRF(d) = Σ 1 / (k + rank_s(d))
```

La constante por defecto es `k = 60` (`RETRIEVAL_RRF_K`). Un chunk que aparece bien ubicado en ambas listas suma dos contribuciones; uno que aparece en una sola suma una. Si un chunk se repite dentro de una misma lista, se cuenta una vez; si aparece en ambas listas, se conserva la trazabilidad con `sourceRanks` (`vector` y `lexical`, con su posición y score original). No sumamos distancia coseno y `ts_rank_cd` directamente porque no comparten escala ni significado: la distancia es menor cuando el texto es más parecido, mientras que el score léxico es mayor cuando coincide más. Comparar posiciones evita inventar una normalización arbitraria.

### Comando y reporte

```bash
npm run eval:seed          # una vez, o después de editar el fixture
npm run eval:retrieval     # ejecuta los 25 casos sin LLM
npm run eval:retrieval -- --top-k 5 --candidates 20 --rrf-k 60
npm run eval:retrieval -- --no-rerank
```

El comando imprime un resumen por estrategia, los casos donde un chunk relevante no aparece o aparece más abajo, y escribe un JSON en `eval/reports/`. El reporte registra fecha, versión de Node, hashes del fixture y del gold set, modelo/revisión/dimensión del embedding, `topK`, candidatos, constante RRF, estado del reranking, agregados por estrategia, rangos de los chunks relevantes y latencias por caso. La latencia del embedding se mide una vez por caso y se informa aparte; la latencia de cada estrategia no la duplica. Si una estrategia falla en un caso, ese caso no entra en los promedios: el reporte expone `metricCaseCount` y `failedCaseCount`, muestra el denominador en la consola y el comando termina con código 1.

`eval/reports/reference-report.json` es una ejecución real de referencia generada en este entorno con el fixture de 25 casos. No es una promesa de resultados universales: depende del corpus, del modelo y del hardware.

### Resultado de referencia (ejecución real)

| Estrategia | Casos | Recall@5 | Precision@5 | MRR | Latencia media |
| --- | ---: | ---: | ---: | ---: | ---: |
| `vector` | 25 | 1.0000 | 0.2100 | 0.9667 | 2 ms |
| `lexical` | 25 | 0.9500 | 0.2000 | 0.6350 | 2 ms |
| `hybrid` | 25 | 1.0000 | 0.2100 | 0.9000 | 2 ms |
| `hybrid-rerank` | — | — | — | — | skipped (`missing_model`) |

Lectura honesta de esta muestra:

- La búsqueda vectorial encontró todos los chunks relevantes en el top-5 y casi siempre en la primera posición. El corpus es pequeño y los documentos fueron escritos para ser recuperables; no generalices este resultado.
- La búsqueda léxica encontró el 95 % de los chunks relevantes, pero los ordenó peor. Es útil para códigos exactos (`ESC-104`, `FLT-450-A`, `VAL-450`) y para preguntas con términos literales; no reemplaza al vector.
- La híbrida mantuvo Recall@5 en 1.0, pero su MRR fue menor porque RRF también incorpora las posiciones léxicas. En este dataset el baseline vectorial ya era muy fuerte. La comparación sirve para ver el efecto, no para declarar un ganador universal.
- El reranking no se ejecutó: no hay `RERANK_MODEL` configurado. El cliente se validó con `fetch` mockeado. No se asume que exista un modelo gratuito.

### Índice GIN y costo

La migración `20261112220247_add_document_chunk_fts_index` crea:

```sql
CREATE INDEX "DocumentChunk_content_simple_fts_idx"
ON "DocumentChunk"
USING GIN (to_tsvector('simple', "content"));
```

La expresión del índice debe coincidir exactamente con la de la consulta para que PostgreSQL pueda usarlo. GIN acelera las búsquedas de texto completo a costa de almacenamiento y de escrituras más caras; en este corpus local el planner puede elegir un scan secuencial porque la tabla es minúscula, pero el índice queda preparado para crecer. Es una limitación conocida de Prisma que los índices de expresión no se puedan declarar en `schema.prisma`: la migración es SQL manual. Al crear una migración futura con `prisma migrate dev --create-only`, revisá el SQL generado para no perder este índice.

### Calidad de respuesta

`eval/answer-quality-review.md` es una plantilla manual para revisar las respuestas del Sprint 4 con cinco ejes: exactitud, fidelidad a las fuentes, validez de las citas, abstención y latencia/uso. No hay un LLM juez en este sprint. El prompt de respuesta no se modificó; si se propone un cambio, primero hay que definir cómo se evaluaría con los mismos casos y la misma tabla.

### Límites del dataset y próximos pasos

- 25 casos, dos documentos ficticios y un solo modelo de embeddings: es una muestra para aprender y para detectar regresiones, no un benchmark representativo.
- La relevancia está etiquetada a nivel de chunk; un chunk puede contener la respuesta y no ser el único fragmento útil.
- No hay stemming español/italiano: `simple` solo tokeniza y baja a minúsculas. Probar configuraciones lingüísticas es trabajo futuro.
- No hay índice ANN ni corpus grande; la latencia no refleja un sistema en producción.
- No hay juez automático ni intervalo de confianza. Con 20 casos respondibles, una diferencia de MRR puede ser ruido.
- Próximos pasos: ampliar el gold set, agregar documentos reales anonimizados, conectar la estrategia ganadora a `/ask` con una comparación A/B, evaluar un juez LLM contra la revisión manual, medir costo/latencia con más volumen y probar configuraciones de texto en español e italiano.

## Modelo de datos

```prisma
model Document {
  id               String         @id @default(cuid())
  originalFilename String
  mimeType         String
  sizeBytes        Int
  pageCount        Int
  status           DocumentStatus @default(PROCESSED)
  errorMessage     String?
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt
  pages            DocumentPage[]
}

model DocumentPage {
  id         String          @id @default(cuid())
  documentId String
  pageNumber Int
  text       String
  document   Document        @relation(fields: [documentId], references: [id], onDelete: Cascade)
  chunks     DocumentChunk[]

  @@unique([documentId, pageNumber])
  @@index([documentId])
}

model DocumentChunk {
  id             String          @id @default(cuid())
  documentPageId String
  chunkIndex     Int
  content        String
  startChar      Int
  endChar        Int
  createdAt      DateTime        @default(now())
  documentPage   DocumentPage    @relation(fields: [documentPageId], references: [id], onDelete: Cascade)
  embeddings     ChunkEmbedding[]

  @@unique([documentPageId, chunkIndex])
  @@index([documentPageId])
}

model ChunkEmbedding {
  id            String        @id @default(cuid())
  chunkId       String
  modelId       String
  modelRevision String
  dimensions    Int
  embedding     Unsupported("vector(384)")
  createdAt     DateTime      @default(now())
  chunk         DocumentChunk @relation(fields: [chunkId], references: [id], onDelete: Cascade)

  @@unique([chunkId, modelId, modelRevision])
  @@index([modelId, modelRevision])
}
```

Prisma 7 no trata `vector` como un escalar normal. El campo aparece como `Unsupported("vector(384)")`: la columna existe en PostgreSQL, pero no se puede leer ni escribir desde el cliente tipado. Por eso las inserciones y búsquedas vectoriales usan `prisma.$executeRaw`/`prisma.$queryRaw` con `Prisma.sql` y parámetros. El resto de las relaciones y conteos sí usa Prisma.

La clave foránea con `onDelete: Cascade` hace que al borrar un chunk (o una página o un documento) también se borren sus embeddings. Regenerar los chunks de un documento, por lo tanto, elimina los embeddings anteriores y obliga a regenerarlos.

## API

### `POST /api/documents`

`multipart/form-data` con el campo `file`. Responde `201` con el resumen del documento.

### `GET /api/documents`

Devuelve `{ "documents": [...] }` ordenados por fecha de creación descendente.

### `GET /api/documents/[id]`

Devuelve el documento con `pages` ordenadas por `pageNumber` y sus `chunks` ordenados por `chunkIndex`.

### `POST /api/documents/[id]/chunks`

Genera o regenera los fragmentos. No recibe cuerpo; los parámetros salen de `CHUNK_*`. Es idempotente: reemplaza los fragmentos anteriores dentro de una transacción.

### `POST /api/documents/[id]/embeddings`

Genera embeddings para los chunks del documento.

```bash
# Generar solo los pendientes
curl -X POST http://localhost:3000/api/documents/<id>/embeddings \
  -H "Content-Type: application/json" \
  -d '{}'

# Regenerar todos los del modelo/revisión actual
curl -X POST http://localhost:3000/api/documents/<id>/embeddings \
  -H "Content-Type: application/json" \
  -d '{"regenerate":true}'
```

Respuesta `200`:

```json
{
  "documentId": "cm...",
  "model": {
    "modelId": "Xenova/multilingual-e5-small",
    "modelRevision": "761b726dd34fb83930e26aab4e9ac3899aa1fa78",
    "dimensions": 384
  },
  "chunkCount": 2,
  "embeddedChunkCount": 2,
  "generatedCount": 2,
  "skippedCount": 0,
  "failedCount": 0,
  "status": "complete",
  "errors": []
}
```

Si un lote falla, `status` es `partial` (si otro lote funcionó) o `failed` (si no funcionó ninguno), y `errors` indica el lote y la etapa. Si el documento no tiene chunks, responde `409` con `DOCUMENT_WITHOUT_CHUNKS`.

### `POST /api/search`

```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"¿Cuál es el período de garantía?","topK":5}'
```

Respuesta `200`:

```json
{
  "search": {
    "query": "¿Cuál es el período de garantía?",
    "topK": 5,
    "model": {
      "modelId": "Xenova/multilingual-e5-small",
      "modelRevision": "761b726dd34fb83930e26aab4e9ac3899aa1fa78",
      "dimensions": 384
    },
    "indexedChunkCount": 2,
    "results": [
      {
        "chunkId": "cm...",
        "documentId": "cm...",
        "documentName": "documento-de-prueba.pdf",
        "pageNumber": 1,
        "chunkIndex": 0,
        "content": "El período de garantía del producto es de dos años.",
        "distance": 0.13657888232091797,
        "similarity": 0.863421117679082
      }
    ]
  }
}
```

Los resultados se ordenan por distancia ascendente. No se devuelve el vector. No se aplica un umbral de distancia. Si no hay embeddings para el modelo actual, `indexedChunkCount` es `0` y `results` es `[]`.

### `POST /api/ask`

```bash
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"documentId":"cm...","question":"¿Cuál es el período de garantía?"}'
```

Respuesta `200` (resumida):

```json
{
  "ask": {
    "documentId": "cm...",
    "documentName": "documento-de-prueba.pdf",
    "question": "¿Cuál es el período de garantía?",
    "answer": "El período de garantía del producto es de dos años [S1].",
    "sources": [
      {
        "sourceId": "S1",
        "documentId": "cm...",
        "documentName": "documento-de-prueba.pdf",
        "pageNumber": 1,
        "chunkId": "cm...",
        "excerpt": "El período de garantía del producto es de dos años.",
        "retrievalDistance": 0.13657888232091797,
        "cited": true
      }
    ],
    "citedSourceIds": ["S1"],
    "noEvidence": false,
    "noEvidenceReason": null,
    "model": "modelo/elegido-en-openrouter",
    "usage": {
      "promptTokens": 420,
      "completionTokens": 32,
      "totalTokens": 452,
      "cost": 0.0002
    },
    "contextChars": 1120,
    "retrieval": {
      "topK": 5,
      "retrievedCount": 2,
      "indexedChunkCount": 2
    }
  }
}
```

Sin embeddings compatibles, la respuesta es `200` con `noEvidence: true`, `sources: []`, `model: null` y sin llamada a OpenRouter. La configuración faltante responde `503`; un timeout del proveedor, `504`; un error HTTP, respuesta malformada o error embebido de OpenRouter, `502`.

### Errores

Todas las respuestas de error tienen la misma forma:

```json
{
  "error": {
    "code": "INVALID_SEARCH_QUERY",
    "message": "Escribí una pregunta para buscar."
  }
}
```

| Código | HTTP | Cuándo aparece |
| --- | --- | --- |
| `MISSING_FILE` | 400 | No se envió el campo `file`. |
| `EMPTY_FILE` | 400 | El archivo tiene 0 bytes. |
| `INVALID_FORM_DATA` | 400 | El cuerpo multipart no se pudo leer. |
| `FILE_TOO_LARGE` | 413 | Supera `MAX_PDF_SIZE_MB`. |
| `INVALID_FILE_TYPE` | 415 | El MIME declarado no es PDF. |
| `INVALID_PDF_HEADER` | 400 | No se encontró la firma `%PDF-`. |
| `TOO_MANY_PAGES` | 422 | Supera `MAX_PDF_PAGES`. |
| `NO_EXTRACTABLE_TEXT` | 422 | Ninguna página tiene texto seleccionable. |
| `CORRUPT_PDF` | 422 | PDF.js no pudo interpretar el archivo. |
| `DOCUMENT_NOT_FOUND` | 404 | El id no existe. |
| `INVALID_DOCUMENT_ID` | 400 | El id no tiene un formato seguro. |
| `INVALID_REQUEST_BODY` | 400 | El cuerpo JSON es inválido, demasiado grande o tiene un campo con el tipo equivocado. |
| `INVALID_SEARCH_QUERY` | 400 | La pregunta está vacía, no es texto o supera el límite. |
| `INVALID_TOP_K` | 400 | `topK` no es un entero entre 1 y el máximo. |
| `DOCUMENT_WITHOUT_CHUNKS` | 409 | Se intentaron generar embeddings sin fragmentos. |
| `EMBEDDING_MODEL_UNAVAILABLE` | 503 | El modelo no se pudo cargar (descarga, caché o configuración). |
| `EMBEDDING_QUERY_FAILED` | 500 | El modelo no pudo generar el vector de la pregunta. |
| `INVALID_ASK_QUESTION` | 400 | La pregunta está vacía o supera `RAG_QUESTION_MAX_CHARS`. |
| `OPENROUTER_NOT_CONFIGURED` | 503 | Faltan `OPENROUTER_API_KEY` u `OPENROUTER_MODEL` en el servidor. |
| `RAG_PROVIDER_TIMEOUT` | 504 | OpenRouter no respondió dentro de `RAG_PROVIDER_TIMEOUT_MS`. |
| `RAG_PROVIDER_ERROR` | 502 | OpenRouter devolvió un error, una respuesta malformada o un error embebido. |
| `INTERNAL_ERROR` | 500 | Error inesperado; el detalle queda en la terminal. |

## Decisiones técnicas

### Embeddings locales

El modelo corre en el proceso de Node.js con `@huggingface/transformers` y ONNX Runtime. El texto no se envía a un proveedor externo. La contracara es que la primera ejecución descarga unos 470 MB y la inferencia compite por CPU con el resto del servidor.

### Identificador y revisión del modelo

Cada fila guarda `modelId`, `modelRevision`, `dimensions` y el chunk. La revisión por defecto es un commit fijo de Hugging Face, no `main`, para que la descarga y los vectores sean reproducibles. La búsqueda filtra por los tres metadatos; si se cambia el modelo o la revisión, los vectores anteriores no se mezclan y hay que regenerarlos.

La precisión también forma parte de la configuración: este sprint usa `fp32`. Cambiar a `q8` u otra variante exige regenerar los vectores y, si se hace de forma permanente, documentar la nueva configuración. La columna `vector(384)` es fija; un modelo con otra dimensión requiere una migración.

### Prefijos E5

E5 fue entrenado con `passage: ` para documentos y `query: ` para preguntas. No son adornos: son parte del formato de entrada. El proveedor los aplica en un solo lugar y las pruebas verifican que se envíen.

### Mean pooling y normalización

La inferencia devuelve un vector por token. El pooling mean promedia los tokens de cada texto y la normalización L2 deja el vector con norma 1. Con vectores normalizados, el producto punto y la similitud coseno coinciden, y la distancia de pgvector es estable.

### Búsqueda exacta antes que ANN

El corpus es chico. `ORDER BY embedding <=> $1` recorre todas las filas compatibles y devuelve el orden exacto, que es fácil de inspeccionar y explicar. HNSW o IVFFlat serían una optimización prematura: primero hay que medir cuándo la búsqueda exacta deja de ser suficiente.

### SQL parametrizado

Las operaciones vectoriales usan `Prisma.sql` y `$queryRaw`/`$executeRaw`. El vector se envía como texto y se castea con `::vector`; la pregunta, el modelo, la revisión, la dimensión y el `topK` son parámetros. No se usa `$queryRawUnsafe` ni se concatena texto del usuario.

### Idempotencia en dos capas

1. Antes de generar, se consultan los chunks que ya tienen una fila compatible y se omiten.
2. El `INSERT` usa `ON CONFLICT ("chunkId", "modelId", "modelRevision") DO UPDATE`, así que una carrera o una repetición actualiza en lugar de duplicar.

`regenerate: true` es la única forma de volver a generar filas existentes. La UI lo muestra como “Regenerar todos” y no lo ejecuta implícitamente.

### Fallos parciales

Cada lote es una unidad: si la inferencia o la escritura falla, se cuentan sus chunks como fallidos y se sigue con el próximo lote. La respuesta indica cuántos se generaron, omitieron y fallaron, y qué lotes fallaron. La UI usa un mensaje de error distinto para `partial` y `failed`; nunca muestra “completado” si hubo fallos. Los embeddings anteriores de un lote que no se pudo regenerar quedan intactos.

### Generación con OpenRouter

El servidor usa `fetch` contra `https://openrouter.ai/api/v1/chat/completions` con `stream: false`. La API key vive en `OPENROUTER_API_KEY` y solo se lee en el servidor; nunca se envía al cliente. El modelo se configura con `OPENROUTER_MODEL` y no se asume que un modelo gratuito esté siempre disponible. Se usa `AbortSignal.timeout` y se distinguen timeout, error HTTP, error de red, respuesta malformada y error embebido en un `200`. OpenRouter documenta que una respuesta no streaming puede traer un objeto `error` sin `choices`; el cliente lo trata como fallo del proveedor.

### Contexto y citas

El prompt no envía el PDF completo: envía solo los fragmentos recuperados, con `[S1]`, `[S2]`, ... y su documento y página. El servidor conserva el mapeo de cada ID a un chunk real. Después de recibir la respuesta, elimina los IDs que no correspondan a una fuente recuperada y arma la metadata desde la base, no desde el texto del modelo. Por eso una cita inventada como `[S9]` no puede crear una página, un documento ni un fragmento nuevo. La UI muestra todas las fuentes que llegaron al prompt, estén citadas o no.

### Sin evidencia

Si el documento no tiene embeddings compatibles, la API devuelve `noEvidence: true` sin cargar el modelo de embeddings ni llamar a OpenRouter. Si el presupuesto de contexto no permite incluir ningún bloque, se devuelve el mismo estado con `noEvidenceReason: "context_budget"`. No se inventa un umbral de similitud: una distancia alta no convierte automáticamente un resultado en “sin evidencia”, porque esa calibración requiere datos de evaluación.

### Sin logs de contenido

La terminal registra el modelo, la revisión, la cantidad de lotes, la duración del retrieval y la generación, el estado HTTP del proveedor, el usage y los errores técnicos. No registra el texto de los documentos, la pregunta completa, el prompt completo ni la API key. Los errores que se devuelven al cliente son mensajes seguros, sin trazas internas ni cuerpo del proveedor.

### Prisma y `Unsupported`

Prisma modela las entidades y relaciones normales, pero no puede leer ni escribir `vector(384)` desde el cliente tipado. El esquema declara la columna como `Unsupported` para que las migraciones la creen y para que Prisma Studio no intente deserializarla. Las consultas vectoriales viven en `src/lib/embeddings/store.ts`. Prisma Studio no puede abrir la tabla `ChunkEmbedding` sin errores de deserialización; para inspeccionarla se usa `psql`.

### Descarga y caché del modelo

La primera llamada descarga el modelo y sus archivos de tokenización en `.cache/transformers/`. El proceso reutiliza una sola instancia del pipeline; en desarrollo, el singleton vive en `globalThis` para sobrevivir a recargas de módulos. Si la carga falla, la promesa se limpia para permitir un reintento.

### Búsqueda léxica con `simple`

La configuración `simple` de PostgreSQL no aplica stemming ni stopwords: solo tokeniza y normaliza a minúsculas. Es un punto de partida deliberadamente neutro para documentos en español e italiano. La consulta se construye uniendo los términos con OR y cada término va entre comillas antes de pasarlo como parámetro a `websearch_to_tsquery`; así una pregunta completa no se convierte en un AND imposible de satisfacer y una palabra como `or` no se interpreta como operador. La consulta sigue siendo parametrizada: el texto nunca se concatena en el SQL.

### RRF y scores incompatibles

La distancia coseno y `ts_rank_cd` no comparten escala. La primera es menor cuando el texto es más parecido; el segundo es mayor cuando hay más coincidencias léxicas. Sumarlos exigiría una normalización arbitraria. RRF usa solo posiciones (`1 / (k + rank)`), conserva el ranking original de cada fuente y hace que un chunk bien ubicado en ambas listas suba. Los duplicados dentro de una lista se eliminan antes de asignar posiciones; un chunk presente en las dos listas suma una contribución por lista.

### Precision@k con denominador `k`

Precision@k se calcula dividiendo por `k`, no por la cantidad devuelta. Si una estrategia devuelve menos resultados, las posiciones faltantes cuentan como no relevantes. Es la regla documentada en el reporte y en la sección de métricas, y se aplica a todas las estrategias para que la comparación sea consistente.

### Reranking opcional

El adaptador `Reranker` recibe la pregunta y los candidatos, y devuelve una lista ordenada con scores. El cliente de OpenRouter valida que cada índice devuelto sea entero, esté dentro del rango enviado y no se repita; también maneja timeout, 429, 5xx, errores de red, JSON malformado, respuestas vacías y objetos `error`. La latencia y el usage se registran sin guardar la pregunta ni el texto de los candidatos. Si no hay `RERANK_MODEL` o clave, la estrategia se omite y el comando de evaluación no falla.

### Índice GIN fuera del schema

Prisma no puede declarar índices de expresión como `to_tsvector('simple', content)` en `schema.prisma`. La migración lo crea con SQL manual y la consulta usa exactamente la misma expresión para que PostgreSQL pueda aprovecharlo. GIN agrega costo de almacenamiento y escritura; en el corpus local el planner puede preferir un scan secuencial, pero el índice queda listo para un corpus mayor. Al generar futuras migraciones con `--create-only`, revisar que Prisma no proponga eliminar este índice desconocido.

### CLI fuera de Next

`npm run eval:retrieval` y `npm run eval:seed` se ejecutan con `tsx`, fuera del servidor de Next.js. El cargador del modelo se extrajo a `src/lib/embeddings/load-extractor.ts` y el CLI usa `node-provider.ts`; el servidor sigue usando `provider.ts` con la guardia `server-only`. Así ambos caminos comparten revisión, dtype y caché, sin duplicar la carga del modelo.

## Seguridad y límites conocidos

- **Sin autenticación ni aislamiento:** cualquier persona con acceso a la URL puede subir, leer, buscar y preguntar sobre cualquier documento de la biblioteca. `/ask` filtra los chunks por documento, pero no hay usuarios ni ownership: el filtro es de alcance de la pregunta, no de permisos. No exponer públicamente.
- **Sin OCR:** un PDF escaneado como imagen se rechaza con “No se encontró texto seleccionable en el PDF.”.
- **Límites en memoria:** 10 MB y 50 páginas por defecto. La extracción es síncrona y ocurre en el proceso de Next.js.
- **Inferencia en CPU:** la generación de embeddings puede tardar varios segundos o minutos según la cantidad de chunks y el hardware. La primera ejecución incluye la descarga del modelo.
- **Dependencia de red la primera vez:** sin conexión a Hugging Face, el modelo no se puede descargar. Después los archivos se reutilizan desde la caché local, pero Transformers.js puede seguir resolviendo metadatos remotos; no se verificó un arranque completamente offline.
- **Límite de tokens del modelo:** E5 tiene una ventana de 512 tokens. El chunker mide caracteres, no tokens; un chunk de 1.200 caracteres puede truncarse en algunos idiomas. La pregunta también se trunca si supera la ventana, aunque la API limite los caracteres.
- **Dimensión fija:** `vector(384)` está atado a E5-small. Cambiar a un modelo de otra dimensión exige migración, cambio de constante y regeneración.
- **Precisión fija:** el sprint usa `fp32`. Cambiar de precisión puede cambiar los vectores; hay que regenerarlos y documentarlo.
- **Vectores de modelos anteriores:** no se borran automáticamente. Quedan en la tabla para comparar y se pueden eliminar con SQL. No se mezclan en la búsqueda porque el filtro usa el modelo y la revisión actuales.
- **Sin índice ANN:** la búsqueda exacta es O(n) sobre las filas compatibles. Con un corpus grande habrá que medir y evaluar HNSW/IVFFlat.
- **Sin umbral de distancia:** la búsqueda siempre devuelve hasta `topK` resultados, incluso si son poco relevantes. La evaluación del Sprint 5 mide aciertos, pero no fija un umbral universal.
- **Híbrida y reranking no conectados a `/ask`:** la comparación vive en `npm run eval:retrieval`; la respuesta del Sprint 4 sigue usando recuperación vectorial.
- **Sin streaming:** la respuesta se valida completa antes de mostrarse. Esto facilita comprobar citas, pero aumenta la espera percibida.
- **Sin historial ni agentes:** cada pregunta es independiente; no hay memoria de la conversación ni herramientas.
- **El documento sale del servidor:** a diferencia de los embeddings, la generación envía los fragmentos recuperados a OpenRouter. Si activás el reranking, la pregunta y los chunks candidatos también se envían al proveedor. No uses documentos confidenciales en esta versión local sin evaluar ese intercambio.
- **Prompt injection:** el system prompt indica tratar las fuentes como datos y no como instrucciones, pero no es una barrera de seguridad completa. Falta una capa de controles adicionales.
- **Respuestas no garantizadas:** pedir “no alucines” reduce el riesgo, no lo elimina. La app muestra fuentes y citas para que una persona pueda revisar el origen.
- **Evaluación pequeña y no representativa:** hay 25 casos sobre dos documentos ficticios y un solo modelo de embeddings. Sirve para detectar regresiones y aprender, no para afirmar qué estrategia es mejor en general. La calidad de respuesta se revisa a mano con `eval/answer-quality-review.md`; no hay juez automático.
- **Sin rate limiting:** no hay protección contra abuso de la API ni del proveedor.
- **Sin progreso en tiempo real:** la UI muestra “Generando respuesta…” mientras espera; no hay porcentaje ni streaming.
- **Regeneración concurrente:** dos pedidos simultáneos sobre el mismo documento pueden competir. El `ON CONFLICT` y la transacción protegen la integridad, pero el resultado de cada pedido puede ser distinto. No es un escenario esperado en esta versión local.
- **Regenerar chunks borra embeddings:** la cascada elimina los vectores de los chunks reemplazados. Hay que volver a generarlos.
- **Prisma Studio:** no puede leer la tabla `ChunkEmbedding` por el tipo `vector`.
- **Proveedores no verificados en red real en este sprint:** el cliente de reranking se validó con `fetch` mockeado y no se ejecutó una llamada real porque no hay `RERANK_MODEL` configurado. La generación del Sprint 4 no se volvió a probar con una llamada real en este sprint. No se afirma que una llamada de red haya funcionado.
- **Build de producción:** esta entrega se validó con `tsc`, ESLint, tests y los comandos de evaluación. No se ejecutó `npm run build` (regla del proyecto). Si se despliega, revisar el empaquetado de `@huggingface/transformers`, `onnxruntime-node`, `sharp`, `zod` y `tsx` (este último es solo para scripts).

## Cómo probar manualmente

1. Usa `samples/documento-de-prueba.pdf` o sube un PDF con texto seleccionable.
2. Abre el documento y pulsa **Generar fragmentos** si todavía no tiene.
3. Pulsa **Generar embeddings**. La primera vez puede descargar el modelo; revisa la terminal y `.cache/transformers/`.
4. Verifica que el panel muestre “2 de 2 fragmentos con embeddings” (o el total del documento).
5. Pulsa **Regenerar todos** y confirma que la cantidad de filas no cambia.
6. Ve a **Buscar** y prueba:
   - “¿Cuál es el período de garantía del producto?” → debe recuperar la página 1.
   - “¿Qué hace el asistente con el texto?” → debe recuperar la página 2.
7. Confirma que cada resultado muestra documento, página, distancia y similitud.
8. Configura `OPENROUTER_API_KEY` y `OPENROUTER_MODEL` en `.env` y reinicia el servidor. Sin esas variables, comprueba que `/api/ask` responde `503` después de recuperar fragmentos.
9. Ve a **Preguntar**, elige el documento y pregunta algo cuya respuesta esté claramente en una página. Confirma que la respuesta cita `[S1]` (o el ID correspondiente) y que la fuente muestra la página correcta.
10. Pregunta algo que no esté en el documento. El modelo debe decir que no encontró evidencia suficiente; si responde de todos modos, revisa las fuentes y no lo tomes como una respuesta respaldada.
11. Abre el detalle de fuentes y confirma que aparecen todos los fragmentos enviados al modelo, incluso los que no fueron citados, con documento, página, excerpt y distancia.
12. Fuerza un error del proveedor (por ejemplo, una API key inválida o un modelo inexistente) y comprueba que la UI muestra un mensaje entendible, sin claves, prompts ni respuestas crudas.
13. Abre las herramientas del navegador y busca `OPENROUTER_API_KEY` en el bundle, Network y Local Storage: no debe aparecer.
14. Prueba una pregunta vacía y una de más de `RAG_QUESTION_MAX_CHARS`: la API debe responder `400`.
15. Prueba `RAG_TOP_K` en `0` o `21`: se usa el valor por defecto con una advertencia, no se rompe la app.
16. Cambia `EMBEDDING_MODEL_ID` o `EMBEDDING_MODEL_REVISION` en `.env`, reinicia el servidor y pregunta: el documento debe quedar sin embeddings compatibles y la API debe devolver `noEvidence: true` sin llamar a OpenRouter.
17. Si regeneras los chunks de un documento, vuelve a generar sus embeddings antes de preguntar.
18. Ejecuta `npm run eval:seed` y confirma que inserta 2 documentos y 21 chunks con embeddings. El comando es idempotente: repetirlo no duplica filas.
19. Ejecuta `npm run eval:retrieval`. Debe imprimir las estrategias `vector`, `lexical`, `hybrid` y `hybrid-rerank` (esta última como `skipped` si no configuraste un modelo) y escribir un JSON en `eval/reports/`.
20. Abre el reporte y verifica que incluya fecha, modelo/revisión/dimensión, `topK`, candidatos, RRF `k`, hashes del fixture y del gold set, y los rangos de cada chunk relevante. No confíes en el resumen sin mirar los casos.
21. Prueba `npm run eval:retrieval -- --top-k 1`: Recall@1 y MRR deben cambiar respecto de `k = 5`; si un relevante estaba en la posición 2, deja de aparecer en Recall@1.
22. Compara las listas de `vector` y `hybrid` para un caso con código exacto, por ejemplo `q-09` (`ESC-104`) o `q-19` (`FLT-450-A`). La búsqueda léxica debería priorizar la coincidencia literal; la vectorial puede fallar en códigos poco frecuentes.
23. Si configuras `RERANK_MODEL` (y una clave), ejecuta una vez sin `--no-rerank` y otra con `--no-rerank`; compara el orden de los candidatos y el MRR. Usa solo el fixture ficticio: el reranker envía la pregunta y los chunk candidatos a OpenRouter.
24. Revisa al menos una respuesta con `eval/answer-quality-review.md`: comprueba que cada cita `[S#]` apunte a una fuente recuperada y que el excerpt sostenga la afirmación. No cambies el prompt durante la revisión.
25. Si editas el fixture o el gold set, vuelve a ejecutar `npm run eval:seed` antes de `npm run eval:retrieval`; los embeddings guardados no se recalculan solos.

Consultas útiles:

```bash
docker exec -it ida-postgres psql -U ida -d ida
```

```sql
-- Estado general
SELECT count(*) FROM "Document";
SELECT count(*) FROM "DocumentPage";
SELECT count(*) FROM "DocumentChunk";
SELECT count(*) FROM "ChunkEmbedding";

-- Dimensiones y metadatos
SELECT "chunkId", "modelId", left("modelRevision", 12), dimensions,
       vector_dims(embedding) AS stored_dims
FROM "ChunkEmbedding";

-- Duplicados por chunk/modelo/revisión (debe devolver 0 filas)
SELECT "chunkId", "modelId", "modelRevision", count(*)
FROM "ChunkEmbedding"
GROUP BY 1, 2, 3
HAVING count(*) > 1;

-- La extensión debe estar instalada
\dx vector

-- Fixture de evaluación (2 documentos y 21 chunks)
SELECT d.id, d."originalFilename", count(c.id) AS chunks
FROM "Document" d
JOIN "DocumentPage" p ON p."documentId" = d.id
LEFT JOIN "DocumentChunk" c ON c."documentPageId" = p.id
WHERE d.id LIKE 'eval-%'
GROUP BY d.id, d."originalFilename"
ORDER BY d.id;

-- Índice GIN de búsqueda léxica
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'DocumentChunk'
ORDER BY indexname;
```

## Verificación de esta entrega

Comprobado en este entorno (PostgreSQL 17 con pgvector 0.8.7, Node 22.13.1):

- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run test:chunking` ✅ (12 tests)
- `npm run test:unit` ✅ (169 tests en 19 archivos; incluye métricas, dataset, RRF, léxico, vector, reranking mockeado, los probes del verificador y toda la suite anterior)
- `npm test` ✅ (12 + 169)
- `npx prisma migrate status` ✅ (4 migraciones aplicadas, esquema al día). La migración `20261112220247_add_document_chunk_fts_index` creó `DocumentChunk_content_simple_fts_idx` con GIN sobre `to_tsvector('simple', "content")`; se verificó con `pg_indexes`. Con `enable_seqscan = off`, `EXPLAIN` mostró `Bitmap Index Scan on DocumentChunk_content_simple_fts_idx`; con el corpus pequeño el planner puede preferir un scan secuencial.
- `npm run eval:seed` ✅: 2 documentos ficticios, 21 chunks y 21 embeddings con `Xenova/multilingual-e5-small@761b726...` (384 dimensiones). Es idempotente.
- `npm run eval:retrieval` ✅ (ejecución real, sin llamadas a un LLM): 25 casos, 20 respondibles y 5 no respondibles. Resultados agregados:
  - `vector`: Recall@5 1.0000, Precision@5 0.2100, MRR 0.9667.
  - `lexical`: Recall@5 0.9500, Precision@5 0.2000, MRR 0.6350.
  - `hybrid`: Recall@5 1.0000, Precision@5 0.2100, MRR 0.9000.
  - `hybrid-rerank`: `skipped`, motivo `missing_model`.
  El reporte real quedó en `eval/reports/reference-report.json`.
- Correción detectada por la ejecución real ✅: la primera versión léxica pasaba la pregunta completa a `websearch_to_tsquery`, que une todos los términos con AND y devolvía cero resultados. Se cambió a un tsquery OR de términos citados y parametrizados; la suite léxica se actualizó y la evaluación pasó de 0 % a 95 % de Recall@5 léxico. Esto queda como evidencia de por qué hay que ejecutar el comando antes de afirmar resultados.
- Sensibilidad al corte ✅: `npm run eval:retrieval -- --top-k 1` produjo `vector` Recall@1 0.9250 / MRR 0.9500, `lexical` 0.4250 / 0.4500 y `hybrid` 0.8250 / 0.8500. Las métricas cambian como se espera al reducir `k`. El reporte temporal se eliminó después de la comprobación.
- Reranking desactivado ✅: `npm run eval:retrieval -- --no-rerank` terminó con éxito y reportó `hybrid-rerank` como `skipped` con motivo `disabled_by_flag`.
- Reranking mockeado ✅: éxito con body `documents`/`top_n`, timeout, 429, 500, JSON malformado, respuesta vacía, error embebido en 200, índice fuera de rango, índice duplicado e índice no entero. No se envió ninguna consulta a la red y no se registró texto de candidatos ni la clave.
- Calidad de respuesta ❌ no ejecutada: la plantilla `eval/answer-quality-review.md` está lista, pero no se hizo una revisión manual de respuestas del Sprint 4 en este sprint.
- Reranking real ❌ no ejecutado: no hay `RERANK_MODEL` configurado y no se asume un modelo gratuito. La integración se validó con `fetch` mockeado.
- Generación real de OpenRouter ❌ no ejecutada en este sprint: no se repitió una llamada de chat real; la suite existente y los mocks siguen pasando.
- Guía de estudio ✅: `docs/sprint-5-como-funciona.pdf` (17 páginas, A4) y su fuente HTML. Se validó con `pdfinfo` y `pdftotext`: sin páginas vacías, sin claves, sin rutas absolutas locales y sin referencias al Sprint 4.
- `next build` no se ejecutó (regla del proyecto). La validación fue con `tsc`, ESLint, tests y los comandos de evaluación.
- No se hizo push, PR ni merge; los cambios quedan como commits de trabajo en la rama `feat/sprint-5-retrieval-evaluation`.

## Próximo sprint

Sprint 6: conectar la mejor estrategia medida a `/ask` y comparar el flujo completo, no solo el retrieval. Antes de cambiar el prompt de respuesta, hay que ampliar el gold set, hacer la revisión manual de respuestas y citas, y decidir con datos si conviene un umbral de similitud, un reranker pago o un índice ANN. También quedan pendientes:

- Evaluar configuraciones de texto en español e italiano en lugar de `simple`.
- Probar más modelos de embeddings y de generación, midiendo costo y latencia.
- Convertir `npm run eval:retrieval` en una comprobación de regresión repetible.
- Evaluar un juez LLM contra la revisión manual, sin reemplazarla.
- Medir el corpus con más documentos y con datos anonimizados.

## Orden sugerido para revisar el código

1. `eval/gold-set.json` y `eval/fixtures/fictional-documents.json` — qué se considera relevante y por qué.
2. `src/lib/evaluation/dataset.ts` — validación Zod y consistencia entre fixture y gold set.
3. `src/lib/evaluation/metrics.ts` — Recall@k, Precision@k con denominador `k`, MRR y promedios.
4. `src/lib/retrieval/lexical.ts` — tsvector/tsquery, OR de términos y SQL parametrizado.
5. `src/lib/retrieval/rrf.ts` — fusión por posiciones, duplicados y desempate.
6. `src/lib/retrieval/hybrid.ts` — ventana de candidatos y composición de vector + léxico.
7. `src/lib/retrieval/reranker.ts` y `openrouter-reranker.ts` — contrato, validación de índices y cliente opcional.
8. `src/lib/evaluation/run.ts` — orquestación, latencias, errores y agregados.
9. `scripts/eval-retrieval.ts` y `scripts/eval-seed.ts` — CLI, reporte y fixture.
10. `prisma/migrations/20261112220247_add_document_chunk_fts_index/migration.sql` — índice GIN y su costo.
11. `src/lib/embeddings/vector.ts` — validación, formato pgvector y similitud.
12. `src/lib/embeddings/provider-core.ts` — prefijos E5, pooling mean, normalización y contrato del proveedor.
13. `src/lib/embeddings/store.ts` — SQL parametrizado, upsert, búsqueda global y búsqueda filtrada por documento.
14. `src/lib/rag/config.ts` — límites, timeout y lectura server-only de las credenciales.
15. `src/lib/rag/input.ts` — validación Zod.
16. `src/lib/rag/retrieval.ts` — documento, embeddings y recuperación.
17. `src/lib/rag/prompt.ts` — etiquetas `[S#]`, presupuesto de contexto y system prompt.
18. `src/lib/rag/openrouter.ts` — cliente HTTP, timeout y errores del proveedor.
19. `src/lib/rag/citations.ts` — limpieza de citas inventadas.
20. `src/lib/rag/generate.ts` — unión de contexto, respuesta y metadata.
21. `src/lib/rag/ask.ts` — orquestación y logging seguro.
22. `src/app/api/ask/route.ts` — contrato HTTP.
23. `src/components/ask/AskPanel.tsx` y `src/app/ask/page.tsx` — UI y estados.
