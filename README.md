# Intelligent Document Assistant — Sprint 4

Aplicación web educativa para subir PDFs, extraer su texto página por página, dividirlo en fragmentos trazables, generar **embeddings locales**, recuperar los fragmentos más cercanos con **pgvector** y responder preguntas con un modelo de **OpenRouter** y **citas verificadas** a las páginas del documento.

Este es el cuarto hito del proyecto de RAG. El recorrido completo es **indexar → recuperar → generar**: los documentos se procesan y se vectorizan localmente; la pregunta se convierte en un vector con el mismo modelo; los chunks del documento elegido se envían como contexto a OpenRouter; y el servidor valida las citas antes de mostrarlas. La respuesta es de un solo turno: todavía no hay historial de conversación, herramientas ni agentes.

> **Solo para desarrollo local.** Esta versión no incluye autenticación ni aislamiento entre usuarios. No la expongas a Internet ni la uses con documentos reales.

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
- Documentación de decisiones, límites y comprobaciones manuales.

## Documentación del sprint

- `docs/sprint-3-como-funciona.pdf` — guía de estudio del Sprint 3 (19 páginas): embeddings, distancia coseno, pgvector, generación idempotente, búsqueda y límites.
- `docs/sprint-3-como-funciona.html` — fuente editable de la guía; el PDF se genera con Chrome headless.

Las guías de los sprints anteriores siguen disponibles en `docs/sprint-1-como-funciona.pdf` y `docs/sprint-2-como-funciona.pdf`. El Sprint 4 se documenta en este README y en `odd/tasks/sprint-4-rag-answers.md`.

## Qué no incluye (a propósito)

- Streaming de la respuesta.
- Historial de conversación, herramientas o agentes.
- Reranking o búsqueda híbrida.
- Umbral universal de similitud.
- Índices HNSW o IVFFlat.
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
| Validación de entrada | Zod |
| Tests | `node:test` para el chunker + Vitest para embeddings y RAG |

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

# 5. Migraciones (incluye CREATE EXTENSION vector)
npm run db:migrate

# 6. Servidor de desarrollo
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

Los valores inválidos generan una advertencia en la terminal y se usan los valores por defecto. La dimensión **no** es configurable: la columna SQL es `vector(384)` y el proveedor valida que el modelo produzca exactamente 384 números. Cambiar de modelo exige una migración y regenerar los vectores.

`OPENROUTER_API_KEY` y `OPENROUTER_MODEL` se leen solo en el servidor. Si faltan, `/api/ask` responde `503` con un mensaje seguro después de recuperar los fragmentos; el camino sin evidencia sigue funcionando sin llamar al proveedor. La clave no aparece en el bundle del navegador, en la API ni en los logs.

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

## Estructura del proyecto

```text
.
├── prisma/
│   ├── schema.prisma              # Document, DocumentPage, DocumentChunk, ChunkEmbedding
│   └── migrations/                # Inicial, chunks y embeddings/pgvector
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
│       │   ├── load-provider.ts   # Traducción de errores del modelo
│       │   ├── provider.ts        # Carga lazy y singleton del modelo
│       │   ├── provider-core.ts   # Prefijos, pooling y validación
│       │   ├── search.ts          # Búsqueda exacta por distancia coseno
│       │   ├── store.ts           # Prisma + SQL parametrizado de vectores
│       │   ├── summary.ts         # Conteo por documento para la UI
│       │   ├── types.ts
│       │   └── vector.ts          # Validación y formato pgvector
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
│       ├── rag-citations.test.ts
│       ├── rag-generate.test.ts
│       ├── rag-input.test.ts
│       ├── rag-openrouter.test.ts
│       ├── rag-prompt.test.ts
│       └── rag-verification.test.ts
├── samples/
│   └── documento-de-prueba.pdf
├── scripts/
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
- **Sin umbral de distancia:** la búsqueda siempre devuelve hasta `topK` resultados, incluso si son poco relevantes. El umbral se decidirá con evaluación en el Sprint 5.
- **Sin reranking ni búsqueda híbrida:** la recuperación es solo vectorial.
- **Sin streaming:** la respuesta se valida completa antes de mostrarse. Esto facilita comprobar citas, pero aumenta la espera percibida.
- **Sin historial ni agentes:** cada pregunta es independiente; no hay memoria de la conversación ni herramientas.
- **El documento sale del servidor:** a diferencia de los embeddings, la generación envía los fragmentos recuperados a OpenRouter. No uses documentos confidenciales en esta versión local sin evaluar ese intercambio.
- **Prompt injection:** el system prompt indica tratar las fuentes como datos y no como instrucciones, pero no es una barrera de seguridad completa. Falta una capa de controles adicionales.
- **Respuestas no garantizadas:** pedir “no alucines” reduce el riesgo, no lo elimina. La app muestra fuentes y citas para que una persona pueda revisar el origen.
- **Sin evaluación de calidad:** no hay conjunto de preguntas, métrica de recuperación ni comparación de modelos. El Sprint 5 debe medir aciertos, abstención y citas.
- **Sin rate limiting:** no hay protección contra abuso de la API ni del proveedor.
- **Sin progreso en tiempo real:** la UI muestra “Generando respuesta…” mientras espera; no hay porcentaje ni streaming.
- **Regeneración concurrente:** dos pedidos simultáneos sobre el mismo documento pueden competir. El `ON CONFLICT` y la transacción protegen la integridad, pero el resultado de cada pedido puede ser distinto. No es un escenario esperado en esta versión local.
- **Regenerar chunks borra embeddings:** la cascada elimina los vectores de los chunks reemplazados. Hay que volver a generarlos.
- **Prisma Studio:** no puede leer la tabla `ChunkEmbedding` por el tipo `vector`.
- **Proveedor no verificado en red real:** en este entorno no hay `OPENROUTER_API_KEY`, así que la integración con OpenRouter se validó con `fetch` mockeado y con pruebas HTTP del camino sin configuración. No se afirma que una llamada real haya funcionado.
- **Build de producción:** esta entrega se validó con `tsc`, ESLint, tests y `next dev`. No se ejecutó `npm run build` (regla del proyecto). Si se despliega, revisar el empaquetado de `@huggingface/transformers`, `onnxruntime-node`, `sharp` y `zod`.

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
```

