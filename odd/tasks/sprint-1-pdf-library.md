# Feature: Sprint 1 — PDF library and text extraction

Objective: ship the first milestone of the Intelligent Document Assistant: upload a PDF, validate it on the server, extract text page by page with PDF.js, persist metadata and page text in PostgreSQL, and review the result in the UI.
Branch: `main` (new standalone repository, no remote yet).
Delivery: one work unit for the sprint; no PR/remote delivery requested.
Checks: `npm run typecheck`, `npm run lint`, Prisma migration against local PostgreSQL, runtime smoke tests through `next dev` with generated sample PDFs.

## Specs

- **S1 — Stack.** Next.js App Router, React, TypeScript strict mode, CSS Modules (no Tailwind), local PostgreSQL via Docker, Prisma, PDF.js, Node.js runtime for the upload Route Handler.
- **S2 — UI.** Responsive interface in Spanish with a document library screen.
- **S3 — Upload.** Accept a PDF through a `multipart/form-data` form.
- **S4 — Server validation.** The server must check: a file exists; size does not exceed a configurable limit (initial value: 10 MB); page count does not exceed a configurable limit (initial value: 50); the declared type is PDF; the file header is compatible with PDF. Client validation is convenience only.
- **S5 — Extraction.** Extract text from every page with PDF.js and preserve the page number. No OCR.
- **S6 — No text.** Reject PDFs without selectable text with a clear message. Exact user-facing string: "No se encontró texto seleccionable en el PDF."
- **S7 — Persistence.** `Document`: id, originalFilename, mimeType, sizeBytes, pageCount, status, optional errorMessage, createdAt, updatedAt. `DocumentPage`: id, documentId, pageNumber, text. One-to-many relation with foreign key and cascade delete. `unique(documentId, pageNumber)`. Create both through a transaction; a failure must not leave partial rows.
- **S8 — List.** Show documents with name, size, page count, date, and status.
- **S9 — Detail.** Opening a document shows the extracted text ordered by page.
- **S10 — States.** Include loading, empty, success, and error states. Processing status surfaces as pending (client-side while uploading), processed, or error. Exact DB statuses: `PROCESSED` or `FAILED`.
- **S11 — README.** Document requirements, setup, exact commands, and relevant decisions.
- **S12 — Scope guard.** No authentication, no OpenRouter keys or AI variables, no embeddings/chunks/pgvector queries/chat/generative answers, no OCR dependency. Do not use the original filename as a storage path. Do not persist the binary. Do not return internal traces to the browser. Do not leave partial records.
- **S13 — Config.** Size and page limits come from environment variables with safe defaults.
- **S14 — Database.** `docker-compose.yml` for a pgvector-compatible PostgreSQL image, even though this sprint stores no vectors.
- **S15 — Endpoints/pages.** Provide the upload endpoint plus the endpoints/pages required to list and read documents.
- **S16 — Review summary.** End with a summary of files and technical decisions so the learner can review the code.

## Tasks

| ID | Specs | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| T1 | S1, S13, S14 | inline | done | `package.json`, `next.config.ts`, `docker-compose.yml`, `.env.example`; DB healthy on host 5434 |
| T2 | S7 | inline | done | `prisma/schema.prisma`, `prisma.config.ts`, initial migration applied |
| T3 | S4, S12, S13 | inline | done | `src/lib/config.ts`, `errors.ts`, `pdf/validation.ts`; 400/413/415/422 cases exercised |
| T4 | S5, S6 | inline | done | `src/lib/pdf/extract-text.ts`; 2-page fixture extracted; no-text fixture rejected with the exact message |
| T5 | S7 | inline | done | `create-document.ts` uses `prisma.$transaction`; SQL confirmed 2 pages; cascade leaves 0 |
| T6 | S3, S12, S15 | inline | done | `app/api/documents/route.ts`, `[id]/route.ts`; 201/400/404/413/415/422 verified |
| T7 | S2, S8, S10 | inline | done | `app/page.tsx`, `DocumentLibrary.tsx`, `UploadForm.tsx`; SSR empty state and limits verified |
| T8 | S9, S10 | inline | done | `DocumentDetail.tsx`, `documents/[id]/page.tsx`; page headings/text and 404 verified |
| T9 | S11, S16 | inline | done | `README.md` |
| T10 | S1–S16 | inline | done | typecheck, lint, migration, 31 HTTP checks, SQL checks |

