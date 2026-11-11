# Intelligent Document Assistant — Sprint 1

Aplicación web educativa para subir PDFs, extraer su texto página por página y revisar el resultado en una biblioteca de documentos.

Este es el primer hito del proyecto de RAG: todavía **no** hay chunking, embeddings, búsqueda vectorial ni respuestas generativas. El objetivo es verificar que la materia prima —texto y número de página— queda bien extraída y persistida.

> **Solo para desarrollo local.** Esta versión no incluye autenticación ni aislamiento entre usuarios. No la expongas a Internet ni la uses con documentos reales.

## Qué incluye

- Formulario de carga de PDF con límites visibles y estados de carga, vacío, éxito y error.
- Validación en el servidor: archivo presente, tamaño, tipo declarado, cabecera PDF y cantidad de páginas.
- Extracción de texto por página con PDF.js, conservando el número de página.
- Persistencia en PostgreSQL con Prisma: `Document` y `DocumentPage`.
- Biblioteca con nombre, tamaño, páginas, fecha y estado.
- Vista de detalle con el texto extraído ordenado por página y un índice navegable.
- PostgreSQL local con una imagen compatible con pgvector, aunque este sprint no almacene vectores.
- README con configuración, comandos, decisiones y límites.

## Qué no incluye (a propósito)

- OCR para PDFs escaneados.
- Chunks, embeddings, consultas a pgvector, chat o respuestas generativas.
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

Los límites se leen en cada request. Un valor inválido (no entero o menor que 1) genera una advertencia en la terminal y se usa el valor por defecto.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo con Turbopack. |
| `npm run build` | Compilación de producción. |
| `npm run start` | Servidor de producción (requiere `build`). |
| `npm run lint` | ESLint con la configuración de Next.js. |
| `npm run typecheck` | `tsc --noEmit` con TypeScript estricto. |
| `npm run db:generate` | Genera el cliente de Prisma en `src/generated/prisma`. |
| `npm run db:migrate` | Aplica migraciones en desarrollo. |
| `npm run db:deploy` | Aplica migraciones en un entorno desplegado. |
| `npm run db:studio` | Abre Prisma Studio. |

## Estructura del proyecto

```text
.
├── prisma/
│   ├── schema.prisma              # Document, DocumentPage y el enum de estado
│   └── migrations/                # Migración SQL inicial
├── src/
│   ├── app/
│   │   ├── api/documents/
│   │   │   ├── route.ts           # GET (lista) y POST (carga)
│   │   │   └── [id]/route.ts      # GET de un documento con sus páginas
│   │   ├── documents/[id]/page.tsx# Vista de detalle (Server Component)
│   │   ├── error.tsx              # Error boundary de la app
│   │   ├── not-found.tsx          # Página 404 en español
│   │   ├── layout.tsx             # Shell, cabecera y pie
│   │   ├── page.tsx               # Biblioteca (lee datos en el servidor)
│   │   └── globals.css            # Reset y tokens de diseño
│   ├── components/documents/
│   │   ├── DocumentLibrary.tsx    # Isla cliente: carga y refresco
│   │   ├── UploadForm.tsx         # Selección y validación de UX
│   │   ├── DocumentDetail.tsx     # Render del texto por página
│   │   └── StatusBadge.tsx        # Procesado / Error / Pendiente
│   ├── generated/prisma/          # Cliente generado (ignorado por git)
│   └── lib/
│       ├── config.ts              # Límites y DATABASE_URL
│       ├── db.ts                  # PrismaClient + adapter pg
│       ├── documents/
│       │   ├── create-document.ts # Transacción de creación
│       │   ├── dto.ts             # Fechas ISO para la API
│       │   ├── queries.ts         # Listado y detalle
│       │   └── types.ts           # Tipos compartidos con el cliente
│       ├── errors.ts              # AppError + códigos HTTP
│       ├── format.ts              # Bytes y fechas
│       ├── http.ts                # Traducción de errores a JSON seguro
│       └── pdf/
│           ├── validation.ts      # Validación real del archivo
│           ├── extract-text.ts    # Recorrido de páginas con PDF.js
│           └── pdfjs-config.ts    # Ruta de las fuentes estándar
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
  id         String   @id @default(cuid())
  documentId String
  pageNumber Int
  text       String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@unique([documentId, pageNumber])
}
```

