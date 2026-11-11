# Intelligent Document Assistant — Sprint 2

Aplicación web educativa para subir PDFs, extraer su texto página por página, dividirlo en fragmentos trazables y revisar el resultado en una biblioteca de documentos.

Este es el segundo hito del proyecto de RAG: ya existe texto por página y ahora se generan **chunks** con tamaño y solapamiento configurables. Todavía **no** hay embeddings, búsqueda vectorial ni respuestas generativas. El objetivo es verificar que la materia prima —texto, página y rango de caracteres— queda bien preparada antes de vectorizarla.

> **Solo para desarrollo local.** Esta versión no incluye autenticación ni aislamiento entre usuarios. No la expongas a Internet ni la uses con documentos reales.

## Qué incluye

- Formulario de carga de PDF con límites visibles y estados de carga, vacío, éxito y error.
- Validación en el servidor: archivo presente, tamaño, tipo declarado, cabecera PDF y cantidad de páginas.
- Extracción de texto por página con PDF.js, conservando el número de página.
- Persistencia en PostgreSQL con Prisma: `Document`, `DocumentPage` y `DocumentChunk`.
- Chunking por página con corte por párrafos, oraciones y palabras, overlap configurable y offsets de caracteres.
- Generación/regeneración idempotente de fragmentos dentro de una transacción.
- Biblioteca con nombre, tamaño, páginas, fecha y estado.
- Vista de detalle con el texto extraído, los fragmentos ordenados por página, su rango de caracteres y los parámetros usados.
- PostgreSQL local con una imagen compatible con pgvector, aunque este sprint todavía no almacene vectores.
- README con configuración, comandos, decisiones y límites.

## Documentación del sprint

- `docs/sprint-1-como-funciona.pdf` — recorrido del Sprint 1 explicado con la analogía del archivo de una biblioteca.
- `docs/sprint-1-como-funciona.html` — fuente editable del PDF; se convierte con Chrome headless.

## Qué no incluye (a propósito)

- OCR para PDFs escaneados.
- Embeddings, consultas a pgvector, búsqueda semántica o híbrida, reranking y chat.
- Claves de OpenRouter o cualquier variable de IA.
- Autenticación, permisos por documento, rate limiting o aislamiento entre usuarios.
- Almacenamiento del archivo binario original.

## Stack

| Parte | Tecnología |
| --- | --- |
| Framework | Next.js 16 (App Router) + React 19 |
| Lenguaje | TypeScript en modo `strict` |
| Estilos | CSS Modules, sin Tailwind |
| Base de datos | PostgreSQL 17 con imagen pgvector, vía Docker |
| ORM | Prisma 7 + `@prisma/adapter-pg` |
| Extracción | PDF.js (`pdfjs-dist` 6) |
| Chunking | Módulo TypeScript puro, sin dependencias de IA |
| Tests del chunker | `node:test` + `--experimental-strip-types` (sin dependencias nuevas) |
| Runtime de carga | Node.js (`export const runtime = "nodejs"`) |

## Requisitos

- **Node.js 22.13 o superior** (probado con 22.13.1). `pdfjs-dist` 6 lo requiere.
- **npm 10 o superior**.
- **Docker** con Docker Compose.
- Puerto **3000** libre para Next.js.
- Puerto **5434** libre para PostgreSQL en el host. Se eligió ese puerto para no chocar con instalaciones locales que ya usan 5432 o 5433; puedes cambiarlo en `.env` y `docker-compose.yml`.

## Puesta en marcha

```bash
# 1. Variables de entorno locales
cp .env.example .env

# 2. Dependencias
npm install

# 3. PostgreSQL
docker compose up -d

# 4. Cliente de Prisma (Prisma 7 ya no lo genera solo con migrate)
npm run db:generate

# 5. Migración inicial
npm run db:migrate

# 6. Servidor de desarrollo
npm run dev
```

Abre <http://localhost:3000> y sube un PDF con texto seleccionable.

El orden importa: `.env` debe existir antes de `db:generate`, y la base debe estar saludable antes de `db:migrate`.

### Detener y reiniciar