Route note: every task runs inline. Greenfield units depend on each other (schema → validation → extraction → persistence → API → UI), so no writer trigger holds: there are no independent parallel units with disjoint surfaces.

## Log

### L1 — User request (verbatim, implementation block)

> Actuá como desarrollador senior de TypeScript y Next.js. Implementá el Sprint 1 de un proyecto educativo llamado Intelligent Document Assistant.
>
> CONTEXTO
> Estoy aprendiendo AI Engineering y RAG. Quiero comprender la implementación, no recibir una solución opaca. Mantené el código modular y explícito. No agregues LangChain ni frameworks de abstracción de IA.
>
> OBJETIVO DEL SPRINT
> Crear una aplicación web que permita subir un PDF, validar la carga, extraer su texto por página en el servidor, persistir los metadatos y el texto en PostgreSQL y mostrar los documentos procesados en la interfaz.
>
> STACK
> - Next.js App Router
> - React
> - TypeScript con strict mode
> - CSS Modules, sin Tailwind
> - PostgreSQL local mediante Docker
> - Prisma para el esquema y las operaciones de entidades
> - PDF.js para extracción de texto
> - Runtime Node.js para el Route Handler de carga
>
> ALCANCE
> 1. Crear una interfaz responsive básica en español.
> 2. Crear una pantalla de biblioteca de documentos.
> 3. Permitir cargar un archivo PDF mediante formulario multipart/form-data.
> 4. Validar en el servidor:
>    - que exista un archivo;
>    - que el tamaño no exceda un límite configurable (valor inicial: 10 MB);
>    - que no exceda un límite configurable de páginas (valor inicial: 50);
>    - que el tipo declarado sea PDF y la cabecera del archivo sea compatible con PDF.
> 5. Extraer texto de cada página con PDF.js y conservar el número de página.
> 6. Rechazar con un mensaje claro PDFs sin texto seleccionable. No implementar OCR.
> 7. Guardar en PostgreSQL:
>    Document: id, originalFilename, mimeType, sizeBytes, pageCount, status, errorMessage opcional, createdAt, updatedAt.
>    DocumentPage: id, documentId, pageNumber, text.
>    Relación uno a muchos Document -> DocumentPage, con clave foránea y eliminación en cascada.
> 8. Mostrar listado de documentos con nombre, tamaño, cantidad de páginas, fecha y estado.
> 9. Al abrir un documento, mostrar el texto extraído ordenado por página.
> 10. Incluir estados de carga, vacío, éxito y error en la UI.
> 11. Crear un README con requisitos, configuración, comandos y decisiones relevantes.
>
> ARQUITECTURA
> - Separá componentes UI, acceso a datos, validación y extracción del PDF.
> - El Route Handler solo debe orquestar la operación y traducir errores a respuestas HTTP seguras.
> - No devuelvas trazas ni detalles internos al navegador.
> - No guardes el archivo usando su nombre original como ruta.
> - No confíes únicamente en validaciones del cliente.
> - Evitá operaciones de filesystem innecesarias; el archivo binario no debe persistirse en esta etapa.
> - Usá transacción para crear el Document y sus DocumentPage. Si la operación falla, no dejes datos parciales.
> - Usá Node.js runtime en el endpoint de carga.
>
> MODELO DE DATOS
> Document:
> - id
> - originalFilename
> - mimeType
> - sizeBytes
> - pageCount
> - status: PROCESSED o FAILED (si el manejo transaccional impide persistir FAILED, explicá esa decisión en README)
> - errorMessage opcional, sin incluir datos sensibles
> - createdAt
> - updatedAt
>
> DocumentPage:
> - id
> - documentId
> - pageNumber
> - text
> - unique(documentId, pageNumber)
>
> SEGURIDAD Y LÍMITES
> - No implementes autenticación todavía.
> - Dejá claro en README que esta versión es para desarrollo local y no debe exponerse públicamente.
> - No agregues claves de OpenRouter ni variables de IA.
> - No implementes embeddings, chunks, pgvector queries, chat ni respuestas generativas en este sprint.
> - Configurá los límites de tamaño y páginas desde variables de entorno con valores por defecto seguros.
> - Los errores devueltos al cliente deben ser comprensibles y no revelar información interna.
> - No agregues una dependencia de OCR.
>
> ENTREGABLES
> - Aplicación ejecutable localmente.
> - docker-compose.yml para PostgreSQL compatible con pgvector, aunque este sprint todavía no almacene vectores.
> - Prisma schema y migración inicial.
> - Endpoint de carga y endpoints/páginas necesarios para listar y leer documentos.
> - UI funcional con CSS Modules.
> - README con configuración y comandos exactos.
> - Resumen final de archivos y decisiones técnicas para que yo pueda revisar el código.
>
> PROCESO
> 1. Primero inspeccioná el repositorio y respetá su estructura si ya existe.
> 2. Antes de editar, proponé brevemente la estructura que vas a crear o modificar.
> 3. Implementá solo el Sprint 1.
> 4. No agregues funcionalidades futuras “por comodidad”.
> 5. Al final, explicá el flujo completo desde el formulario hasta la persistencia, los límites conocidos y qué partes debo revisar para entender la extracción por página.