`DocumentPage` conserva la relación entre el texto y su página. Esa relación es la que permitirá construir citas verificables en los próximos sprints.

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

Devuelve el documento con `pages` ordenadas por `pageNumber`.

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
| `INTERNAL_ERROR` | 500 | Error inesperado; el detalle queda en la terminal. |

## Decisiones técnicas

### PDF.js en el servidor y con el build `legacy`

La extracción ocurre en el Route Handler con `runtime = "nodejs"`. Se importa `pdfjs-dist/legacy/build/pdf.mjs` porque PDF.js 6 usa `Promise.try`, que no está disponible en Node 22; el bundle legacy incluye el polyfill necesario. Además, `serverExternalPackages: ["pdfjs-dist"]` evita que el bundler reescriba la resolución del worker.

`pdfjs-config.ts` apunta a `node_modules/pdfjs-dist/standard_fonts` para que PDF.js pueda mapear fuentes no embebidas, como Helvetica, sin emitir advertencias. Si la ruta no existe, la extracción sigue funcionando.

### Texto por página desde el primer paso

Guardar un único bloque de texto habría sido más simple, pero impediría saber de qué página salió cada fragmento. `DocumentPage` mantiene esa correspondencia desde el inicio y prepara el terreno para las citas.

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
- **Sin deduplicación:** subir el mismo PDF dos veces crea dos documentos.
- **Sin progreso en tiempo real:** la UI muestra “Procesando…” mientras espera la respuesta, pero no hay porcentaje por página.
- **Sin rate limiting:** no hay protección contra abuso. Se trabajará antes de un despliegue público.
- **Límite de plataforma:** si algún día se despliega en Vercel, el límite de cuerpo de una función puede ser menor que 10 MB. Para este sprint, el entorno es local.
- **Sin almacenamiento de originales:** no se puede volver a descargar el PDF desde la aplicación.

## Cómo probar manualmente

1. Genera o consigue un PDF con texto seleccionable.
2. Súbelo desde la interfaz.
3. Verifica que aparece en la lista con el estado **Procesado**.
4. Abre el documento y revisa que cada página conserve su texto.
5. Prueba un PDF escaneado: debe mostrarse el mensaje de “No se encontró texto seleccionable en el PDF.” y no debe aparecer ningún registro nuevo.

Consulta directa a la base:

```bash
docker exec -it ida-postgres psql -U ida -d ida

SELECT id, "originalFilename", "pageCount", status FROM "Document";
SELECT "pageNumber", left(text, 80) FROM "DocumentPage" ORDER BY "pageNumber";
```

## Verificación de esta entrega

Comprobado en este entorno:

- `npm run typecheck` ✅
- `npm run lint` ✅
- `npx prisma migrate dev --name init` ✅ (migración aplicada)
- Smoke test HTTP con 31 comprobaciones ✅: carga válida, saneamiento de un nombre con `../`, listado, detalle, texto por página, PDF sin texto, MIME inválido, cabecera inválida, archivo vacío, PDF corrupto, archivo demasiado grande, exceso de páginas, archivo faltante, 404 de API y de página, y ausencia de registros parciales.
- SQL ✅: 2 páginas con el texto esperado; al borrar el `Document`, la eliminación en cascada dejó 0 páginas.

No se ejecutó `next build` durante esta entrega. La validación se hizo con `tsc`, ESLint y pruebas HTTP contra `next dev`.

## Próximo sprint

Chunking: dividir el texto por página en fragmentos con tamaño y solapamiento configurables, conservando `documentId` y `pageNumber` para que cada fragmento pueda citarse después.

## Orden sugerido para revisar el código

1. `src/app/api/documents/route.ts` — orquestación y traducción de errores.
2. `src/lib/pdf/validation.ts` — qué se valida y por qué.
3. `src/lib/pdf/extract-text.ts` — recorrido página por página y normalización.
4. `src/lib/documents/create-document.ts` — transacción de Prisma.
5. `prisma/schema.prisma` — modelo y restricciones.
6. `src/app/page.tsx` + `src/components/documents/DocumentLibrary.tsx` — separación servidor/cliente.
