# Intelligent Document Assistant — Sprint 3

Aplicación web educativa para subir PDFs, extraer su texto página por página, dividirlo en fragmentos trazables, generar **embeddings locales** y buscar los fragmentos más cercanos a una pregunta con **pgvector**.

Este es el tercer hito del proyecto de RAG. Ya existen documentos, páginas y chunks; ahora cada chunk puede tener un vector de 384 dimensiones, guardado junto con el modelo y la revisión que lo generaron. La búsqueda devuelve los fragmentos recuperados, su documento, su página y la distancia coseno. **Todavía no hay una respuesta generativa**: eso corresponde al Sprint 4.

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
- Pantalla `/search` con pregunta, topK configurable (5 por defecto), documento, página, distancia y similitud.
- Pruebas unitarias con Vitest para las funciones puras y los prefijos del proveedor.
- Documentación de decisiones, límites y comprobaciones manuales.

## Qué no incluye (a propósito)

- Respuestas generativas, chat o llamadas a un LLM.
- Reranking o búsqueda híbrida.
- Índices HNSW o IVFFlat.
- OCR para PDFs escaneados.
- Autenticación, permisos por documento, rate limiting o aislamiento entre usuarios.
- Almacenamiento del archivo PDF original.
- Un proveedor de embeddings remoto o una clave de OpenRouter.

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
| Modelo | `Xenova/multilingual-e5-small` (384 dimensiones) |
| Tests | `node:test` para el chunker + Vitest para embeddings |

## Requisitos

- **Node.js 22.13 o superior** (probado con 22.13.1). `pdfjs-dist` 6 y Transformers.js lo requieren.
- **npm 10 o superior**.
- **Docker** con Docker Compose.
- Puerto **3000** libre para Next.js.
- Puerto **5434** libre para PostgreSQL en el host.
- Espacio en disco y conexión a Internet la primera vez que se usa el modelo. El archivo ONNX fp32 pesa unos **470 MB** y se guarda en `.cache/transformers/`; después los archivos se reutilizan desde la caché, aunque Transformers.js puede seguir consultando metadatos remotos para resolver el modelo.

## Puesta en marcha