```bash
# Detener PostgreSQL sin borrar datos
docker compose down

# Borrar también el volumen de la base y empezar de cero
docker compose down -v
docker compose up -d
npm run db:migrate
```

## Variables de entorno

| Variable | Obligatoria | Valor por defecto | Descripción |
| --- | --- | --- | --- |
| `DATABASE_URL` | Sí | — | Cadena de conexión de PostgreSQL. |
| `MAX_PDF_SIZE_MB` | No | `10` | Tamaño máximo del PDF en MB. |
| `MAX_PDF_PAGES` | No | `50` | Cantidad máxima de páginas. |
| `CHUNK_TARGET_CHARS` | No | `1200` | Tamaño objetivo de cada fragmento, en caracteres. |
| `CHUNK_OVERLAP_CHARS` | No | `150` | Caracteres que se repiten desde el fragmento anterior. |
| `CHUNK_MIN_CHARS` | No | `100` | Tamaño mínimo del último fragmento antes de fusionarlo con el anterior. |

Los límites se leen en cada request. Un valor inválido (no entero, menor que el mínimo permitido o un overlap mayor o igual al objetivo) genera una advertencia en la terminal y se usan los valores por defecto. Los tres parámetros de chunking se validan en conjunto.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo con Turbopack. |
| `npm run build` | Compilación de producción. |
| `npm run start` | Servidor de producción (requiere `build`). |
| `npm run lint` | ESLint con la configuración de Next.js. |
| `npm run typecheck` | `tsc --noEmit` con TypeScript estricto. |
| `npm run test:chunking` | Tests del chunker puro con el runner nativo de Node. |
| `npm run db:generate` | Genera el cliente de Prisma en `src/generated/prisma`. |
| `npm run db:migrate` | Aplica migraciones en desarrollo. |
| `npm run db:deploy` | Aplica migraciones en un entorno desplegado. |
| `npm run db:studio` | Abre Prisma Studio. |
| `npm run sample:pdf` | Regenera el PDF de prueba en `samples/`. |

## Estructura del proyecto

```text
.
├── prisma/
│   ├── schema.prisma              # Document, DocumentPage, DocumentChunk
│   └── migrations/                # Migraciones SQL (inicial + chunks)
├── src/
│   ├── app/
│   │   ├── api/documents/
│   │   │   ├── route.ts           # GET (lista) y POST (carga)
│   │   │   └── [id]/
│   │   │       ├── route.ts       # GET de un documento con páginas y chunks
│   │   │       └── chunks/route.ts # POST de generación de fragmentos
│   │   ├── documents/[id]/page.tsx # Vista de detalle (Server Component)
│   │   ├── error.tsx              # Error boundary de la app
│   │   ├── not-found.tsx          # Página 404 en español
│   │   ├── layout.tsx             # Shell, cabecera y pie
│   │   ├── page.tsx               # Biblioteca (lee datos en el servidor)
│   │   └── globals.css            # Reset y tokens de diseño
│   ├── components/documents/
│   │   ├── DocumentLibrary.tsx    # Isla cliente: carga y refresco
│   │   ├── UploadForm.tsx         # Selección y validación de UX
│   │   ├── DocumentDetail.tsx     # Render de metadatos, texto y layout
│   │   ├── DocumentChunkViewer.tsx# Isla cliente: genera y lista chunks
│   │   └── StatusBadge.tsx        # Procesado / Error / Pendiente
│   ├── generated/prisma/          # Cliente generado (ignorado por git)
│   └── lib/
│       ├── chunking/
│       │   ├── chunk-text.ts      # Algoritmo puro y testeable
│       │   └── config.ts          # Parámetros desde el entorno
│       ├── config.ts              # Límites de upload y DATABASE_URL
│       ├── db.ts                  # PrismaClient + adapter pg
│       ├── documents/
│       │   ├── chunks.ts          # Regeneración transaccional
│       │   ├── create-document.ts # Transacción de creación
│       │   ├── dto.ts             # Fechas ISO para la API
│       │   ├── queries.ts         # Listado y detalle con chunks
│       │   └── types.ts           # Tipos compartidos con el cliente
│       ├── errors.ts              # AppError + códigos HTTP
│       ├── format.ts              # Bytes y fechas
│       ├── http.ts                # Traducción de errores a JSON seguro
│       └── pdf/
│           ├── validation.ts      # Validación real del archivo
│           ├── extract-text.ts    # Recorrido de páginas con PDF.js
│           └── pdfjs-config.ts    # Ruta de las fuentes estándar
├── tests/
│   └── chunking.test.mjs          # Tests del algoritmo puro
├── samples/
│   └── documento-de-prueba.pdf    # PDF de 2 páginas para probar la carga
├── scripts/
│   └── generate-sample-pdf.mjs    # Regenera el PDF de prueba
├── docker-compose.yml
├── prisma.config.ts               # Configuración de Prisma 7
├── next.config.ts
└── package.json
```