## Verificación de esta entrega

Comprobado en este entorno (PostgreSQL 17 con pgvector 0.8.7, Node 22.13.1):

- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run test:chunking` ✅ (12 tests)
- `npm run test:unit` ✅ (65 tests en 10 archivos; incluye prompt, citas, entrada Zod, cliente OpenRouter mockeado, camino sin fuentes, presupuesto de contexto y filtro SQL por documento)
- `npm test` ✅ (12 + 65)
- `npx prisma migrate status` ✅ (3 migraciones aplicadas; no se agregaron migraciones en este sprint)
- Tipo y esquema ✅: `ChunkEmbedding` sigue usando `embedding vector(384)`, unique `(chunkId, modelId, modelRevision)`, índice por modelo y FK con `ON DELETE CASCADE`.
- Retrieval real ✅: `POST /api/ask` sobre `documento-de-prueba.pdf` cargó el modelo local y ejecutó la búsqueda; la configuración faltante se detectó después del retrieval, con `retrieval=1833ms` y el modelo listo. Esto prueba que el documento tenía embeddings, que se recuperaron chunks y que se armó el prompt.
- Sin embeddings ✅: un documento temporal sin embeddings (insertado y eliminado con SQL) devolvió `200`, `noEvidence: true`, `noEvidenceReason: "no_embeddings"`, `sources: []`, `model: null`, sin cargar el modelo y sin llamar al proveedor. El log mostró `retrieval=12ms sources=0 provider=skipped`.
- Configuración faltante ✅: con una pregunta sobre un documento indexado y sin `OPENROUTER_API_KEY`/`OPENROUTER_MODEL`, la API devolvió `503` con `OPENROUTER_NOT_CONFIGURED`, sin claves ni stack traces.
- Validación HTTP ✅: JSON inválido `400`; pregunta vacía `400`; pregunta de 1.001 caracteres `400`; id inválido `400`; documento inexistente `404`; campo extra `400`; cuerpo de 20.000 caracteres `400`.
- Cliente OpenRouter ✅ (mockeado): éxito con `usage`, timeout, HTTP 429, JSON malformado, respuesta vacía y objeto `error` embebido en `200`. No se envió `temperature` ni `top_p`. La API key no aparece en los mensajes de error.
- Citas ✅ (unitario): `[S1]`, `[S1][S2]`, `[S1, S2]`, IDs inventados, grupos mixtos y corchetes ajenos. Una respuesta con `[S9]` no crea una fuente S9 ni una página inventada.
- Seguridad ✅: `OPENROUTER_API_KEY` no aparece en `.next/static`; la UI recibe solo un booleano de configuración. Los logs registran duración, estado y usage, no pregunta, prompt ni texto completo.
- UI ✅: `GET /`, `GET /search` y `GET /ask` responden `200`; `/ask` muestra el selector con los documentos y su cantidad de embeddings, el formulario, la advertencia de configuración y los enlaces de navegación. No se automatizó una interacción de navegador.
- Proveedor real ❌ no ejecutado: no hay API key en este entorno. El camino de éxito de OpenRouter se validó con `fetch` mockeado, no con una llamada de red real.
- `next build` no se ejecutó (regla del proyecto). La validación fue con `tsc`, ESLint, tests y `next dev`.

## Próximo sprint

Sprint 5: evaluar la calidad del RAG. Hay que construir un conjunto de preguntas con respuestas y páginas esperadas, medir recuperación (por ejemplo, si la página correcta aparece en el topK), medir abstención cuando no hay evidencia, revisar citas y decidir si hace falta un umbral de similitud, reranking o un índice ANN. También conviene comparar modelos y costos de OpenRouter con datos, no por intuición.

## Orden sugerido para revisar el código

1. `src/lib/embeddings/vector.ts` — validación, formato pgvector y similitud.
2. `src/lib/embeddings/provider-core.ts` — prefijos E5, pooling mean, normalización y contrato del proveedor.
3. `src/lib/embeddings/store.ts` — SQL parametrizado, upsert, búsqueda global y búsqueda filtrada por documento.
4. `src/lib/rag/config.ts` — límites, timeout y lectura server-only de las credenciales.
5. `src/lib/rag/input.ts` — validación Zod.
6. `src/lib/rag/retrieval.ts` — documento, embeddings y recuperación.
7. `src/lib/rag/prompt.ts` — etiquetas `[S#]`, presupuesto de contexto y system prompt.
8. `src/lib/rag/openrouter.ts` — cliente HTTP, timeout y errores del proveedor.
9. `src/lib/rag/citations.ts` — limpieza de citas inventadas.
10. `src/lib/rag/generate.ts` — unión de contexto, respuesta y metadata.
11. `src/lib/rag/ask.ts` — orquestación y logging seguro.
12. `src/app/api/ask/route.ts` — contrato HTTP.
13. `src/components/ask/AskPanel.tsx` y `src/app/ask/page.tsx` — UI y estados.