### L2 — Environment findings (2026-11-11)

- Workspace is empty and not a Git repository.
- Node 22.13.1, npm 10.9.2, Docker 29.1.3 available. Host ports 5432 and 5433 are already in use by other local services, so the container is mapped to host port 5434.
- Current ecosystem versions resolved from the npm registry: Next 16.4.6, React 19.3.1, Prisma 7.10.1 (stable; 8.x is still RC), pdfjs-dist 6.5.438 (requires Node >= 22.13), TypeScript 5.9.3 (Prisma 7 recommends 5.9.x over the new TS 7 native compiler).
- Prisma 7 requires ESM (`"type": "module"`), the `prisma-client` generator with an explicit `output`, a driver adapter (`@prisma/adapter-pg` + `pg`), `prisma.config.ts`, and explicit `prisma generate` (migrate no longer generates automatically).
- PDF.js in Node sets `GlobalWorkerOptions.workerSrc` to `./pdf.worker.mjs` relative to its own build; `pdfjs-dist` must be listed in `serverExternalPackages` so Next does not bundle it and the relative worker import keeps working.

### L3 — Decisions (2026-11-11)

- Extraction happens before any DB write. A PDF that fails extraction never produces a `Document`, so `FAILED` is defined in the enum but not written by the synchronous Sprint 1 pipeline. The README explains this; the UI shows "pending" only as a transient client state while the upload is in flight.
- The upload route orchestrates validation → extraction → a single Prisma transaction. No binary is written to disk.
- `src/generated/prisma` is gitignored; `npm run db:generate` is part of setup.
- The initial library list is read by the server page and passed as props to the client island; refreshes use `GET /api/documents`. The document detail is a server component that reads through the same data-access module.

### L4 — Implementation and verification (2026-11-11)

- Stack installed: Next 16.4.6, React 19.3.1, TypeScript 5.9.3, Prisma 7.10.1, `pdfjs-dist` 6.5.438. The package is ESM (`"type": "module"`), as Prisma 7 requires.
- Database: `pgvector/pgvector:pg17` on host port **5434** because host ports 5432 and 5433 were already occupied. Initial migration `20261111082521_init` applied; `DocumentPage` has the composite unique index and cascade FK.
- PDF.js: the root v6 build crashes on Node 22.13 with `Promise.try is not a function`; the app imports `pdfjs-dist/legacy/build/pdf.mjs`, whose bundle includes the polyfill. `serverExternalPackages: ["pdfjs-dist"]` keeps worker resolution native. `standardFontDataUrl` points to `node_modules/pdfjs-dist/standard_fonts` through `process.cwd()` because Turbopack virtualizes `require.resolve` for external packages.
- Next 16: `turbopack.root` is set to `process.cwd()` so Turbopack does not walk to the home directory because of unrelated lockfiles.
- UI: the initial document list is fetched by the server component and passed as props; the client island only handles upload and refresh. This avoids a mount-time `setState` effect (flagged by the React hooks lint rule) and a redundant round trip.
- The detail route has no `loading.tsx` on purpose: with a loading boundary, Next streams the skeleton and `notFound()` arrives after the 200 status. Without it, `/documents/<missing>` correctly returns 404.
- Implementation commit: `9036219` (T1–T9). T10 evidence was collected against this tree.
- Verification: `npm run typecheck` and `npm run lint` pass; 31 HTTP checks pass (valid upload, `../../evil name.pdf` sanitized to `evil name.pdf`, list, detail, extracted page text, no-text 422 with the exact message, MIME 415, header 400, empty 400, corrupt 422, oversized 413, page-limit 422, missing file 400, API/page 404, no partial rows); SQL shows 1 document / 2 pages with the expected text, and deleting the document leaves 0 pages. `next build` was not run per the workspace rule.