```bash
# 1. Variables de entorno locales
cp .env.example .env

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
| `SEARCH_DEFAULT_TOP_K` | No | `5` | Cantidad de resultados por defecto. |
| `SEARCH_MAX_TOP_K` | No | `20` | Máximo permitido para `topK`. |
| `SEARCH_QUERY_MAX_CHARS` | No | `1000` | Longitud máxima de la pregunta. |

Los valores inválidos generan una advertencia en la terminal y se usan los valores por defecto. La dimensión **no** es configurable: la columna SQL es `vector(384)` y el proveedor valida que el modelo produzca exactamente 384 números. Cambiar de modelo exige una migración y regenerar los vectores.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo con Turbopack. |
| `npm run build` | Compilación de producción. |
| `npm run start` | Servidor de producción (requiere `build`). |
| `npm run lint` | ESLint con la configuración de Next.js. |
| `npm run typecheck` | `tsc --noEmit` con TypeScript estricto. |
| `npm test` | Ejecuta los tests del chunker y los tests unitarios de embeddings. |
| `npm run test:chunking` | Tests del chunker con el runner nativo de Node. |
| `npm run test:unit` | Tests de embeddings con Vitest. |
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
│   │   │   └── search/route.ts    # POST de búsqueda vectorial
│   │   ├── documents/[id]/page.tsx
│   │   ├── search/page.tsx        # Pantalla de diagnóstico
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
│   │   └── search/
│   │       └── SearchPanel.tsx    # Formulario y resultados de la búsqueda
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
│       └── embeddings-sql-params.test.ts
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

### Sin logs de contenido

La terminal registra el modelo, la revisión, la cantidad de lotes y los errores técnicos. No registra el texto de los documentos ni la pregunta completa. Los errores que se devuelven al cliente son mensajes seguros, sin trazas internas.

### Prisma y `Unsupported`

Prisma modela las entidades y relaciones normales, pero no puede leer ni escribir `vector(384)` desde el cliente tipado. El esquema declara la columna como `Unsupported` para que las migraciones la creen y para que Prisma Studio no intente deserializarla. Las consultas vectoriales viven en `src/lib/embeddings/store.ts`. Prisma Studio no puede abrir la tabla `ChunkEmbedding` sin errores de deserialización; para inspeccionarla se usa `psql`.

### Descarga y caché del modelo

La primera llamada descarga el modelo y sus archivos de tokenización en `.cache/transformers/`. El proceso reutiliza una sola instancia del pipeline; en desarrollo, el singleton vive en `globalThis` para sobrevivir a recargas de módulos. Si la carga falla, la promesa se limpia para permitir un reintento.

## Seguridad y límites conocidos

- **Sin autenticación ni aislamiento:** cualquier persona con acceso a la URL puede subir, leer y buscar en todos los documentos. La búsqueda es global sobre la biblioteca local; no hay usuarios ni permisos por documento. No exponer públicamente.
- **Sin OCR:** un PDF escaneado como imagen se rechaza con “No se encontró texto seleccionable en el PDF.”.
- **Límites en memoria:** 10 MB y 50 páginas por defecto. La extracción es síncrona y ocurre en el proceso de Next.js.
- **Inferencia en CPU:** la generación de embeddings puede tardar varios segundos o minutos según la cantidad de chunks y el hardware. La primera ejecución incluye la descarga del modelo.
- **Dependencia de red la primera vez:** sin conexión a Hugging Face, el modelo no se puede descargar. Después los archivos se reutilizan desde la caché local, pero Transformers.js puede seguir resolviendo metadatos remotos; no se verificó un arranque completamente offline.
- **Límite de tokens del modelo:** E5 tiene una ventana de 512 tokens. El chunker mide caracteres, no tokens; un chunk de 1.200 caracteres puede truncarse en algunos idiomas. La pregunta también se trunca si supera la ventana, aunque la API limite los caracteres.
- **Dimensión fija:** `vector(384)` está atado a E5-small. Cambiar a un modelo de otra dimensión exige migración, cambio de constante y regeneración.
- **Precisión fija:** el sprint usa `fp32`. Cambiar de precisión puede cambiar los vectores; hay que regenerarlos y documentarlo.
- **Vectores de modelos anteriores:** no se borran automáticamente. Quedan en la tabla para comparar y se pueden eliminar con SQL. No se mezclan en la búsqueda porque el filtro usa el modelo y la revisión actuales.
- **Sin índice ANN:** la búsqueda exacta es O(n) sobre las filas compatibles. Con un corpus grande habrá que medir y evaluar HNSW/IVFFlat.
- **Sin umbral de distancia:** la búsqueda siempre devuelve hasta `topK` resultados, incluso si son poco relevantes. El umbral se decidirá con evaluación.
- **Sin reranking ni búsqueda híbrida:** la recuperación es solo vectorial.
- **Sin respuesta generativa:** el Sprint 4 pasará los fragmentos a un modelo de lenguaje.
- **Sin progreso en tiempo real:** la UI muestra “Generando…” mientras espera; no hay porcentaje por lote.
- **Sin rate limiting:** no hay protección contra abuso.
- **Regeneración concurrente:** dos pedidos simultáneos sobre el mismo documento pueden competir. El `ON CONFLICT` y la transacción protegen la integridad, pero el resultado de cada pedido puede ser distinto. No es un escenario esperado en esta versión local.
- **Regenerar chunks borra embeddings:** la cascada elimina los vectores de los chunks reemplazados. Hay que volver a generarlos.
- **Prisma Studio:** no puede leer la tabla `ChunkEmbedding` por el tipo `vector`.
- **Build de producción:** esta entrega se validó con `tsc`, ESLint, tests y `next dev`. No se ejecutó `npm run build` (regla del proyecto). Si se despliega, revisar el empaquetado de `@huggingface/transformers`, `onnxruntime-node` y `sharp`.

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
8. Prueba una pregunta vacía y una de más de 1.000 caracteres: la API debe responder `400`.
9. Prueba `topK` en `0`, `21` o como texto: debe responder `400`.
10. Cambia `EMBEDDING_MODEL_ID` o `EMBEDDING_MODEL_REVISION` en `.env`, reinicia el servidor y busca: `indexedChunkCount` debe ser `0` hasta que generes los vectores del nuevo modelo/revisión.
11. Si regeneras los chunks de un documento, vuelve a generar sus embeddings.

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
- `npm run test:unit` ✅ (37 tests en 4 archivos: dimensión, NaN, Infinity, formato pgvector, prefijos, validación de pregunta/topK, orquestación idempotente, resultado parcial y parámetros SQL)
- `npx prisma migrate status` ✅ (3 migraciones aplicadas; `vector` 0.8.7 instalada)
- Esquema ✅: `ChunkEmbedding` con `embedding vector(384)`, unique `(chunkId, modelId, modelRevision)`, índice por modelo y FK con `ON DELETE CASCADE`.
- Inferencia real ✅: modelo descargado y cargado en 101,6 s; vectores de 384 dimensiones, todos finitos y con norma 1.000000. En una prueba directa del modelo con dos pasajes de ejemplo fuera de la base, la pregunta de cancelación quedó más cerca del pasaje de cancelación (0,884) que del pasaje de pago (0,793).
- Generación ✅: 2 chunks → 2 embeddings; segunda ejecución → 0 generados, 2 omitidos; regeneración explícita → 2 generados y 2 filas totales.
- SQL ✅: `vector_dims(embedding) = 384` en todas las filas; 0 duplicados por chunk/modelo/revisión; autosimilitud 1.000000.
- Búsqueda ✅: la pregunta “¿Cuál es el período de garantía del producto?” devolvió primero la página 1 (distancia 0,1366) y la pregunta “¿Qué hace el asistente con el texto del documento?” devolvió primero la página 2 (distancia 0,1368). Orden ascendente y documento/página correctos.
- Validación ✅: pregunta vacía y de 1.001 caracteres → `400`; `topK` 0, 21, `null` y string → `400`; cuerpo inválido → `400`; id inválido → `400`; documento inexistente → `404`; documento sin chunks → `409`; modelo inválido → `503`.
- Fallo parcial ✅: un trigger temporal hizo fallar el segundo lote con `EMBEDDING_BATCH_SIZE=1`; la API devolvió `status: "partial"`, 1 generado y 1 fallido. Al quitar el trigger, la regeneración devolvió `complete` con 2 generados.
- Aislamiento de modelo ✅: con `EMBEDDING_MODEL_ID=test/other-model` y `EMBEDDING_MODEL_REVISION=test-revision`, la búsqueda devolvió `indexedChunkCount: 0` sin cargar el modelo ni mezclar vectores.
- Cascada ✅: borrar un chunk dentro de una transacción eliminó su embedding; el `ROLLBACK` restauró las 2 filas.
- UI ✅: `GET /`, `GET /documents/[id]` y `GET /search` responden `200` con el panel de embeddings, el enlace de búsqueda y el formulario. No se automatizó una interacción de navegador; la API y el HTML renderizado son las evidencias de este entorno.
- `next build` no se ejecutó (regla del proyecto). La validación fue con `tsc`, ESLint, tests, migraciones y `next dev`.

## Próximo sprint

Sprint 4: pasar los fragmentos recuperados a un modelo generativo y construir una respuesta con citas verificables. Antes de eso conviene definir un umbral de recuperación, medir la calidad con preguntas de evaluación y decidir si el corpus necesita un índice ANN.

## Orden sugerido para revisar el código

1. `src/lib/embeddings/vector.ts` — validación, formato pgvector y similitud.
2. `src/lib/embeddings/provider-core.ts` — prefijos E5, pooling mean, normalización y contrato del proveedor.
3. `src/lib/embeddings/provider.ts` — carga lazy, revisión fijada y singleton.
4. `src/lib/embeddings/config.ts` — modelo, lotes y límites.
5. `prisma/schema.prisma` y `prisma/migrations/20261112153534_add_chunk_embeddings/migration.sql` — tabla y extensión.
6. `src/lib/embeddings/store.ts` — SQL parametrizado, upsert y búsqueda `<=>`.
7. `src/lib/embeddings/generate.ts` — lotes, idempotencia y resultado parcial.
8. `src/lib/embeddings/search.ts` — validación, embedding de la pregunta y respuesta.
9. `src/app/api/documents/[id]/embeddings/route.ts` y `src/app/api/search/route.ts` — contratos HTTP.
10. `src/components/documents/DocumentEmbeddingsPanel.tsx` y `src/components/search/SearchPanel.tsx` — estados de la UI.