## Flujo completo de una carga

1. **Selección del archivo.** `UploadForm` acepta un PDF por clic o arrastre. Hace una comprobación local de tamaño y tipo para dar feedback rápido; no es la validación autoritativa.
2. **Envío.** `DocumentLibrary.handleUpload` construye `FormData`, agrega el campo `file` y hace `POST /api/documents`.
3. **Lectura del formulario.** El Route Handler usa `await request.formData()`. Un formulario inválido se traduce a un error 400 seguro.
4. **Validación en servidor.** `validatePdfUpload` comprueba:
   - que el campo sea un archivo;
   - que no esté vacío;
   - que `File.size` no supere el límite;
   - que el MIME declarado sea `application/pdf`;
   - que los primeros 1024 bytes contengan la firma `%PDF-`;
   - que el tamaño real leído coincida con el límite.
5. **Extracción.** `extractPdfPages` abre el documento con PDF.js, verifica `numPages`, recorre cada página con `getPage` + `getTextContent`, normaliza espacios y saltos de línea, y conserva `pageNumber`. Si ninguna página tiene texto, rechaza el archivo.
6. **Persistencia.** `createDocumentWithPages` abre una transacción de Prisma: crea el `Document` y luego inserta todas las `DocumentPage` con `createMany`. Si algo falla, no queda ningún registro parcial.
7. **Respuesta.** El endpoint devuelve `201` con el resumen del documento. La isla cliente lo agrega a la lista y muestra el aviso de éxito con un enlace al detalle.
8. **Lectura.** `/documents/[id]` es un Server Component que consulta el documento y sus páginas ordenadas por `pageNumber`; la API `GET /api/documents/[id]` expone el mismo contenido en JSON.

## Flujo de generación de fragmentos

1. **Acción.** En el detalle, el botón “Generar fragmentos” (o “Regenerar fragmentos”) llama a `POST /api/documents/[id]/chunks`. Es una isla cliente: no envía parámetros, porque el servidor decide la configuración.
2. **Validación.** El Route Handler comprueba que el id tenga un formato seguro antes de consultar la base. Un id inválido devuelve `400`; uno inexistente, `404`.
3. **Configuración.** `getChunkingConfig()` lee `CHUNK_TARGET_CHARS`, `CHUNK_OVERLAP_CHARS` y `CHUNK_MIN_CHARS`, valida la combinación y usa valores por defecto si algo no cierra.
4. **Transacción.** `regenerateDocumentChunks` lee el documento y sus páginas dentro de una transacción, borra los chunks anteriores de esas páginas y genera los nuevos con `chunkText`. Si una inserción falla, el borrado también se revierte.
5. **Trazabilidad.** Cada `DocumentChunk` guarda `documentPageId`, `chunkIndex`, `startChar` y `endChar`. El contenido es exactamente el rango `[startChar, endChar)` del texto normalizado de esa página.
6. **Respuesta y UI.** El endpoint devuelve todos los chunks generados agrupados por página. La isla reemplaza su estado y muestra el éxito, la cantidad de fragmentos o el error. La vista nunca mezcla fragmentos de páginas distintas.

El algoritmo se puede leer como un proceso de tres tamices:

