# API

Todas las rutas de documentos, búsqueda, embeddings y preguntas requieren una sesión de Auth.js. Sin sesión devuelven `401 UNAUTHENTICATED`.

Un documento ajeno o inexistente devuelve `404 DOCUMENT_NOT_FOUND`; no se revela si existe. Los límites por ventana devuelven `429 RATE_LIMITED` con `Retry-After`; la cuota de documentos devuelve `429 DOCUMENT_QUOTA_EXCEEDED` sin ese header.

Las respuestas de error tienen siempre la misma forma:

```json
{
  "error": {
    "code": "INVALID_SEARCH_QUERY",
    "message": "Escribí una pregunta para buscar."
  }
}
```

## Endpoints

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET`, `POST` | `/api/auth/[...nextauth]` | Handlers de Auth.js: CSRF, callback de credenciales, sesión y logout. |
| `POST` | `/api/documents` | Carga un PDF con `multipart/form-data` y el campo `file`. Responde `201` con el resumen del documento. |
| `GET` | `/api/documents` | Lista los documentos de la cuenta, ordenados por fecha de creación descendente. |
| `GET` | `/api/documents/[id]` | Devuelve el documento con sus páginas y chunks ordenados. |
| `DELETE` | `/api/documents/[id]` | Borra el documento; la cascada elimina páginas, chunks y embeddings. |
| `POST` | `/api/documents/[id]/chunks` | Genera o regenera los fragmentos. Sin cuerpo; usa `CHUNK_*`. Idempotente y transaccional. |
| `POST` | `/api/documents/[id]/embeddings` | Genera embeddings para los chunks. Aplica el rate limit de embeddings. |
| `POST` | `/api/search` | Búsqueda vectorial exacta sobre los chunks de la cuenta. |
| `POST` | `/api/ask` | Recupera contexto autorizado, genera la respuesta y valida las citas. |
| `GET` | `/api/health` | `SELECT 1`; responde `{ "status": "ok" }` o `503 { "status": "unavailable" }`. |

## `GET|POST /api/auth/[...nextauth]`

Handlers de Auth.js. La app no implementa cookies ni tokens propios.

## `POST /api/documents`

`multipart/form-data` con el campo `file`. Responde `201` con el resumen del documento.

## `GET /api/documents`

Devuelve `{ "documents": [...] }` del usuario autenticado, ordenados por fecha de creación descendente. No incluye documentos de otras cuentas.

## `GET /api/documents/[id]`

Devuelve el documento del usuario autenticado con `pages` ordenadas por `pageNumber` y sus `chunks` ordenados por `chunkIndex`.

## `DELETE /api/documents/[id]`

Borra el documento del usuario autenticado. La FK en cascada elimina páginas, chunks y embeddings. Un id ajeno o inexistente devuelve el mismo `404`.

## `POST /api/documents/[id]/chunks`

Genera o regenera los fragmentos del documento del usuario autenticado. No recibe cuerpo; los parámetros salen de `CHUNK_*`. Es idempotente: reemplaza los fragmentos anteriores dentro de una transacción.

## `POST /api/documents/[id]/embeddings`

Genera embeddings para los chunks del documento del usuario autenticado. Aplica el rate limit de embeddings.

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

## `POST /api/search`

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

Los resultados se ordenan por distancia ascendente y pertenecen solo al usuario autenticado. No se devuelve el vector y no se aplica un umbral de distancia. Si el usuario no tiene embeddings para el modelo actual, `indexedChunkCount` es `0` y `results` es `[]`; los chunks de otras cuentas nunca se cuentan ni se devuelven.

## `POST /api/ask`

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

## `GET /api/health`

Ejecuta `SELECT 1` y devuelve `{ "status": "ok" }` o `503 { "status": "unavailable" }`. No incluye versión, host, error de conexión ni configuración.

## Catálogo de errores

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
| `DOCUMENT_NOT_FOUND` | 404 | El id no existe o no pertenece al usuario autenticado. |
| `INVALID_DOCUMENT_ID` | 400 | El id no tiene un formato seguro. |
| `INVALID_REQUEST_BODY` | 400 | El cuerpo JSON es inválido, demasiado grande o tiene un campo con el tipo equivocado. |
| `INVALID_SEARCH_QUERY` | 400 | La pregunta está vacía, no es texto o supera el límite. |
| `INVALID_TOP_K` | 400 | `topK` no es un entero entre 1 y el máximo. |
| `DOCUMENT_WITHOUT_CHUNKS` | 409 | Se intentaron generar embeddings sin fragmentos. |
| `EMBEDDING_MODEL_UNAVAILABLE` | 503 | El modelo no se pudo cargar (descarga, caché o configuración). |
| `EMBEDDING_QUERY_FAILED` | 500 | El modelo no pudo generar el vector de la pregunta. |
| `INVALID_ASK_QUESTION` | 400 | La pregunta está vacía o supera `RAG_QUESTION_MAX_CHARS`. |
| `UNAUTHENTICATED` | 401 | No hay una sesión válida de Auth.js. |
| `RATE_LIMITED` | 429 | Se superó un límite por usuario, email o IP. Incluye `Retry-After`. |
| `DOCUMENT_QUOTA_EXCEEDED` | 429 | La cuenta alcanzó `MAX_DOCUMENTS_PER_USER`. |
| `REGISTRATION_FAILED` | 400 | El registro no se pudo completar (por ejemplo, email ya usado); el mensaje es genérico. |
| `OPENROUTER_NOT_CONFIGURED` | 503 | Faltan `OPENROUTER_API_KEY` u `OPENROUTER_MODEL` en el servidor. |
| `RAG_PROVIDER_TIMEOUT` | 504 | OpenRouter no respondió dentro de `RAG_PROVIDER_TIMEOUT_MS`. |
| `RAG_PROVIDER_RATE_LIMITED` | 429 | OpenRouter devolvió `429`; se muestra un mensaje seguro. |
| `RAG_PROVIDER_QUOTA_EXCEEDED` | 503 | OpenRouter devolvió `402` (sin cuota); no se exponen detalles del proveedor. |
| `RAG_PROVIDER_ERROR` | 502 | OpenRouter devolvió un error, una respuesta malformada o un error embebido. |
| `INTERNAL_ERROR` | 500 | Error inesperado; el detalle queda en la terminal. |
