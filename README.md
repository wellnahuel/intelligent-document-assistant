# Intelligent Document Assistant — Sprint 7

Aplicación web educativa multiusuario para subir PDFs, extraer su texto página por página, dividirlo en fragmentos trazables, generar **embeddings**, recuperar los fragmentos más cercanos con **pgvector** y responder preguntas con un modelo de **OpenRouter** y **citas verificadas** a las páginas del documento.

Este es el séptimo y último hito del proyecto de RAG. El recorrido completo es **autenticar → aislar → indexar → recuperar → generar**. Cada cuenta tiene su propia biblioteca: las páginas, los chunks y los embeddings heredan el dueño del documento, y las consultas vectoriales filtran por `userId` dentro del SQL. La pregunta se convierte en un vector con el mismo proveedor/modelo usado para indexar; solo los chunks autorizados del documento elegido se envían como contexto a OpenRouter; el servidor valida las citas antes de mostrarlas. La respuesta sigue siendo de un solo turno: no hay historial de conversación, herramientas ni agentes.

> **Estado del demo.** El repositorio queda preparado para desplegar en **Vercel + Neon**, con límite de PDF de 4 MB en producción, proveedor de embeddings configurable y CI. El demo público **todavía no fue publicado ni verificado desde este entorno**: no hay URL inventada en este README. Los pasos de cuenta (Neon, Vercel, OpenRouter) y la checklist manual están en [Despliegue](#sprint-7--despliegue-y-cierre). Los fixtures de evaluación son ficticios: si activás el reranking, la pregunta y los fragmentos candidatos salen hacia un proveedor externo.

## Qué incluye

- Todo lo del Sprint 1: carga de PDF, validación, extracción por página y biblioteca.
- Todo lo del Sprint 2: chunking con overlap, offsets de caracteres y regeneración idempotente.
- Autenticación con **Auth.js v5** y Credentials provider; sesión JWT en cookie HttpOnly de la librería, nunca en `localStorage`.
- Registro e ingreso con email normalizado y único; contraseñas guardadas solo como **hash Argon2id** (19 MiB, 2 iteraciones, 1 lane, 32 bytes).
- Logout y protección de páginas y endpoints; los anónimos reciben redirect o `401`.
- DAL `server-only` que obtiene la identidad verificada y devuelve documentos acotados por `userId`.
- `User`, `Document.userId` y ownership transitivo de páginas, chunks y embeddings; borrado en cascada.
- Prevención de IDOR en listado, detalle, carga, borrado, chunking, embeddings, búsqueda, RAG y citas.
- Filtro de `userId` dentro del SQL vectorial y léxico; la evaluación también resuelve el dueño del fixture.
- Límites persistentes en PostgreSQL por usuario para cargas, embeddings, preguntas y búsquedas; límite de documentos y rate limit de login/registro.
- Respuestas `429` con `Retry-After` y mapeo seguro de `429`/`402` de OpenRouter.
- Pruebas de aislamiento con dos usuarios y dos documentos contra PostgreSQL real.
- Prueba de prompt injection: el texto malicioso queda como dato, no dispara acciones y las citas inventadas se eliminan.
- Todo lo del Sprint 3: `EmbeddingProvider` local con `Transformers.js` y el modelo multilingüe `Xenova/multilingual-e5-small`.
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
- Todo lo del Sprint 7: límite de PDF de 4 MB en Vercel (10 MB local) con `413` seguro.
- Proveedor de embeddings **local o remoto**: `EMBEDDING_PROVIDER=local` usa Transformers.js; `openrouter` usa el endpoint de embeddings de OpenRouter sin cargar ONNX en producción.
- El modelo y la revisión se guardan en cada embedding; documentos y preguntas usan la misma configuración y los vectores de otro modelo no se mezclan.
- PrismaClient como singleton por proceso, pool acotado y `prisma migrate deploy` para producción.
- Logs JSON con `requestId`, etapa, duración, tokens y tipo de error; sin preguntas, prompts, texto de PDFs, cookies ni claves.
- `GET /api/health` con respuesta mínima (`{ "status": "ok" }` o `unavailable`) y sin secretos.
- Workflow de GitHub Actions con instalación desde lockfile, lint, tipos, tests unitarios, build y tests de integración contra PostgreSQL con pgvector.
- README de portfolio: arquitectura, pipeline RAG, entornos, límites, costos, resultados reales de evaluación y checklist de despliegue.

## Documentación del sprint

- **Sprint 7:** la sección [Despliegue y cierre](#sprint-7--despliegue-y-cierre) explica la arquitectura de producción, Neon/Vercel, migraciones, límite de carga, proveedor de embeddings, observabilidad, costos, resultados reales de evaluación y checklist manual. No hay guía PDF de este sprint: el entregable de portfolio es este README.
- `docs/sprint-6-como-funciona.pdf` — guía de estudio del Sprint 6 (17 páginas): autenticación vs autorización, Auth.js y Argon2id, DAL, IDOR, migración legacy, filtro de ownership en SQL, prompt injection, límites, prueba con dos cuentas y deudas abiertas.
- `docs/sprint-6-como-funciona.html` — fuente editable de la guía; el PDF se genera con Chrome headless.
- **Sprint 6:** la sección [Autenticación, autorización y seguridad](#sprint-6--autenticación-autorización-y-seguridad) de este README explica el flujo de identidad, la DAL, la prevención de IDOR, el aislamiento SQL, los límites y las amenazas abiertas.
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
- Herramientas ejecutables para el modelo; la salida del modelo nunca modifica datos, permisos ni consultas.
- Recuperación de contraseña, verificación de email, MFA, OAuth o inicio de sesión con proveedores externos.
- Row-Level Security de PostgreSQL. El aislamiento se aplica en la DAL y en cada consulta; RLS sigue fuera de alcance porque el adaptador de conexión no transmite una identidad de usuario a PostgreSQL.
- Un panel de administración, auditoría de accesos o borrado de cuenta.
- Conectar la búsqueda híbrida o el reranking al flujo de `/ask`; por ahora se comparan en la evaluación.
- Un LLM juez automático para calidad de respuesta.
- Umbral universal de similitud.
- Índices HNSW o IVFFlat.
- Stemming específico para español o italiano; la búsqueda léxica usa la configuración `simple`.
- OCR para PDFs escaneados.
- Almacenamiento del archivo PDF original.
- Antivirus o análisis de malware de los PDFs.
- Garantías de privacidad del proveedor externo: la pregunta y los fragmentos recuperados se envían a OpenRouter cuando se genera una respuesta; en modo de embeddings remoto, los chunks también salen hacia OpenRouter.
- Un demo público verificado. Los pasos para publicarlo están documentados, pero este entorno no accedió a cuentas ni creó un deployment.

## Stack

| Parte | Tecnología |
| --- | --- |
| Framework | Next.js 16 (App Router) + React 19 |
| Lenguaje | TypeScript en modo `strict` |
| Estilos | CSS Modules, sin Tailwind |
| Base de datos | PostgreSQL 17 con pgvector, vía Docker |
| ORM | Prisma 7 + `@prisma/adapter-pg` |
| Autenticación | Auth.js v5 (`next-auth` beta compatible con Next 16) + Credentials provider |
| Hash de contraseñas | `@node-rs/argon2` con Argon2id (OWASP starting point) |
| Sesión | JWT firmado y cifrado por Auth.js en cookie HttpOnly |
| Límites de uso | Fixed window persistente en PostgreSQL (`RateLimitBucket`) |
| Extracción | PDF.js (`pdfjs-dist` 6) |
| Chunking | Módulo TypeScript puro, sin dependencias de IA |
| Embeddings | `@huggingface/transformers` 4 + ONNX Runtime local, u OpenRouter `/api/v1/embeddings` (configurable por entorno) |
| Modelo de embeddings | Local: `Xenova/multilingual-e5-small` (384 dimensiones). Remoto: el modelo de 384 dimensiones que elijas en OpenRouter |
| Despliegue | Vercel (Next.js) + Neon (PostgreSQL con pgvector) |
| CI | GitHub Actions con PostgreSQL 17 + pgvector |
| Observabilidad | Logs JSON estructurados + `GET /api/health` |
| Generación | OpenRouter Chat Completions vía `fetch` en el servidor |
| Búsqueda léxica | PostgreSQL `tsvector`/`tsquery` con configuración `simple` e índice GIN |
| Búsqueda híbrida | Reciprocal Rank Fusion sobre rankings vectorial y léxico |
| Reranking opcional | OpenRouter `/api/v1/rerank` vía `fetch` en el servidor |
| Scripts de evaluación | `tsx` para ejecutar TypeScript fuera de Next.js |
| Validación de entrada | Zod |
| Tests | `node:test` para el chunker + Vitest unitario e integración contra PostgreSQL |

## Requisitos

- **Node.js 22.13 o superior** (probado con 22.13.1). `pdfjs-dist` 6 y Transformers.js lo requieren.
- **npm 10 o superior**.
- **Docker** con Docker Compose.
- Puerto **3000** libre para Next.js.
- Puerto **5434** libre para PostgreSQL en el host.
- Espacio en disco y conexión a Internet la primera vez que se usa el modelo local. El archivo ONNX fp32 pesa unos **470 MB** y se guarda en `.cache/transformers/`; después los archivos se reutilizan desde la caché, aunque Transformers.js puede seguir consultando metadatos remotos para resolver el modelo. En producción con `EMBEDDING_PROVIDER=openrouter` no se descarga.
- Una cuenta de OpenRouter con una API key y un ID de modelo compatible con Chat Completions. La clave se usa solo en el servidor.
- Para desplegar: una cuenta de Vercel, un proyecto de Neon con pgvector y una cuenta de OpenRouter con crédito o un modelo disponible. Los límites y precios de los planes gratuitos cambian; verificá el uso real antes de publicar.

## Puesta en marcha

```bash
# 1. Variables de entorno locales
cp .env.example .env
# Completá AUTH_SECRET, OPENROUTER_API_KEY y OPENROUTER_MODEL en .env
# AUTH_SECRET se genera con: openssl rand -base64 32

# 2. Dependencias
npm install

# 3. PostgreSQL
docker compose up -d

# 4. Cliente de Prisma
npm run db:generate

# 5. Migraciones (incluye users/ownership/rate limits, CREATE EXTENSION vector y el índice GIN)
npm run db:migrate

# 6. Fixture de evaluación ficticio (opcional; requiere el modelo local)
npm run eval:seed
npm run eval:retrieval

# 7. Servidor de desarrollo
npm run dev
```

Abre <http://localhost:3000>, crea una cuenta en `/register` y sube un PDF con texto seleccionable, genera los fragmentos y después los embeddings. Cada cuenta ve solo sus propios documentos. La primera generación de embeddings descarga el modelo y puede tardar varios minutos; las siguientes usan la caché.

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
| `DATABASE_URL` | Sí | — | Conexión de runtime a PostgreSQL. En Neon puede ser el endpoint agrupado. |
| `DIRECT_URL` | No | — | Conexión directa usada **solo por el CLI de Prisma** para migraciones/introspección cuando `DATABASE_URL` es un endpoint agrupado. El runtime la ignora. |
| `DATABASE_POOL_MAX` | No | `1` en Vercel, `5` local | Conexiones máximas del pool por proceso. Rango: 1–20. |
| `AUTH_SECRET` | Sí | — | Secreto de Auth.js para firmar/cifrar la cookie de sesión. Generarlo con `openssl rand -base64 32`. Nunca usar el prefijo `NEXT_PUBLIC_` ni commitearlo. |
| `MAX_DOCUMENTS_PER_USER` | No | `20` | Cantidad máxima de documentos por cuenta. Se verifica dentro de la transacción de creación. |
| `UPLOAD_RATE_LIMIT_PER_HOUR` | No | `10` | Cargas por usuario por hora. |
| `EMBEDDING_RATE_LIMIT_PER_HOUR` | No | `10` | Generaciones de embeddings por usuario por hora. |
| `ASK_RATE_LIMIT_PER_HOUR` | No | `30` | Preguntas RAG por usuario por hora. |
| `SEARCH_RATE_LIMIT_PER_HOUR` | No | `60` | Búsquedas semánticas por usuario por hora. |
| `LOGIN_RATE_LIMIT_PER_15_MIN` | No | `10` | Intentos de login por email cada 15 minutos. |
| `LOGIN_IP_RATE_LIMIT_PER_15_MIN` | No | `30` | Intentos de login por IP cada 15 minutos. |
| `REGISTER_RATE_LIMIT_PER_HOUR` | No | `5` | Registros por IP por hora. |
| `REGISTER_EMAIL_RATE_LIMIT_PER_HOUR` | No | `3` | Intentos de registro por email por hora. |
| `MAX_PDF_SIZE_MB` | No | `10` local, `4` en Vercel | Tamaño máximo del PDF en MB. En Vercel se limita a 4 MB aunque configures más, por el cuerpo máximo de 4,5 MB de las Functions. |
| `MAX_PDF_PAGES` | No | `50` | Cantidad máxima de páginas. |
| `CHUNK_TARGET_CHARS` | No | `1200` | Tamaño objetivo de cada fragmento, en caracteres. |
| `CHUNK_OVERLAP_CHARS` | No | `150` | Caracteres que se repiten desde el fragmento anterior. |
| `CHUNK_MIN_CHARS` | No | `100` | Tamaño mínimo del último fragmento antes de fusionarlo. |
| `EMBEDDING_PROVIDER` | No | `local` | `local` usa Transformers.js en el proceso; `openrouter` usa el endpoint remoto de embeddings. |
| `EMBEDDING_MODEL_ID` | Según el proveedor | `Xenova/multilingual-e5-small` | Modelo local o, con `EMBEDDING_PROVIDER=openrouter`, el id remoto (obligatorio en ese modo). Debe producir 384 dimensiones. |
| `EMBEDDING_MODEL_REVISION` | No | Commit de Hugging Face; `openrouter-managed` en remoto | Revisión inmutable local o etiqueta operativa remota. Se guarda con cada embedding. |
| `EMBEDDING_CACHE_DIR` | No | `.cache/transformers` | Carpeta de caché del modelo local. Está ignorada por git y no se usa en modo remoto. |
| `EMBEDDING_BATCH_SIZE` | No | `4` | Chunks por lote de inferencia y escritura. Rango: 1–16. |
| `OPENROUTER_EMBEDDING_TIMEOUT_MS` | No | `20000` | Timeout de cada request remoto de embeddings. Rango: 1000–120000. |
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

Los valores inválidos generan una advertencia en la terminal y se usan los valores por defecto. La dimensión **no** es configurable: la columna SQL es `vector(384)` y ambos proveedores validan que el modelo produzca exactamente 384 números. Cambiar entre local y remoto **no** requiere una migración de esquema, pero sí regenerar los embeddings: el filtro de recuperación usa `modelId` + `modelRevision`, así que los vectores viejos quedan ignorados hasta que se regeneran. Cambiar a un modelo de otra dimensión sí exige una migración.

Local, Preview y Production deben tener **bases y secretos distintos**. En Vercel, cada variable se asigna por entorno y los cambios aplican a deployments nuevos. Una rama de Preview nunca debe apuntar a la base de Production ni reutilizar su `AUTH_SECRET`.

`AUTH_SECRET` es obligatorio para que Auth.js pueda firmar y cifrar la cookie de sesión. No se expone al cliente. Los límites son opcionales: si no se configuran, se usan los valores de la tabla. Los contadores viven en `RateLimitBucket`, no en memoria, así que sobreviven reinicios y se comparten entre procesos que usen la misma base. Las filas vencidas se pueden limpiar con `DELETE FROM "RateLimitBucket" WHERE "expiresAt" < now();`.

`OPENROUTER_API_KEY` y `OPENROUTER_MODEL` se leen solo en el servidor. Si faltan, `/api/ask` responde `503` con un mensaje seguro después de recuperar los fragmentos; el camino sin evidencia sigue funcionando sin llamar al proveedor. En modo de embeddings remoto, `OPENROUTER_API_KEY` también es obligatoria para indexar y para embeber la pregunta. La clave no aparece en el bundle del navegador, en la API ni en los logs.

`DIRECT_URL` es opcional y solo la lee `prisma.config.ts` para comandos de CLI. El runtime siempre usa `DATABASE_URL` en `src/lib/db.ts`; no se debe asumir que `DIRECT_URL` cambia la conexión de la aplicación.

El reranking es opcional: con `RERANK_MODEL` vacío o sin clave, `npm run eval:retrieval` lo marca como `skipped` y termina normalmente. Cuando se activa, la pregunta y los fragmentos candidatos se envían a OpenRouter; usá solo documentos ficticios o que puedas compartir. No se asume que exista un modelo gratuito disponible.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo con Turbopack. |
| `npm run build` | Genera el cliente de Prisma y compila para producción. |
| `npm run start` | Servidor de producción (requiere `build`). |
| `npm run lint` | ESLint con la configuración de Next.js. |
| `npm run typecheck` | `tsc --noEmit` con TypeScript estricto. |
| `npm test` | Ejecuta los tests del chunker y los tests unitarios de embeddings y RAG. |
| `npm run test:chunking` | Tests del chunker con el runner nativo de Node. |
| `npm run test:unit` | Tests unitarios con Vitest. |
| `npm run test:unit:watch` | Vitest en modo watch. |
| `npm run test:integration` | Crea/migra una base `*_test` aislada y ejecuta las pruebas de aislamiento contra PostgreSQL real. |
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
│   ├── schema.prisma              # User, Document, páginas, chunks, embeddings y rate limits
│   └── migrations/                # Inicial, chunks, embeddings/GIN y users/ownership/limits
├── eval/
│   ├── gold-set.json              # 25 casos con chunks relevantes y hechos esperados
│   ├── fixtures/
│   │   └── fictional-documents.json
│   ├── answer-quality-review.md   # Plantilla manual de respuesta y citas
│   └── reports/
│       └── reference-report.json  # Ejecución real de referencia
├── src/
│   ├── app/
│   │   ├── (auth)/                # Login, registro y server actions de sesión
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── documents/
│   │   │   │   ├── route.ts       # GET (lista propia) y POST (carga)
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts   # GET y DELETE acotados por dueño
│   │   │   │       ├── chunks/route.ts
│   │   │   │       └── embeddings/route.ts
│   │   │   ├── search/route.ts    # POST de búsqueda vectorial propia
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
│   │   ├── auth/                  # LoginForm, RegisterForm y estilos
│   │   ├── documents/
│   │   │   ├── DocumentLibrary.tsx
│   │   │   ├── UploadForm.tsx
│   │   │   ├── DocumentDetail.tsx
│   │   │   ├── DeleteDocumentButton.tsx
│   │   │   ├── DocumentChunkViewer.tsx
│   │   │   ├── DocumentEmbeddingsPanel.tsx
│   │   │   └── StatusBadge.tsx
│   │   ├── search/
│   │   │   └── SearchPanel.tsx    # Formulario y resultados de la búsqueda
│   │   └── ask/
│   │       └── AskPanel.tsx       # Pregunta, respuesta y fuentes verificadas
│   ├── generated/prisma/          # Cliente generado (ignorado por git)
│   └── lib/
│       ├── auth/                  # Argon2id, input, credenciales, registro y usuarios
│       ├── chunking/
│       │   ├── chunk-text.ts
│       │   └── config.ts
│       ├── client/
│       │   └── read-error.ts      # Lectura segura de errores de la API
│       ├── config.ts
│       ├── dal.ts                 # Identidad verificada y helpers requireUser/requireApiUser
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
│       ├── rate-limit/           # Configuración, claves opacas y fixed window SQL
│       ├── errors.ts
│       ├── format.ts
│       ├── http.ts
│       └── pdf/
│           ├── validation.ts
│           ├── extract-text.ts
│           └── pdfjs-config.ts
├── tests/
│   ├── chunking.test.mjs
│   ├── integration/
│   │   └── access-control.test.ts # Dos usuarios, dos documentos, SQL real
│   ├── stubs/
│   │   └── server-only.ts
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
│       ├── rag-injection.test.ts
│       ├── rag-provider-errors.test.ts
│       ├── auth-input.test.ts
│       ├── auth-password.test.ts
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
│   ├── generate-sample-pdf.mjs
│   └── test-integration.ts
├── docker-compose.yml
├── prisma.config.ts
├── next.config.ts
├── vitest.config.ts
├── vitest.integration.config.ts
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
| `vector` | 25 | 1.0000 | 0.2100 | 0.9667 | 3.18 ms |
| `lexical` | 25 | 0.9500 | 0.2000 | 0.6350 | 2.88 ms |
| `hybrid` | 25 | 1.0000 | 0.2100 | 0.9000 | 3.60 ms |
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

## Sprint 6 — Autenticación, autorización y seguridad

### Autenticación no es autorización

**Autenticación** responde quién hace la solicitud. **Autorización** responde si esa persona puede acceder a un documento concreto. En esta app, Auth.js verifica email y contraseña y produce una sesión; la DAL usa el `userId` de esa sesión como único origen de identidad. Un `documentId` que llega por la URL, el body o un formulario no demuestra nada: siempre se combina con el `userId` verificado en la misma consulta.

### Flujo de autenticación

1. `/register` valida email y contraseña en el servidor y aplica rate limits por email e IP.
2. La contraseña se deriva con **Argon2id** (`m=19456`, `t=2`, `p=1`, salida de 32 bytes). La base guarda solo el hash; nunca la contraseña ni un cifrado reversible.
3. Auth.js Credentials compara el hash y emite una sesión **JWT** dentro de una cookie HttpOnly, SameSite=Lax, firmada y cifrada por la librería. No hay tokens en `localStorage` ni cookies de sesión propias.
4. El email se normaliza a minúsculas y se recorta antes de guardar/comparar; la unicidad la garantiza el índice de PostgreSQL.
5. Los errores de login son siempre `Email o contraseña incorrectos.` y un email inexistente recorre una verificación Argon2id ficticia para reducir la diferencia de tiempo. El registro usa un mensaje genérico ante un email duplicado.
6. `/api/auth/[...nextauth]` expone los handlers de Auth.js; `/login` y `/register` son las páginas. El logout se ejecuta con `signOut` de Auth.js desde una server action.
7. `AUTH_SECRET` firma/cifra la cookie. Es un secreto de servidor: no se expone con `NEXT_PUBLIC_` y no se commitea.

No hay OAuth, proveedor de email, recuperación de contraseña, verificación de email ni MFA porque no hay credenciales ni proveedor configurados. No se inventaron.

### DAL y prevención de IDOR

`src/lib/dal.ts` es `server-only` y expone:

- `getSessionUser()`: lee la sesión verificada de Auth.js y devuelve `{ id, email }` o `null`.
- `requireUser()`: para páginas; redirige a `/login`.
- `requireApiUser()`: para route handlers; lanza `401 UNAUTHENTICATED`.

Las consultas de documentos viven en `src/lib/documents/queries.ts` y empiezan por el dueño:

```ts
const document = await prisma.document.findFirst({
  where: { id: documentId, userId: session.user.id },
});
```

No existe un `findUnique({ where: { id } })` seguido de una autorización tardía. Un documento ajeno y uno inexistente producen la misma respuesta: `notFound()` en la página y `404 DOCUMENT_NOT_FOUND` en la API. Cubre listado, detalle, carga, borrado, chunks, embeddings, búsqueda, RAG y citas. Ocultar un botón no es un control de seguridad.

### Aislamiento de datos y migración

```text
User
└── Document (userId, FK onDelete: Cascade)
    └── DocumentPage (cascade)
        └── DocumentChunk (cascade)
            └── ChunkEmbedding (cascade)
```

La migración `20261113113000_add_users_ownership_and_rate_limits`:

1. crea `User` y `RateLimitBucket`;
2. agrega `Document.userId` nullable;
3. crea un usuario legacy `legacy-owner-0000000000000000` con un hash inválido que no puede autenticarse;
4. asigna todos los documentos existentes a ese usuario;
5. vuelve `userId` obligatorio, agrega el índice y la FK con cascada.

Los documentos legacy se preservan, pero no son accesibles desde ninguna sesión. Para reasignarlos hay que decidir su dueño real y ejecutar, por ejemplo:

```sql
UPDATE "Document" SET "userId" = '<real-user-id>' WHERE "id" = '<document-id>';
```

El fixture de evaluación usa un dueño propio (`eval-fixture-owner`), también sin login, y el CLI resuelve ese dueño para no saltarse el filtro.

### Ownership dentro del SQL vectorial

La búsqueda vectorial no recupera filas para autorizarlas después. El `JOIN` con `Document` y el predicado `d."userId" = $userId` están dentro de la misma consulta que ordena por distancia coseno:

```sql
FROM "ChunkEmbedding" e
JOIN "DocumentChunk" c ON c."id" = e."chunkId"
JOIN "DocumentPage" p ON p."id" = c."documentPageId"
JOIN "Document" d ON d."id" = p."documentId"
WHERE e."modelId" = $modelId
  AND e."modelRevision" = $modelRevision
  AND e."dimensions" = $dimensions
  AND d."userId" = $userId
ORDER BY e."embedding" <=> $vector ASC
LIMIT $topK
```

La búsqueda léxica y la híbrida aplican el mismo filtro. Los conteos de la UI también están acotados. La evaluación recibe un mapa `documentId → userId`; si falta el dueño, falla en vez de consultar globalmente.

### RAG, prompt injection y salida del modelo

El texto de un PDF y la pregunta son datos no confiables. El system prompt separa instrucciones de fuentes y aclara que el contexto no son instrucciones, pero **el prompt no es una frontera de seguridad**. Las defensas reales de este sprint son:

- no hay herramientas, agentes ni acciones ejecutables;
- la salida del modelo no modifica datos, permisos ni consultas;
- los IDs de cita `[S#]` se validan contra los chunks recuperados y autorizados; los inventados se eliminan;
- la respuesta se renderiza como texto de React, sin `dangerouslySetInnerHTML`;
- el `userId`, el documento y los filtros se deciden en el servidor, nunca en el modelo;
- el request a OpenRouter solo envía mensajes `system` y `user`; no incluye `tools` ni `tool_choice`;
- los logs no incluyen prompts, contraseñas, cookies, API keys, preguntas completas ni texto completo de documentos.

La prueba `tests/unit/rag-injection.test.ts` incluye un chunk con instrucciones maliciosas, comprueba que no contamina el system prompt, que no se envían herramientas y que una cita inventada no se convierte en fuente.

Amenazas que siguen abiertas en este sprint: un modelo puede seguir influenciado por texto malicioso dentro de la respuesta (aunque no puede ejecutar acciones), no hay detección de contenido malicioso en PDFs, no hay antivirus, no hay aislamiento a nivel de fila en PostgreSQL y no hay auditoría de accesos.

### Límites de uso

`RateLimitBucket` implementa una ventana fija atómica con `INSERT ... ON CONFLICT`. Es persistente y compartida entre réplicas; no es un límite en memoria. Las claves de email/IP se guardan hasheadas.

| Acción | Límite por defecto | Alcance |
| --- | --- | --- |
| Carga de PDF | 10/hora | Usuario |
| Documentos | 20 en total | Usuario |
| Embeddings | 10/hora | Usuario |
| Preguntas RAG | 30/hora | Usuario |
| Búsquedas | 60/hora | Usuario |
| Login | 10/15 min por email; 30/15 min por IP | Email/IP |
| Registro | 5/hora por IP; 3/hora por email | IP/email |

La cuota de documentos se verifica dentro de la transacción con `SELECT ... FOR UPDATE` sobre el usuario, para que dos cargas simultáneas no pasen ambas el conteo. Los límites por ventana devuelven `429 RATE_LIMITED` con `Retry-After`; la cuota de documentos devuelve `429 DOCUMENT_QUOTA_EXCEEDED` sin `Retry-After`, porque no se libera sola con el tiempo. OpenRouter `429` se traduce a `RAG_PROVIDER_RATE_LIMITED` y `402` a `RAG_PROVIDER_QUOTA_EXCEEDED`, sin exponer el cuerpo ni la clave del proveedor; el `Retry-After` del proveedor no se reenvía.

### Privacidad y retención actual

- No se guarda el PDF binario; sí el texto extraído, los chunks y los embeddings en PostgreSQL.
- La generación de respuestas envía la pregunta y hasta `RAG_TOP_K` fragmentos recuperados a OpenRouter. La UI de `/ask` y este README lo indican. Revisá las condiciones del proveedor antes de usar documentos privados.
- No hay política de retención automática inventada. Borrar un documento elimina en cascada sus páginas, chunks y embeddings; la fila de `RateLimitBucket` vence según su ventana.
- Los logs de la app no registran contenido de documentos ni preguntas completas. Los errores inesperados se registran sin volcar el body.

### Cómo probar el aislamiento con dos cuentas

1. `npm run dev` y abrí `http://localhost:3000/register`.
2. Creá `cuenta-a@example.test` y `cuenta-b@example.test` con contraseñas distintas.
3. Con A, subí `samples/documento-de-prueba.pdf`, generá fragmentos y embeddings. Copiá el id del documento A.
4. Con B, comprobá que la biblioteca no muestra el documento A, que `/documents/<id-A>` devuelve 404 y que `GET`, `DELETE`, `/chunks`, `/embeddings` y `/api/ask` contra ese id devuelven 404.
5. Con B, subí otro PDF y generá sus embeddings. En `/search`, B solo debe ver sus propios chunks; en `/ask`, las fuentes deben apuntar al documento B.
6. Con A, preguntá sobre su documento: las fuentes deben pertenecer a A. Cerrá sesión y comprobá que `/api/documents` devuelve 401.
7. La suite automatizada equivalente es `npm run test:integration`.

### Comandos de migración y ejecución

```bash
npm install
docker compose up -d
npm run db:generate
npm run db:migrate          # desarrollo
npm run db:deploy           # entorno desplegado
npm run dev
npm run typecheck
npm run lint
npm test
npm run test:integration    # crea/migra una base *_test aislada
```

### Módulos para leer primero

1. `prisma/schema.prisma` y la migración de Sprint 6.
2. `src/lib/dal.ts` y `src/lib/documents/queries.ts`.
3. `src/auth.ts`, `src/lib/auth/password.ts` y `src/lib/auth/credentials.ts`.
4. `src/lib/embeddings/store.ts` (SQL con `userId`).
5. `src/lib/rag/retrieval.ts`, `src/lib/rag/generate.ts` y `src/lib/rag/citations.ts`.
6. `src/lib/rate-limit/limiter.ts` y `src/lib/rate-limit/config.ts`.
7. `tests/integration/access-control.test.ts` y `tests/unit/rag-injection.test.ts`.

## Modelo de datos

```prisma
model User {
  id           String     @id @default(cuid())
  email        String     @unique
  passwordHash String
  documents    Document[]
}

model Document {
  id               String         @id @default(cuid())
  userId           String
  originalFilename String
  mimeType         String
  sizeBytes        Int
  pageCount        Int
  status           DocumentStatus @default(PROCESSED)
  errorMessage     String?
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt
  user             User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  pages            DocumentPage[]

  @@index([createdAt])
  @@index([userId, createdAt])
}

model RateLimitBucket {
  key             String   @id
  count           Int      @default(0)
  windowStartedAt DateTime
  expiresAt       DateTime

  @@index([expiresAt])
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

Todas las rutas de documentos, búsqueda y preguntas requieren una sesión de Auth.js. Sin sesión devuelven `401 UNAUTHENTICATED`. Un documento ajeno o inexistente devuelve `404 DOCUMENT_NOT_FOUND`; no se revela si existe. Los límites por ventana devuelven `429 RATE_LIMITED` con `Retry-After`; la cuota de documentos devuelve `429 DOCUMENT_QUOTA_EXCEEDED` sin ese header.

### `GET|POST /api/auth/[...nextauth]`

Handlers de Auth.js para CSRF, callback de credenciales, sesión y logout. La app no implementa cookies ni tokens propios.

### `DELETE /api/documents/[id]`

Borra el documento del usuario autenticado. La FK en cascada elimina páginas, chunks y embeddings. Un id ajeno o inexistente devuelve el mismo `404`.

### `POST /api/documents`

`multipart/form-data` con el campo `file`. Responde `201` con el resumen del documento.

### `GET /api/documents`

Devuelve `{ "documents": [...] }` del usuario autenticado, ordenados por fecha de creación descendente. No incluye documentos de otras cuentas.

### `GET /api/documents/[id]`

Devuelve el documento del usuario autenticado con `pages` ordenadas por `pageNumber` y sus `chunks` ordenados por `chunkIndex`.

### `POST /api/documents/[id]/chunks`

Genera o regenera los fragmentos del documento del usuario autenticado. No recibe cuerpo; los parámetros salen de `CHUNK_*`. Es idempotente: reemplaza los fragmentos anteriores dentro de una transacción.

### `POST /api/documents/[id]/embeddings`

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

Los resultados se ordenan por distancia ascendente y pertenecen solo al usuario autenticado. No se devuelve el vector. No se aplica un umbral de distancia. Si el usuario no tiene embeddings para el modelo actual, `indexedChunkCount` es `0` y `results` es `[]`; los chunks de otras cuentas nunca se cuentan ni se devuelven.

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

## Sprint 7 — Despliegue y cierre

### Estado real de esta entrega

| Área | Estado |
| --- | --- |
| Configuración de producción (límite 4 MB, embeddings remotos, singleton de Prisma, logs, health) | Implementada y cubierta por tests unitarios. |
| CI | Workflow agregado; se ejecuta en GitHub, no en este entorno. |
| Build de Next.js | No ejecutado localmente por la regla del proyecto; CI lo ejecuta con `npm run build`. |
| Neon, Vercel y OpenRouter | **No se accedió a ninguna cuenta ni se publicó la app.** Los pasos quedan documentados abajo. |
| Embeddings remotos reales | **No se llamó al proveedor.** La integración está validada con `fetch` mockeado. |
| URL de demo | **Pendiente.** No se inventa ninguna URL. |

### Arquitectura de despliegue

```text
Navegador
   │  HTTPS
   ▼
Vercel — Next.js 16 (Node.js runtime)
   ├── Auth.js JWT (cookie HttpOnly)
   ├── Route handlers: /api/documents, /api/search, /api/ask, /api/health
   ├── Extracción PDF.js + chunking (en la Function)
   └── Embeddings: Transformers.js local (dev) u OpenRouter remoto (prod)
          │
          ├── PostgreSQL 17 + pgvector (Neon)
          │     ├── User, Document, DocumentPage, DocumentChunk
          │     ├── ChunkEmbedding vector(384) + modelId/modelRevision
          │     └── RateLimitBucket
          │
          └── OpenRouter
                ├── POST /api/v1/chat/completions  (respuesta)
                └── POST /api/v1/embeddings        (solo si EMBEDDING_PROVIDER=openrouter)
```

La app no guarda el PDF binario: guarda el texto extraído, los chunks y los embeddings. La generación envía a OpenRouter solo la pregunta y los fragmentos recuperados y autorizados.

### Pipeline RAG, de PDF a respuesta con citas

1. **Carga:** `POST /api/documents` recibe `multipart/form-data`; valida tamaño, MIME, firma `%PDF-` y cantidad de páginas en el servidor.
2. **Extracción:** PDF.js obtiene el texto página por página. Un PDF sin texto seleccionable se rechaza; no hay OCR.
3. **Persistencia:** se guardan `Document` y `DocumentPage` en una transacción, con el dueño tomado de la sesión.
4. **Chunking:** cada página se divide en fragmentos con offsets de caracteres, overlap y un `chunkIndex` estable.
5. **Embeddings:** cada chunk se embebe con el proveedor configurado y se guarda en `ChunkEmbedding` junto con `modelId`, `modelRevision` y `dimensions`.
6. **Pregunta:** el servidor verifica la sesión, el límite por usuario y el dueño del documento; embebe la pregunta con **la misma configuración** usada para indexar.
7. **Recuperación:** búsqueda coseno exacta con `<=>` de pgvector, filtrada por `userId`, `documentId`, modelo, revisión y dimensión. Devuelve hasta `RAG_TOP_K` chunks.
8. **Contexto:** se arma un prompt con `RAG_MAX_CONTEXT_CHARS` como presupuesto y fuentes temporales `[S1]`, `[S2]`, ...
9. **Generación:** OpenRouter Chat Completions sin streaming, con timeout y sin reintentos automáticos.
10. **Citas:** el servidor elimina IDs que no correspondan a fuentes recuperadas y arma la metadata desde la base. La UI muestra documento, página, excerpt y si la fuente fue citada.

La búsqueda léxica, la fusión híbrida (RRF) y el reranking están implementados y se comparan en `npm run eval:retrieval`, pero **no están conectados a `/api/ask`**. La respuesta usa recuperación vectorial exacta. Se documenta así para no atribuir al demo una arquitectura que no ejecuta.

### Entornos: Local, Preview y Production

| Variable / recurso | Local | Preview | Production |
| --- | --- | --- | --- |
| Base de datos | Docker Compose, puerto 5434 | Proyecto/branch de Neon separado | Proyecto/branch de Neon de producción |
| `DATABASE_URL` | `postgresql://ida:ida@localhost:5434/ida` | Connection string de Preview | Connection string de Production |
| `DIRECT_URL` | Opcional | Directa de Preview | Directa de Production |
| `AUTH_SECRET` | Generado localmente | Secreto propio de Preview | Secreto propio de Production |
| `EMBEDDING_PROVIDER` | `local` | `openrouter` (recomendado) | `openrouter` |
| `EMBEDDING_MODEL_ID` | `Xenova/multilingual-e5-small` | Modelo remoto de 384 dimensiones | El mismo que Preview |
| Límite de PDF | 10 MB | 4 MB | 4 MB |
| `OPENROUTER_API_KEY` | Tu clave local | Clave de Preview (si corresponde) | Clave de Production |

Reglas:

- Preview y Production **no comparten base ni secretos**. Un deployment de una rama no debe escribir en la base pública.
- Las variables se asignan por entorno en Vercel; un cambio de valor aplica a deployments nuevos, no a los ya construidos.
- Ninguna clave privada lleva prefijo `NEXT_PUBLIC_`. El código no serializa configuración del servidor hacia componentes cliente.
- GitHub Actions usa un PostgreSQL desechable del propio job; no recibe secretos de Production.

### Neon: crear la base y habilitar pgvector

1. Crear un proyecto en Neon (PostgreSQL 17 o la versión compatible disponible).
2. Copiar la connection string **agrupada** (pooled) para `DATABASE_URL` y la **directa** para `DIRECT_URL`, si el proyecto las ofrece.
3. Confirmar que la extensión queda instalada. La migración inicial ya ejecuta `CREATE EXTENSION IF NOT EXISTS vector;`; para verificar:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
SELECT extversion FROM pg_extension WHERE extname = 'vector';
```

4. Aplicar las migraciones con la conexión directa y el comando de producción:

```bash
# Una sola vez por entorno, desde una máquina o un job con las variables del entorno.
DATABASE_URL="<url-directa-o-agrupada>" DIRECT_URL="<url-directa>" npx prisma migrate deploy
```

`prisma migrate deploy` aplica las migraciones pendientes y no genera nuevas. Este proyecto usa Prisma 7.10.1; el comando se mantiene. **No** ejecutes `prisma migrate dev` ni `prisma db push` contra Preview o Production: pueden crear migraciones nuevas, resetear datos o divergir del historial versionado.

No corras migraciones desde cada request ni desde funciones concurrentes. El lugar correcto es un paso único del pipeline, antes del smoke test del deployment.

### Vercel: publicar

1. Importar el repositorio en Vercel y seleccionar el framework Next.js.
2. Usar Node.js 22 (o la versión soportada que coincida con `package.json` y las dependencias nativas).
3. Configurar las variables de la tabla anterior **por entorno**. Preview y Production deben apuntar a bases distintas.
4. Build command: `npm run build`. El script ejecuta `prisma generate` antes de `next build`, porque el cliente generado está ignorado por git y no se versiona.
5. El límite de PDF en Vercel es 4 MB. La app lo aplica en servidor y devuelve `413 FILE_TOO_LARGE` con un mensaje claro; no se cambia en silencio el límite local.
6. Crear el deployment de Preview, aplicar migraciones en la base de Preview, ejecutar los smoke checks y recién después promover a Production.
7. Aplicar migraciones en Production una vez y ejecutar los smoke checks.

No se agregó Vercel Blob ni otro servicio pago: el alcance actual guarda texto, no el PDF binario. Para aceptar PDFs mayores a 4 MB hace falta subir el archivo directamente a object storage (S3, R2, Supabase Storage u otro), con URL firmada, y procesarlo después; eso cambia la arquitectura de upload y queda fuera de este sprint.

### Embeddings: local para desarrollo, remoto para producción

| Aspecto | Local | Remoto (OpenRouter) |
| --- | --- | --- |
| Variable | `EMBEDDING_PROVIDER=local` | `EMBEDDING_PROVIDER=openrouter` |
| Modelo | `Xenova/multilingual-e5-small` (384) | `EMBEDDING_MODEL_ID`, por ejemplo `openai/text-embedding-3-small` |
| Dependencia | ONNX Runtime + Transformers.js en el proceso | `fetch` al endpoint remoto |
| Prefijos E5 | `passage: ` / `query: ` | No se aplican; se envía texto plano |
| Modelo en el bundle | Se carga solo cuando el proveedor es local | El import dinámico no se ejecuta y el modelo no se descarga |
| Costo | CPU/disco local | Tokens de embeddings del proveedor |
| Reproducibilidad | Revisión fijada por commit | Etiqueta `EMBEDDING_MODEL_REVISION` administrada por el operador |

Puntos importantes:

- Documentos y preguntas usan **el mismo** `modelId` y `modelRevision`. Si se cambia el proveedor o el modelo, hay que regenerar los embeddings de todos los chunks.
- La base de Production empieza vacía. No copies embeddings locales: son de otro modelo y el filtro de recuperación los ignoraría, pero además no tendría sentido pagar por vectores incompatibles.
- La columna es `vector(384)`. El proveedor remoto envía `dimensions: 384` y valida la respuesta. Un modelo que no pueda producir 384 dimensiones no sirve sin una migración.
- OpenRouter no garantiza un modelo gratuito permanente. Antes de publicar, consultá el catálogo real:

```bash
curl -s https://openrouter.ai/api/v1/embeddings/models \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" | head
```

- El proveedor remoto no aplica prefijos de instrucción. Elegí un modelo que espere texto plano; si un modelo requiere un prefijo específico, hay que agregarlo de forma explícita y regenerar.
- No hay reintentos automáticos en embeddings ni en generación: un reintento duplica consumo y latencia. El timeout se controla con `OPENROUTER_EMBEDDING_TIMEOUT_MS` y `RAG_PROVIDER_TIMEOUT_MS`.

### Observabilidad

Las rutas de documentos, búsqueda, embeddings y preguntas reciben un `requestId` (se reutiliza `x-request-id` solo si es un token seguro; si no, se genera un UUID) y lo devuelven en el header `x-request-id`. Los logs son una línea JSON por evento:

```json
{"level":"info","event":"ask.completed","timestamp":"...","requestId":"...","route":"POST /api/ask","topK":5,"retrievedCount":5,"embeddingMs":12,"searchMs":4,"generationMs":1800,"promptTokens":900,"completionTokens":80,"totalTokens":980,"costUsd":0.0002,"sourceCount":5,"citedCount":2,"totalMs":1900}
```

Se registran: ruta, método, etapa, resultado, duración, estado HTTP, código de error, tipo de error del proveedor, modelo, `topK`, cantidad de fuentes, tokens y costo si el proveedor los informa.

**No** se registran: pregunta completa, prompt, texto de PDFs, chunks, respuesta completa, cookies, contraseñas, API keys ni connection strings. El logger usa una lista blanca de campos; un campo desconocido se descarta aunque el llamador lo pase.

`GET /api/health` ejecuta `SELECT 1` y devuelve `{ "status": "ok" }` o `503 { "status": "unavailable" }`. No incluye versión, host, error de conexión ni configuración.

### Costos

No se afirma que el despliegue sea gratuito. Los componentes que pueden generar costo son:

- **Chat de OpenRouter:** tokens de entrada (pregunta + contexto) y de salida, según el modelo elegido. El modelo `openrouter/free` no está garantizado ni necesariamente disponible.
- **Embeddings remotos:** tokens de entrada de cada chunk al indexar y de cada pregunta al consultar.
- **Neon:** compute y almacenamiento del proyecto/branch; los planes y cuotas cambian.
- **Vercel:** invocaciones, duración y transferencia de las Functions; los límites del plan cambian.

Para estimar, usá los precios vigentes de cada proveedor y multiplicá por el uso real: `tokens de embedding`, `tokens de prompt`, `tokens de completion`, cantidad de requests y tiempo de Function. Los controles ya implementados son `RAG_TOP_K`, `RAG_MAX_CONTEXT_CHARS`, `MAX_PDF_PAGES`, `MAX_PDF_SIZE_MB`, los límites por usuario y los timeouts. No se agregó monitoreo pago.

### Resultados reales de evaluación (Sprint 5)

Reporte: `eval/reports/reference-report.json`, generado el 2026-11-12 con Node 22.13.1 sobre el fixture ficticio y el gold set de 25 casos (20 respondibles, 5 no respondibles). La latencia es la búsqueda por caso y **excluye** el embedding de la consulta, medido aparte.

| Estrategia | Recall@5 | Precision@5 | MRR | Latencia media |
| --- | --- | --- | --- | --- |
| Vectorial exacta | 1.00 | 0.21 | 0.9667 | 3.18 ms |
| Léxica (`simple` + GIN) | 0.95 | 0.20 | 0.635 | 2.88 ms |
| Híbrida (RRF) | 1.00 | 0.21 | 0.90 | 3.60 ms |
| Híbrida + rerank | — | — | — | Omitida: `missing_model` |

Embedding medio de la consulta: **9.84 ms**. Precisión@5 usa denominador `k`, por eso su valor es bajo aunque el recall sea alto.

Lectura honesta: en este corpus chico y ficticio, la búsqueda vectorial exacta ya recupera el chunk relevante en todos los casos respondibles; la híbrida no la supera y el reranking no se midió. No se inventan métricas de calidad de respuesta: `eval/answer-quality-review.md` es una plantilla manual y **no tiene resultados completados**. Conectar híbrida/rerank a `/api/ask` y revisar respuestas reales queda como trabajo futuro.

### CI/CD

`.github/workflows/ci.yml` se ejecuta en `pull_request` y en `push` a `main`:

1. `npm ci` desde `package-lock.json`.
2. `npm run db:generate`.
3. `npm run lint`.
4. `npm run typecheck`.
5. `npm test` (chunker + Vitest unitario).
6. `npm run build` (incluye `prisma generate`).
7. `npm run test:integration` contra un servicio PostgreSQL 17 + pgvector desechable.

No existe una suite E2E (navegador) en el repositorio, así que no se ejecuta ni se declara. La suite de integración cubre autenticación, aislamiento entre dos cuentas, ownership, cuota, rate limit y cascada. El workflow falla si cualquier paso falla.

Los secretos de Preview/Production se configuran en Vercel, no en GitHub Actions. El workflow no recibe `OPENROUTER_API_KEY` ni credenciales de Neon.

### Checklist manual de despliegue

Marcar solo lo que se comprobó de verdad. En este entorno no se ejecutó ninguno de los pasos que requieren cuentas o un deployment.

- [ ] `npm run lint` y `npm run typecheck` en local.
- [ ] `npm test` en local.
- [ ] `npm run test:integration` con PostgreSQL local.
- [ ] `npm run build` en local o en CI.
- [ ] Deployment de Preview creado.
- [ ] Migraciones aplicadas en la base de Preview (`prisma migrate deploy`).
- [ ] `/api/health` responde `200 { "status": "ok" }` en Preview.
- [ ] Registro y login de dos cuentas.
- [ ] Aislamiento: cada cuenta ve solo sus documentos; un id ajeno devuelve 404.
- [ ] PDF menor al límite: se sube y extrae texto.
- [ ] PDF mayor al límite: se rechaza con `413 FILE_TOO_LARGE`.
- [ ] Chunking y generación de embeddings completan.
- [ ] Pregunta con evidencia: respuesta con al menos una cita válida.
- [ ] Pregunta sin evidencia: `noEvidence: true` y sin llamada innecesaria al proveedor.
- [ ] Error/timeout del proveedor: respuesta segura (`502`/`504`) sin filtrar detalles.
- [ ] Logs del deployment: incluyen `requestId`, etapas y duración; no incluyen pregunta, texto, cookies ni claves.
- [ ] Demo de Production verificado y URL agregada a este README.

### Capturas para el portfolio

No se agregaron imágenes simuladas. Para capturarlas:

1. Usar `samples/documento-de-prueba.pdf` o un documento ficticio.
2. Capturar: biblioteca vacía, formulario de carga, detalle con texto extraído, panel de chunks, panel de embeddings, búsqueda con resultados, pregunta con fuentes citadas y reporte de evaluación.
3. Ocultar emails, ids de cuenta, claves y cualquier dato personal.
4. Guardar en `docs/screenshots/` con nombres descriptivos y enlazarlas en este README cuando existan.

### Cómo mostrarlo en una entrevista

1. **Problema:** responder preguntas sobre documentos propios con evidencia verificable, no con conocimiento general del modelo.
2. **Arquitectura:** Next.js en Vercel, PostgreSQL + pgvector en Neon, Auth.js, OpenRouter, embeddings locales o remotos.
3. **Decisiones:** chunks con offsets y overlap; búsqueda exacta antes que ANN; mismo modelo para indexar y consultar; citas saneadas en servidor; aislamiento por `userId` dentro del SQL; límites persistentes.
4. **Evidencia:** métricas reales del gold set, tests de aislamiento y de prompt injection, y las limitaciones medidas (híbrida no supera a vectorial en este corpus; rerank sin evaluar).
5. **Tradeoffs:** 4 MB por el límite de Vercel; embeddings remotos para evitar ONNX en la Function; `/api/ask` vector-only para no atribuir mejoras no medidas.
6. **Próximos pasos:** OCR, object storage para PDFs grandes, RLS, recuperación de contraseña/MFA, E2E y evaluación manual de calidad de respuesta.

## Seguridad y límites conocidos

- **Autenticación local, no producción:** hay registro/login con Argon2id, sesión JWT y aislamiento, pero faltan recuperación de contraseña, verificación de email, MFA, auditoría, revocación inmediata de sesiones y revisión de despliegue. Un JWT robado sigue siendo válido hasta su expiración (7 días por defecto) porque no hay lista de revocación.
- **Sin Row-Level Security:** el aislamiento depende de la DAL y de cada consulta; RLS sería una defensa adicional, pero no se activó porque el adaptador de conexión no transmite una identidad de usuario a PostgreSQL.
- **Documentos legacy:** los documentos anteriores al Sprint 6 quedaron asignados a `legacy-owner-0000000000000000`, una cuenta sin login. No son accesibles desde la app; reasignarlos requiere una decisión y un `UPDATE` manual.
- **Confianza en headers de proxy:** el rate limit por IP usa `x-forwarded-for`/`x-real-ip`. Solo es confiable detrás de un proxy que sobrescriba esos headers; el límite por email sigue protegiendo una cuenta concreta.
- **`trustHost: true` en Auth.js:** está pensado para desarrollo local y self-hosting directo. Detrás de un reverse proxy, el proxy debe controlar el header `Host`; en producción conviene fijar `AUTH_URL` y revisar esta configuración.
- **Sin OCR:** un PDF escaneado como imagen se rechaza con “No se encontró texto seleccionable en el PDF.”.
- **Límites de archivo y uso:** 10 MB local y 4 MB en Vercel, con 50 páginas por defecto. Los límites por usuario viven en PostgreSQL; la extracción es síncrona y ocurre en el proceso de Next.js.
- **Inferencia en CPU (modo local):** la generación de embeddings puede tardar varios segundos o minutos según la cantidad de chunks y el hardware. La primera ejecución incluye la descarga del modelo. En modo remoto la carga pasa al proveedor.
- **Dependencia de red la primera vez (modo local):** sin conexión a Hugging Face, el modelo no se puede descargar. Después los archivos se reutilizan desde la caché local, pero Transformers.js puede seguir resolviendo metadatos remotos; no se verificó un arranque completamente offline.
- **Embeddings remotos no verificados en vivo:** la integración con OpenRouter está cubierta con `fetch` mockeado, pero no se ejecutó contra la cuenta real. El modelo remoto debe existir, aceptar `dimensions: 384` y estar disponible en el plan contratado.
- **Privacidad del proveedor de embeddings:** con `EMBEDDING_PROVIDER=openrouter`, el texto de cada chunk y cada pregunta se envían a OpenRouter. No uses documentos reales sin revisar las condiciones del proveedor.
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
- **Prompt injection:** el system prompt indica tratar las fuentes como datos y no como instrucciones, pero no es una barrera de seguridad completa. Las defensas reales son la ausencia de herramientas/acciones, la validación de citas, el renderizado como texto y los filtros de ownership fuera del control del modelo. El modelo todavía puede incluir instrucciones maliciosas en el texto de su respuesta.
- **Respuestas no garantizadas:** pedir “no alucines” reduce el riesgo, no lo elimina. La app muestra fuentes y citas para que una persona pueda revisar el origen.
- **Evaluación pequeña y no representativa:** hay 25 casos sobre dos documentos ficticios y un solo modelo de embeddings. Sirve para detectar regresiones y aprender, no para afirmar qué estrategia es mejor en general. La calidad de respuesta se revisa a mano con `eval/answer-quality-review.md`; no hay juez automático.
- **Rate limit de ventana fija:** no es un token bucket ni un sliding window; un atacante puede concentrar solicitudes en el borde de la ventana. El objetivo es frenar abuso casual, no resistir un ataque distribuido. Las filas vencidas se limpian manualmente.
- **Sin progreso en tiempo real:** la UI muestra “Generando respuesta…” mientras espera; no hay porcentaje ni streaming.
- **Regeneración concurrente:** dos pedidos simultáneos sobre el mismo documento pueden competir. El `ON CONFLICT` y la transacción protegen la integridad, pero el resultado de cada pedido puede ser distinto. No es un escenario esperado en esta versión local.
- **Regenerar chunks borra embeddings:** la cascada elimina los vectores de los chunks reemplazados. Hay que volver a generarlos.
- **Prisma Studio:** no puede leer la tabla `ChunkEmbedding` por el tipo `vector`.
- **Proveedores no verificados en red real en este sprint:** el cliente de reranking se validó con `fetch` mockeado y no se ejecutó una llamada real porque no hay `RERANK_MODEL` configurado. La generación del Sprint 4 no se volvió a probar con una llamada real en este sprint. No se afirma que una llamada de red haya funcionado.
- **Build de producción:** esta entrega se validó con `tsc`, ESLint, tests y los comandos de evaluación. No se ejecutó `npm run build` (regla del proyecto). Si se despliega, revisar el empaquetado de `@huggingface/transformers`, `onnxruntime-node`, `sharp`, `zod` y `tsx` (este último es solo para scripts).

## Cómo probar manualmente

1. Copiá `.env.example` a `.env`, generá `AUTH_SECRET` con `openssl rand -base64 32`, levantá PostgreSQL y aplicá las migraciones.
2. Abrí `http://localhost:3000/register`, creá una cuenta A y una cuenta B con emails distintos.
3. Con A, subí `samples/documento-de-prueba.pdf`; con B, subí otro PDF. Cada biblioteca debe mostrar solo su documento.
4. Copiá el id del documento A y, desde la sesión B, probá `/documents/<id-A>`, `GET`, `DELETE`, `/chunks`, `/embeddings` y `/api/ask` con ese id. Todo debe responder 404 sin revelar si existe.
5. Usa `samples/documento-de-prueba.pdf` o sube un PDF con texto seleccionable.
6. Abre el documento y pulsa **Generar fragmentos** si todavía no tiene.
7. Pulsa **Generar embeddings**. La primera vez puede descargar el modelo; revisa la terminal y `.cache/transformers/`.
8. Verifica que el panel muestre “2 de 2 fragmentos con embeddings” (o el total del documento).
9. Pulsa **Regenerar todos** y confirma que la cantidad de filas no cambia.
10. Ve a **Buscar** y prueba:
   - “¿Cuál es el período de garantía del producto?” → debe recuperar la página 1.
   - “¿Qué hace el asistente con el texto?” → debe recuperar la página 2.
11. Confirma que cada resultado muestra documento, página, distancia y similitud, y que una cuenta nunca ve chunks de la otra.
12. Configura `OPENROUTER_API_KEY` y `OPENROUTER_MODEL` en `.env` y reinicia el servidor. Sin esas variables, comprueba que `/api/ask` responde `503` después de recuperar fragmentos.
13. Ve a **Preguntar**, elige el documento y pregunta algo cuya respuesta esté claramente en una página. Confirma que la respuesta cita `[S1]` (o el ID correspondiente) y que la fuente muestra la página correcta.
14. Pregunta algo que no esté en el documento. El modelo debe decir que no encontró evidencia suficiente; si responde de todos modos, revisa las fuentes y no lo tomes como una respuesta respaldada.
15. Abre el detalle de fuentes y confirma que aparecen todos los fragmentos enviados al modelo, incluso los que no fueron citados, con documento, página, excerpt y distancia.
16. Fuerza un error del proveedor (por ejemplo, una API key inválida o un modelo inexistente) y comprueba que la UI muestra un mensaje entendible, sin claves, prompts ni respuestas crudas.
17. Abre las herramientas del navegador y busca `OPENROUTER_API_KEY` en el bundle, Network y Local Storage: no debe aparecer.
18. Prueba una pregunta vacía y una de más de `RAG_QUESTION_MAX_CHARS`: la API debe responder `400`.
19. Prueba `RAG_TOP_K` en `0` o `21`: se usa el valor por defecto con una advertencia, no se rompe la app.
20. Cambia `EMBEDDING_MODEL_ID` o `EMBEDDING_MODEL_REVISION` en `.env`, reinicia el servidor y pregunta: el documento debe quedar sin embeddings compatibles y la API debe devolver `noEvidence: true` sin llamar a OpenRouter.
21. Si regeneras los chunks de un documento, vuelve a generar sus embeddings antes de preguntar.
22. Ejecuta `npm run eval:seed` y confirma que inserta 2 documentos y 21 chunks con embeddings. El comando es idempotente: repetirlo no duplica filas.
23. Ejecuta `npm run eval:retrieval`. Debe imprimir las estrategias `vector`, `lexical`, `hybrid` y `hybrid-rerank` (esta última como `skipped` si no configuraste un modelo) y escribir un JSON en `eval/reports/`.
24. Abre el reporte y verifica que incluya fecha, modelo/revisión/dimensión, `topK`, candidatos, RRF `k`, hashes del fixture y del gold set, y los rangos de cada chunk relevante. No confíes en el resumen sin mirar los casos.
25. Prueba `npm run eval:retrieval -- --top-k 1`: Recall@1 y MRR deben cambiar respecto de `k = 5`; si un relevante estaba en la posición 2, deja de aparecer en Recall@1.
26. Compara las listas de `vector` y `hybrid` para un caso con código exacto, por ejemplo `q-09` (`ESC-104`) o `q-19` (`FLT-450-A`). La búsqueda léxica debería priorizar la coincidencia literal; la vectorial puede fallar en códigos poco frecuentes.
27. Si configuras `RERANK_MODEL` (y una clave), ejecuta una vez sin `--no-rerank` y otra con `--no-rerank`; compara el orden de los candidatos y el MRR. Usa solo el fixture ficticio: el reranker envía la pregunta y los chunk candidatos a OpenRouter.
28. Revisa al menos una respuesta con `eval/answer-quality-review.md`: comprueba que cada cita `[S#]` apunte a una fuente recuperada y que el excerpt sostenga la afirmación. No cambies el prompt durante la revisión.
29. Si editas el fixture o el gold set, vuelve a ejecutar `npm run eval:seed` antes de `npm run eval:retrieval`; los embeddings guardados no se recalculan solos.

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

Comprobado en este entorno (Node 22.13.1). El Sprint 7 **no** se desplegó ni accedió a cuentas externas.

- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run test:chunking` ✅ (12 tests)
- `npm run test:unit` ✅ (231 tests en 28 archivos; agrega límite de producción, proveedor remoto de embeddings, logger y health a la suite existente)
- `npm run test:integration` ❌ no ejecutado en este sprint: requiere PostgreSQL local con pgvector y migraciones aplicadas. El workflow de CI lo ejecuta contra un servicio desechable.
- `npm run build` ❌ no ejecutado localmente por la regla del proyecto. El workflow de CI ejecuta `npm run build`, que incluye `prisma generate`.
- `npx prisma migrate status` ❌ no ejecutado en este sprint; no se modificó el esquema ni se agregaron migraciones.
- Deployment Preview/Production ❌ no creado.
- Migraciones en Neon ❌ no ejecutadas.
- Embeddings remotos reales ❌ no llamados: la integración está validada con `fetch` mockeado (request, dimensiones, orden por índice, 429/402, timeout, JSON inválido, prefijos ausentes).
- `/api/health` ✅ cubierto con la ruta simulada: `200 { "status": "ok" }` y `503 { "status": "unavailable" }` sin filtrar el error de conexión.
- Logger ✅ cubierto: conserva campos permitidos y descarta pregunta, prompt, texto, cookies, contraseña, API key y respuesta.
- Los resultados de evaluación citados en [Resultados reales](#resultados-reales-de-evaluación-sprint-5) provienen del reporte histórico `eval/reports/reference-report.json`; no se regeneraron en este sprint.
- No se hizo push, PR ni merge; los cambios quedan como commits de trabajo en la rama `feat/sprint-7-deployment`.

## Después de este sprint

El plan de 7 sprints está cerrado. Para convertir este repositorio en un demo público verificado faltan, en orden:

- crear el proyecto de Neon, habilitar pgvector y aplicar `prisma migrate deploy` en Preview y Production;
- importar el repo en Vercel, cargar variables por entorno y completar la checklist manual de [Despliegue](#checklist-manual-de-despliegue);
- ejecutar una prueba real de embeddings remotos con el modelo elegido y confirmar que acepta 384 dimensiones;
- capturar las pantallas y agregar la URL del demo recién cuando esté verificada;
- decidir si se conecta híbrida/rerank a `/api/ask` con una medición previa, en lugar de asumir que mejora;
- agregar recuperación de contraseña, verificación de email, MFA y revocación de sesiones;
- evaluar RLS con una identidad de usuario transmitida a PostgreSQL;
- definir retención, borrado de cuenta, auditoría y respaldo/restauración;
- revisar headers de proxy y `x-forwarded-for` en el despliegue real;
- agregar OCR para PDFs escaneados y object storage si se quieren aceptar archivos mayores a 4 MB;
- agregar antivirus o análisis de archivos si el producto lo requiere;
- agregar una suite E2E de navegador (hoy no existe).

## Orden sugerido para revisar el código

1. `prisma/schema.prisma` y `prisma/migrations/20261113113000_add_users_ownership_and_rate_limits/migration.sql` — User, ownership, backfill legacy, cascada y rate limits.
2. `src/auth.ts` y `src/lib/auth/password.ts` — Auth.js, JWT cookie y Argon2id.
3. `src/lib/auth/input.ts`, `credentials.ts`, `registration.ts` y `users.ts` — normalización, comparación, registro y rate limit de login.
4. `src/lib/dal.ts` — única fuente de identidad y helpers para páginas/API.
5. `src/lib/documents/queries.ts` — consultas acotadas por `userId`, borrado y detalle.
6. `src/lib/documents/create-document.ts` — cuota con lock por usuario.
7. `src/lib/embeddings/store.ts` — SQL vectorial con `d."userId"` y búsquedas acotadas.
8. `src/lib/embeddings/config.ts`, `create-provider.ts`, `openrouter-embeddings.ts` y `provider.ts` — selección local/remota, dimensiones, timeouts y singleton.
9. `src/lib/retrieval/lexical.ts` y `hybrid.ts` — filtro de dueño en SQL léxico y paso a vector (solo evaluación).
10. `src/lib/rag/retrieval.ts`, `generate.ts`, `citations.ts` y `prompt.ts` — recuperación autorizada, citas y separación de instrucciones.
11. `src/lib/rate-limit/limiter.ts`, `config.ts` y `keys.ts` — fixed window atómico y claves opacas.
12. `src/lib/config.ts` y `src/lib/db.ts` — límite 4 MB en Vercel, pool acotado y singleton de Prisma.
13. `src/lib/observability/log.ts`, `src/lib/http.ts` y `src/app/api/health/route.ts` — campos permitidos, `requestId` y health.
14. `src/app/api/documents/route.ts`, `[id]/route.ts`, `search/route.ts` y `ask/route.ts` — protección de endpoints y logs por etapa.
15. `.github/workflows/ci.yml` — lint, tipos, tests, build e integración.
16. `tests/integration/access-control.test.ts` — aislamiento con dos cuentas contra PostgreSQL real.
17. `tests/unit/rag-injection.test.ts`, `auth-password.test.ts`, `upload-limits.test.ts`, `embeddings-openrouter.test.ts`, `observability-log.test.ts` y `health-route.test.ts` — seguridad, proveedor remoto y observabilidad.
18. La sección [Sprint 7](#sprint-7--despliegue-y-cierre) de este README — entornos, migraciones, límites, costos y checklist.