1. **Párrafos:** se corta en los saltos de párrafo y se van uniendo párrafos completos mientras entren en el objetivo.
2. **Oraciones:** si un párrafo no entra, se parte después de `.`, `?`, `!` o `…`.
3. **Palabras:** si una oración tampoco entra, se corta entre palabras; una palabra gigante se divide a la fuerza para garantizar avance.

Después se agrega el overlap: el fragmento siguiente empieza un poco antes de su contenido nuevo, retrocediendo hasta el comienzo de una palabra para no cortarla. El objetivo se mide sobre el contenido nuevo; por eso un fragmento con overlap puede superar levemente los 1.200 caracteres.

## Modelo de datos

```prisma
enum DocumentStatus {
  PROCESSED
  FAILED
}

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
}

model DocumentChunk {
  id             String       @id @default(cuid())
  documentPageId String
  chunkIndex     Int
  content        String
  startChar      Int
  endChar        Int
  createdAt      DateTime     @default(now())
  documentPage   DocumentPage @relation(fields: [documentPageId], references: [id], onDelete: Cascade)

  @@unique([documentPageId, chunkIndex])
  @@index([documentPageId])
}
```

`DocumentPage` conserva la relación entre el texto y su página. `DocumentChunk` agrega la relación con la página y el orden dentro de ella. Esa cadena es la que permitirá construir citas verificables: documento → página → rango de caracteres.

## API

### `POST /api/documents`

`multipart/form-data` con el campo `file`.

```bash
curl -X POST http://localhost:3000/api/documents \
  -F "file=@./documento.pdf;type=application/pdf"
```

Respuesta `201`:

```json
{
  "document": {
    "id": "cm...",
    "originalFilename": "documento.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 1086,
    "pageCount": 2,
    "status": "PROCESSED",
    "errorMessage": null,
    "createdAt": "2026-11-11T08:40:25.891Z",
    "updatedAt": "2026-11-11T08:40:25.891Z"
  }
}
```

> En `curl`, indica `;type=application/pdf`. El servidor valida el MIME declarado además de la cabecera.

### `GET /api/documents`

Devuelve `{ "documents": [...] }` ordenados por fecha de creación descendente.

### `GET /api/documents/[id]`

Devuelve el documento con `pages` ordenadas por `pageNumber` y, dentro de cada página, sus `chunks` ordenados por `chunkIndex`.

### `POST /api/documents/[id]/chunks`

Genera o regenera los fragmentos de todas las páginas del documento. No recibe cuerpo: los parámetros salen de las variables `CHUNK_*` del servidor. Es idempotente; repetir la llamada reemplaza los fragmentos anteriores dentro de una transacción.

```bash
curl -X POST http://localhost:3000/api/documents/<id>/chunks
```

Respuesta `200`:

```json
{
  "documentId": "cm...",
  "chunkCount": 3,
  "pageCount": 2,
  "chunking": {
    "targetChars": 1200,
    "overlapChars": 150,
    "minChars": 100
  },
  "pages": [
    {
      "pageId": "cm...",
      "pageNumber": 1,
      "chunks": [
        {
          "id": "cm...",
          "documentPageId": "cm...",
          "chunkIndex": 0,
          "content": "Texto del fragmento...",
          "startChar": 0,
          "endChar": 1180
        }
      ]
    }
  ]
}
```

Una página sin texto devuelve `chunks: []` y no genera registros. El endpoint no devuelve trazas internas ni registra el contenido de los documentos en la terminal.

### `GET /documents/[id]`

Vista HTML del documento. Si el id no existe, responde `404` con la página `not-found`.

### Errores

Todas las respuestas de error tienen la misma forma:

```json
{
  "error": {
    "code": "NO_EXTRACTABLE_TEXT",
    "message": "No se encontró texto seleccionable en el PDF."
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
| `INTERNAL_ERROR` | 500 | Error inesperado; el detalle queda en la terminal. |

## Decisiones técnicas

### PDF.js en el servidor y con el build `legacy`

La extracción ocurre en el Route Handler con `runtime = "nodejs"`. Se importa `pdfjs-dist/legacy/build/pdf.mjs` porque PDF.js 6 usa `Promise.try`, que no está disponible en Node 22; el bundle legacy incluye el polyfill necesario. Además, `serverExternalPackages: ["pdfjs-dist"]` evita que el bundler reescriba la resolución del worker.

`pdfjs-config.ts` apunta a `node_modules/pdfjs-dist/standard_fonts` para que PDF.js pueda mapear fuentes no embebidas, como Helvetica, sin emitir advertencias. Si la ruta no existe, la extracción sigue funcionando.

### Texto por página desde el primer paso

Guardar un único bloque de texto habría sido más simple, pero impediría saber de qué página salió cada fragmento. `DocumentPage` mantiene esa correspondencia desde el inicio y prepara el terreno para las citas.

### Chunking por caracteres, no por tokens

En este sprint el objetivo se mide en caracteres porque es fácil de explicar, testear y depurar. Un carácter no es un token: cada modelo tokeniza distinto según el idioma, los acentos y los signos. Cuando se elija el modelo de embeddings, conviene medir con su tokenizador y comparar configuraciones con preguntas de evaluación. Los 1.200 caracteres son un punto de partida, no una regla universal.

### Cortes estructurales antes que cortes fijos

Cortar cada 1.200 caracteres exactos es simple, pero puede partir una oración o una idea al medio. Por eso el chunker intenta primero párrafos, después oraciones y solo al final palabras. Los cortes por palabra son la red de seguridad para garantizar que el algoritmo siempre avance, incluso con una sola palabra más larga que el objetivo.

### Overlap y palabras completas

El overlap copia el final del fragmento anterior al principio del siguiente. Se calcula desde el inicio del chunk menos `CHUNK_OVERLAP_CHARS`, pero se avanza hasta el comienzo de la palabra siguiente para no entregar una palabra cortada. Por eso el overlap real puede ser algo menor que el configurado. El tamaño objetivo se mide sobre el contenido nuevo; un chunk con overlap puede superarlo.

### Chunks de una sola página

Cada invocación del chunker recibe el texto de **una** página y devuelve offsets dentro de ese texto. Esto evita ambigüedad en las citas y hace que la regeneración sea independiente por página. La contracara: si un párrafo continúa en la página siguiente, el corte coincide con el límite de página. Se acepta por ahora.

### Idempotencia y transacción

Regenerar no debe duplicar filas. La operación borra los chunks de las páginas del documento y crea los nuevos dentro de la misma transacción. La restricción `@@unique([documentPageId, chunkIndex])` es una segunda red de seguridad. Un fallo en cualquier inserción revierte el borrado y deja los chunks anteriores intactos. La operación nunca toca `Document` ni `DocumentPage`.

### Validación duplicada

La UI valida para dar feedback inmediato. El servidor vuelve a validar todo porque el navegador no es confiable: el nombre, el MIME y el tamaño declarados pueden no coincidir con el contenido. La comprobación de cabecera busca `%PDF-` en los primeros 1024 bytes, que es más tolerante que exigirlo en el byte 0.

El nombre original se conserva solo como metadato de visualización. Se eliminan controles y separadores de ruta, y nunca se usa para construir una ruta del sistema de archivos.

### Transacción y el estado `FAILED`

La extracción ocurre **antes** de cualquier escritura. Si el PDF no se puede leer o no tiene texto, no se crea ningún `Document`; el cliente recibe el error y la base queda limpia. Por eso el pipeline síncrono actual solo persiste documentos con estado `PROCESSED`.

El valor `FAILED` queda definido en el enum y soportado por la UI para un pipeline asíncrono futuro, donde el documento se registra primero y se marca como fallido después. El estado “pendiente” que se ve durante la carga es un estado **del cliente**, no una fila de la base.

### Sin almacenamiento del binario

El archivo se procesa en memoria y se descarta. No se escribe en disco ni se usa el nombre original como ruta. Esto reduce la superficie de seguridad y mantiene el foco del sprint en el pipeline de texto.

### Prisma 7

Prisma 7 requiere ESM (`"type": "module"`), el generador `prisma-client` con `output` explícito, un driver adapter (`@prisma/adapter-pg` + `pg`) y `prisma.config.ts`. `prisma migrate dev` ya no ejecuta `prisma generate`, por eso el setup incluye `npm run db:generate` antes de la migración.

### Server Components + una isla cliente

La biblioteca se lee en el servidor (`page.tsx` → `listDocuments`) y se pasa como props iniciales a `DocumentLibrary`. Esa isla cliente maneja la carga y el refresco a través de la API. El detalle también es un Server Component. Así no se envían credenciales ni acceso a la base al navegador, y el build no necesita una conexión a PostgreSQL.

### Puerto 5434

El `docker-compose.yml` publica PostgreSQL en el puerto **5434** del host para evitar conflictos con otras instalaciones locales. Si lo cambias, actualiza también `DATABASE_URL` en `.env`.

## Seguridad y límites conocidos

- **Sin autenticación ni aislamiento:** cualquier persona con acceso a la URL puede subir y leer documentos. No exponer públicamente.
- **Sin OCR:** un PDF escaneado como imagen se rechaza con “No se encontró texto seleccionable en el PDF.”.
- **Límites en memoria:** 10 MB y 50 páginas por defecto. La extracción es síncrona y ocurre en el proceso de Next.js; varias cargas simultáneas consumen memoria.
- **Calidad de extracción:** depende del PDF. Algunos diseños complejos pueden perder orden de lectura o separar palabras de forma distinta a la esperada.
- **Párrafos en PDFs:** PDF.js emite un salto por línea, pero no conserva las líneas en blanco. Por eso el texto extraído suele no contener `\n\n` y el chunker ve un solo párrafo por página, cortando por oraciones. El algoritmo sí respeta párrafos cuando el texto normalizado los conserva (está cubierto por los tests). Mejorar la detección de párrafos en la extracción queda para otro sprint.
- **Detección de oraciones heurística:** el corte ocurre después de `.`, `?`, `!` o `…` seguidos de espacio. Abreviaturas como “Dr.” o “EE. UU.” pueden tratarse como fin de oración. Afecta el punto de corte, no la trazabilidad.
- **Sin deduplicación:** subir el mismo PDF dos veces crea dos documentos.
- **Sin progreso en tiempo real:** la UI muestra “Procesando…” mientras espera la respuesta, pero no hay porcentaje por página.
- **Sin rate limiting:** no hay protección contra abuso. Se trabajará antes de un despliegue público.
- **Límite de plataforma:** si algún día se despliega en Vercel, el límite de cuerpo de una función puede ser menor que 10 MB. Para este sprint, el entorno es local.
- **Sin almacenamiento de originales:** no se puede volver a descargar el PDF desde la aplicación.
- **Tamaño en caracteres, no en tokens:** el objetivo de 1.200 caracteres es una aproximación. Todavía no se mide con el tokenizador del modelo de embeddings.
- **Parámetros no persistidos por documento:** el detalle muestra la configuración vigente del servidor. Si cambias las variables después de generar, los chunks existentes conservan sus rangos anteriores hasta que regeneres.
- **Regeneración concurrente:** dos pedidos simultáneos sobre el mismo documento no están serializados con un lock explícito. La transacción y el unique protegen la integridad, pero uno de los pedidos podría fallar con `500`. No es un escenario esperado en esta versión local.
- **Cortes en el límite de página:** un párrafo que continúa en la página siguiente se corta en ese límite; el overlap no cruza páginas.
- **Chunks ya generados:** los documentos subidos antes del Sprint 2 no tienen fragmentos hasta que se ejecuta la acción.

## Cómo probar manualmente

1. Usa el PDF incluido en `samples/documento-de-prueba.pdf` (2 páginas, texto seleccionable y acentos) o genera uno propio.
   Para regenerarlo:
   ```bash
   npm run sample:pdf
   ```
2. Súbelo desde la interfaz.
3. Verifica que aparece en la lista con el estado **Procesado**.
4. Abre el documento y revisa que cada página conserve su texto.
5. Pulsa **Generar fragmentos**. Deben aparecer los fragmentos en orden, con su página de origen, su rango de caracteres y los parámetros usados.
6. Pulsa **Regenerar fragmentos** dos veces. La cantidad de fragmentos no debe crecer ni duplicarse.
7. Prueba un PDF escaneado: debe mostrarse el mensaje de “No se encontró texto seleccionable en el PDF.” y no debe aparecer ningún registro nuevo.

Consultas directas a la base:

```bash
docker exec -it ida-postgres psql -U ida -d ida

SELECT id, "originalFilename", "pageCount", status FROM "Document";
SELECT "pageNumber", left(text, 80) FROM "DocumentPage" ORDER BY "pageNumber";
SELECT "documentPageId", "chunkIndex", "startChar", "endChar", length(content)
FROM "DocumentChunk"
ORDER BY "documentPageId", "chunkIndex";
```

Para comprobar la idempotencia y la trazabilidad:

```sql
-- No debe haber índices repetidos dentro de una página.
SELECT "documentPageId", "chunkIndex", count(*)
FROM "DocumentChunk"
GROUP BY 1, 2
HAVING count(*) > 1;

-- Cada chunk debe pertenecer a una página del documento esperado.
SELECT c.id, p."pageNumber"
FROM "DocumentChunk" c
JOIN "DocumentPage" p ON p.id = c."documentPageId"
JOIN "Document" d ON d.id = p."documentId"
WHERE d.id = '<id>';
```

## Verificación de esta entrega

Comprobado en este entorno:

- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run test:chunking` ✅ (12 tests: normalización, párrafos, oraciones, palabras, palabra gigante, overlap, borde del overlap, mínimo, trazabilidad y validación)
- `npx prisma migrate status` ✅ (2 migraciones aplicadas, esquema al día)
- Smoke test HTTP del Sprint 2 ✅: página corta (1 fragmento), página larga (3 + 3), varios párrafos (2), oración muy larga (3 + 3), documento con página vacía (1 + 0), regeneración repetida 3 veces con el mismo conteo y el mismo hash de contenido, id inválido `400`, id inexistente `404`, `GET` al endpoint de generación `405`, API de detalle con chunks ordenados y HTML con página, rango y parámetros.
- SQL ✅: 0 rangos fuera de límites; `content` coincide con `substring(page.text, startChar, endChar)` en el 100% de las filas; 0 índices duplicados o discontinuos; overlap real de 143–148 caracteres (≤150); 0 chunks sin página.
- Rollback ✅: un trigger temporal que hacía fallar una inserción produjo `500` seguro y dejó intactos los 6 chunks anteriores; al quitarlo, la regeneración volvió a funcionar.
- Cascada ✅: borrar una página eliminó solo sus 3 chunks; borrar los documentos de prueba dejó 0 documentos, 0 páginas y 0 chunks.
- Configuración inválida ✅: con `CHUNK_TARGET_CHARS=100` y `CHUNK_OVERLAP_CHARS=200`, la app registró la advertencia y usó los valores por defecto `1200/150/100`.

No se ejecutó `next build` durante esta entrega. La validación se hizo con `tsc`, ESLint, tests del chunker y pruebas HTTP contra `next dev`.

## Próximo sprint

Embeddings: elegir un modelo, definir la dimensión del vector, vectorizar los chunks y medir la recuperación con preguntas de evaluación. El tamaño de chunk se ajustará con el tokenizador del modelo elegido.

## Orden sugerido para revisar el código

1. `src/lib/chunking/chunk-text.ts` — algoritmo puro, sin Prisma ni UI.
2. `tests/chunking.test.mjs` — casos que fijan el comportamiento esperado.
3. `src/lib/chunking/config.ts` — parámetros y validación desde el entorno.
4. `src/lib/documents/chunks.ts` — transacción e idempotencia.
5. `src/app/api/documents/[id]/chunks/route.ts` — validación del id y traducción de errores.
6. `prisma/schema.prisma` — relación `DocumentPage` → `DocumentChunk` y restricciones.
7. `src/components/documents/DocumentChunkViewer.tsx` — estados de la isla cliente.
8. `src/components/documents/DocumentDetail.tsx` — composición del detalle.
9. `src/lib/pdf/extract-text.ts` — de dónde sale el texto que consume el chunker.
