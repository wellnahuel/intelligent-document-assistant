# Intelligent Document Assistant

Aplicación web multiusuario para subir PDFs, extraer su texto página por página, dividirlo en fragmentos trazables, generar **embeddings**, recuperar los fragmentos más cercanos con **pgvector** y responder preguntas con un modelo de **OpenRouter** y **citas verificadas** a las páginas del documento.

El recorrido completo es **autenticar → aislar → indexar → recuperar → generar**. Cada cuenta tiene su propia biblioteca: las páginas, los chunks y los embeddings heredan el dueño del documento, y las consultas vectoriales filtran por `userId` dentro del SQL. La pregunta se convierte en un vector con el mismo proveedor y modelo usados para indexar; solo los chunks autorizados del documento elegido se envían como contexto; el servidor valida las citas antes de mostrarlas. La respuesta es de un solo turno: no hay historial de conversación, herramientas ni agentes.

> **Estado del demo.** El repositorio está preparado para desplegar en **Vercel + Neon**, con límite de PDF de 4 MB en producción, proveedor de embeddings configurable y CI. El demo público **todavía no fue publicado ni verificado desde este entorno**: no hay ninguna URL inventada en este README. Los pasos de cuenta y la checklist manual están en [`docs/deployment.md`](docs/deployment.md). Los fixtures de evaluación son ficticios: si activás el reranking, la pregunta y los fragmentos candidatos salen hacia un proveedor externo.

## Qué incluye

- Carga de PDF por selector o arrastre, con validación en servidor de tamaño, MIME, firma `%PDF-` y cantidad de páginas.
- Extracción de texto página por página con PDF.js. Un PDF sin texto seleccionable se rechaza: no hay OCR.
- Chunking con overlap, offsets de caracteres e índice estable; regeneración idempotente y transaccional.
- Autenticación con **Auth.js v5** (Credentials provider), contraseñas **Argon2id** y sesión JWT en cookie HttpOnly.
- Aislamiento por cuenta en la DAL y en cada consulta: páginas, chunks y embeddings heredan el dueño, sin IDOR y con `404` uniforme para documentos ajenos e inexistentes.
- Embeddings con proveedor **local** (Transformers.js, `Xenova/multilingual-e5-small`, 384 dimensiones) o **remoto** (OpenRouter), configurables por entorno.
- Búsqueda vectorial exacta con `<=>` de pgvector, búsqueda léxica con `tsvector` e índice GIN, y fusión híbrida con Reciprocal Rank Fusion. El reranking es opcional.
- Pantalla `/search` para diagnóstico de recuperación y pantalla `/ask` para preguntas con respuesta y fuentes expandibles.
- Citas temporales `[S1]`, `[S2]`, ... que el servidor mapea a chunks reales; los IDs inventados se eliminan y nunca crean fuentes.
- Límites de uso persistentes en PostgreSQL por usuario, email e IP; respuestas `429` con `Retry-After` y mapeo seguro de `429`/`402` del proveedor.
- Logs JSON con `requestId` y `GET /api/health`, sin preguntas, texto de documentos, cookies ni claves.
- Evaluación de recuperación con un gold set de 25 casos sobre fixtures ficticios y un reporte JSON reproducible.
- CI en GitHub Actions: lint, tipos, tests unitarios, build e integración contra PostgreSQL con pgvector.

## Qué no incluye (a propósito)

- Streaming de la respuesta y historial de conversación.
- Herramientas ejecutables o agentes: la salida del modelo nunca modifica datos, permisos ni consultas.
- Recuperación de contraseña, verificación de email, MFA u OAuth.
- Row-Level Security de PostgreSQL: el aislamiento se aplica en la DAL y en cada consulta.
- OCR, antivirus ni almacenamiento del PDF original.
- Conectar la búsqueda híbrida o el reranking al flujo de `/ask`; hoy se comparan en la evaluación.
- Un demo público verificado.

## Stack

| Parte | Tecnología |
| --- | --- |
| Framework | Next.js 16 (App Router) + React 19 |
| Lenguaje | TypeScript en modo `strict` |
| Estilos | CSS Modules, sin Tailwind |
| Base de datos | PostgreSQL 17 con pgvector, vía Docker |
| ORM | Prisma 7 + `@prisma/adapter-pg` |
| Autenticación | Auth.js v5 (beta compatible con Next 16) + Credentials provider |
| Hash de contraseñas | `@node-rs/argon2` (Argon2id, parámetros OWASP) |
| Sesión | JWT firmado y cifrado por Auth.js en cookie HttpOnly |
| Límites de uso | Ventana fija persistente en PostgreSQL (`RateLimitBucket`) |
| Extracción | PDF.js (`pdfjs-dist` 6) |
| Chunking | Módulo TypeScript puro, sin dependencias de IA |
| Embeddings | `@huggingface/transformers` 4 + ONNX Runtime local, u OpenRouter `/api/v1/embeddings` |
| Modelo de embeddings | Local: `Xenova/multilingual-e5-small` (384). Remoto: modelo de 384 dimensiones de OpenRouter |
| Generación | OpenRouter Chat Completions vía `fetch`, sin streaming |
| Búsqueda | Vectorial exacta (`<=>`), léxica (`tsvector`/`tsquery`, `simple`) y RRF |
| Reranking | OpenRouter `/api/v1/rerank` opcional, vía `fetch` |
| Validación | Zod |
| Tests | `node:test` para el chunker + Vitest unitario e integración contra PostgreSQL |
| Despliegue | Vercel + Neon, documentado en [`docs/deployment.md`](docs/deployment.md) |
| CI | GitHub Actions con PostgreSQL 17 + pgvector |
| Observabilidad | Logs JSON estructurados + `GET /api/health` |

## Requisitos

- **Node.js 22.13 o superior** (probado con 22.13.1). `pdfjs-dist` 6 y Transformers.js lo requieren.
- **npm 10 o superior**.
- **Docker** con Docker Compose.
- Puertos **3000** (Next.js) y **5434** (PostgreSQL) libres.
- La primera ejecución del modelo local descarga unos **470 MB** en `.cache/transformers/`; necesita conexión a Internet. Después se reutiliza la caché, aunque Transformers.js puede seguir consultando metadatos remotos.
- Una cuenta de OpenRouter con API key y un ID de modelo compatible con Chat Completions para generar respuestas. La clave se usa solo en el servidor.
- Para desplegar: Vercel, un proyecto de Neon con pgvector y OpenRouter. Ver [`docs/deployment.md`](docs/deployment.md).

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

# 5. Migraciones (incluye pgvector y el índice GIN)
npm run db:migrate

# 6. Fixture de evaluación ficticio (opcional; requiere el modelo local)
npm run eval:seed
npm run eval:retrieval

# 7. Servidor de desarrollo
npm run dev
```

Abre <http://localhost:3000>, crea una cuenta en `/register` y sube un PDF con texto seleccionable, genera los fragmentos y después los embeddings. Cada cuenta ve solo sus propios documentos. La primera generación de embeddings descarga el modelo y puede tardar varios minutos.

Para detener PostgreSQL sin borrar datos: `docker compose down`. Para empezar de cero: `docker compose down -v`, `docker compose up -d` y `npm run db:migrate`. La caché del modelo se puede borrar con `rm -rf .cache/transformers` sin afectar la base.

## Variables de entorno

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `DATABASE_URL` | Sí | Conexión de runtime a PostgreSQL. En Neon puede ser el endpoint agrupado. |
| `AUTH_SECRET` | Sí | Firma y cifra la cookie de sesión. Generarlo con `openssl rand -base64 32`. Nunca usar el prefijo `NEXT_PUBLIC_`. |
| `OPENROUTER_API_KEY` | Para generar respuestas | Clave del servidor. También se usa en modo de embeddings remoto. |
| `OPENROUTER_MODEL` | Para generar respuestas | ID de modelo de OpenRouter con soporte de Chat Completions. No hay un modelo gratuito garantizado. |
| `EMBEDDING_PROVIDER` | No | `local` (por defecto) usa Transformers.js; `openrouter` usa el endpoint remoto de embeddings. |
| `EMBEDDING_MODEL_ID` | Según el proveedor | Modelo local o ID remoto. En modo remoto es obligatorio y debe producir 384 dimensiones. |

El resto de las variables —límites por usuario, chunking, búsqueda, RAG, evaluación y reranking— está documentado con sus valores por defecto en [`.env.example`](.env.example). Un valor inválido genera una advertencia y se usa el default.

Notas:

- La dimensión **no** es configurable: la columna SQL es `vector(384)` y ambos proveedores validan exactamente 384 números finitos.
- Cambiar de proveedor, modelo o revisión **no** requiere migración, pero sí regenerar los embeddings: el filtro usa `modelId` + `modelRevision` y los vectores viejos quedan ignorados hasta regenerarlos.
- `DIRECT_URL` es opcional y solo la lee el CLI de Prisma para migraciones o introspección; el runtime siempre usa `DATABASE_URL`.
- Local, Preview y Production deben usar **bases y secretos distintos**.
- `OPENROUTER_API_KEY` y `OPENROUTER_MODEL` se leen solo en el servidor. Si faltan, `/api/ask` responde `503` después de recuperar los fragmentos; el camino sin evidencia sigue funcionando sin llamar al proveedor.
- El reranking se desactiva con `RERANK_MODEL` vacío. Activarlo envía la pregunta y los fragmentos candidatos a OpenRouter.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` | Genera el cliente de Prisma y compila para producción. |
| `npm run start` | Servidor de producción (requiere `build`). |
| `npm run lint` | ESLint con la configuración de Next.js. |
| `npm run typecheck` | `tsc --noEmit` con TypeScript estricto. |
| `npm test` | Ejecuta los tests del chunker y los unitarios. |
| `npm run test:chunking` | Tests del chunker con el runner nativo de Node. |
| `npm run test:unit` | Tests unitarios con Vitest. |
| `npm run test:unit:watch` | Vitest en modo watch. |
| `npm run test:integration` | Crea/migra una base `*_test` aislada y ejecuta las pruebas de aislamiento contra PostgreSQL real. |
| `npm run db:generate` | Genera el cliente de Prisma en `src/generated/prisma`. |
| `npm run db:migrate` | Aplica migraciones en desarrollo. |
| `npm run db:deploy` | Aplica migraciones en un entorno desplegado. |
| `npm run db:studio` | Abre Prisma Studio. |
| `npm run sample:pdf` | Regenera el PDF de prueba en `samples/`. |
| `npm run eval:seed` | Inserta o reemplaza el fixture ficticio y genera sus embeddings locales. Es idempotente. |
| `npm run eval:retrieval` | Ejecuta los 25 casos de evaluación sin llamar a un LLM y escribe un reporte JSON en `eval/reports/`. Acepta `-- --top-k`, `--candidates`, `--rrf-k`, `--no-rerank` y `--out`. |

## Arquitectura y pipeline

```text
Navegador
   │  HTTP/HTTPS, Server Components y Route Handlers
   ▼
Next.js 16  ──► PostgreSQL 17 + pgvector (datos, chunks, embeddings, sesiones, límites)
   └─────────► OpenRouter (chat; embeddings remotos solo si se configuran)
```

1. **Carga:** `POST /api/documents` recibe `multipart/form-data` y valida tamaño, MIME, firma `%PDF-` y cantidad de páginas.
2. **Extracción:** PDF.js obtiene el texto página por página. Un PDF sin texto seleccionable se rechaza.
3. **Persistencia:** `Document` y `DocumentPage` se guardan en una transacción, con el dueño tomado de la sesión.
4. **Chunking:** cada página se divide en fragmentos con offsets, overlap y un `chunkIndex` estable.
5. **Embeddings:** cada chunk se embebe y se guarda en `ChunkEmbedding` con `modelId`, `modelRevision` y `dimensions`.
6. **Pregunta:** el servidor verifica sesión, límite y dueño del documento; embebe la pregunta con la misma configuración usada para indexar.
7. **Recuperación:** búsqueda coseno exacta con `<=>` filtrada por `userId`, `documentId`, modelo, revisión y dimensión.
8. **Contexto:** el prompt usa `RAG_MAX_CONTEXT_CHARS` como presupuesto y fuentes temporales `[S1]`, `[S2]`, ...
9. **Generación:** OpenRouter Chat Completions sin streaming, con timeout y sin reintentos automáticos.
10. **Citas:** el servidor elimina los IDs que no correspondan a fuentes recuperadas y arma la metadata desde la base.

La búsqueda léxica, la fusión híbrida y el reranking están implementados y se comparan en `npm run eval:retrieval`, pero **no están conectados a `/api/ask`**: la respuesta usa recuperación vectorial exacta. El filtro de `userId` vive dentro del SQL vectorial y léxico; un documento ajeno y uno inexistente producen la misma respuesta.

Estructura del proyecto:

```text
prisma/            esquema y migraciones
src/app/           páginas y rutas de API
src/components/    UI por dominio (auth, documents, search, ask)
src/lib/           auth, documents, pdf, chunking, embeddings, retrieval, rag, rate-limit
tests/             unitarios e integración contra PostgreSQL
eval/              gold set, fixture ficticio y reportes
scripts/           CLI de evaluación y utilidades
docs/              guías de estudio y documentación operativa
```

## API

Todas las rutas de documentos, búsqueda y preguntas requieren una sesión de Auth.js. Sin sesión devuelven `401 UNAUTHENTICATED`. Un documento ajeno o inexistente devuelve `404 DOCUMENT_NOT_FOUND`; no se revela si existe. Los límites por ventana devuelven `429 RATE_LIMITED` con `Retry-After`; la cuota de documentos devuelve `429 DOCUMENT_QUOTA_EXCEEDED` sin ese header.

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET`, `POST` | `/api/auth/[...nextauth]` | Handlers de Auth.js: CSRF, callback de credenciales, sesión y logout. |
| `POST` | `/api/documents` | Carga un PDF (`multipart/form-data`, campo `file`). Responde `201`. |
| `GET` | `/api/documents` | Lista los documentos de la cuenta. |
| `GET`, `DELETE` | `/api/documents/[id]` | Detalle con páginas y chunks; borrado con cascada. |
| `POST` | `/api/documents/[id]/chunks` | Genera o regenera fragmentos. Idempotente. |
| `POST` | `/api/documents/[id]/embeddings` | Genera embeddings; `{ "regenerate": true }` fuerza la regeneración. |
| `POST` | `/api/search` | Búsqueda vectorial exacta: `{ "query": "...", "topK": 5 }`. |
| `POST` | `/api/ask` | Pregunta sobre un documento: `{ "documentId": "...", "question": "..." }`. |
| `GET` | `/api/health` | `{ "status": "ok" }` o `503 { "status": "unavailable" }`. |

Las respuestas de error tienen siempre la misma forma:

```json
{
  "error": {
    "code": "INVALID_SEARCH_QUERY",
    "message": "Escribí una pregunta para buscar."
  }
}
```

Payloads completos, ejemplos de request/response y el catálogo de códigos: [`docs/api.md`](docs/api.md).

## Modelo de datos

```text
User
└── Document (userId, FK onDelete: Cascade)
    └── DocumentPage (cascade)
        └── DocumentChunk (cascade)
            └── ChunkEmbedding (cascade)

RateLimitBucket (ventana fija por clave)
```

Prisma 7 no trata `vector` como un escalar normal: el campo aparece como `Unsupported("vector(384)")` y las inserciones y búsquedas vectoriales usan `$executeRaw`/`$queryRaw` con `Prisma.sql` y parámetros. El resto de las relaciones y conteos usa Prisma. Regenerar los chunks de un documento elimina en cascada sus embeddings y obliga a generarlos de nuevo. Esquema completo: [`prisma/schema.prisma`](prisma/schema.prisma).

## Decisiones de diseño

- **Embeddings locales por defecto:** el modelo corre en el proceso de Node.js y el texto no sale a un proveedor externo. La contracara es la descarga inicial y el consumo de CPU.
- **Identificador, revisión y dimensión por fila:** la revisión por defecto es un commit fijo de Hugging Face, no `main`, para que los vectores sean reproducibles. La búsqueda filtra por los tres metadatos y los vectores de otro modelo no se mezclan.
- **Prefijos E5, mean pooling y normalización L2:** `passage: ` y `query: ` son parte del formato de entrada del modelo; el pooling promedia tokens y la normalización deja vectores de norma 1.
- **Búsqueda exacta antes que ANN:** el corpus es chico; `ORDER BY embedding <=> $1` es fácil de inspeccionar. HNSW o IVFFlat serían una optimización prematura sin mediciones.
- **SQL parametrizado:** el vector se envía como texto y se castea con `::vector`; pregunta, modelo, revisión, dimensión y `topK` son parámetros. No se usa `$queryRawUnsafe`.
- **Idempotencia en dos capas:** se omiten los chunks que ya tienen una fila compatible y el `INSERT` usa `ON CONFLICT ... DO UPDATE`, así una repetición o una carrera actualiza en lugar de duplicar.
- **Fallos parciales explícitos:** cada lote es una unidad; si falla la inferencia o la escritura, se informa `partial` o `failed` con el lote y la etapa. Nunca se muestra “completado” si hubo fallos.
- **Citas saneadas en servidor:** el modelo recibe `[S#]`, pero el mapeo a chunks reales lo arma el servidor desde la base. Una cita inventada como `[S9]` no puede crear una página, un documento ni un fragmento nuevo.
- **Sin evidencia sin proveedor:** si no hay embeddings compatibles o el presupuesto de contexto no alcanza, se devuelve `noEvidence` sin cargar el modelo ni llamar a OpenRouter. No se inventa un umbral de similitud.
- **RRF sobre posiciones:** la distancia coseno y `ts_rank_cd` no comparten escala; sumarlos exigiría una normalización arbitraria. RRF usa `1 / (k + rank)` y conserva el ranking de cada fuente.
- **Límites persistentes:** `RateLimitBucket` implementa una ventana fija atómica con `INSERT ... ON CONFLICT`, compartida entre réplicas. La cuota de documentos se verifica con `SELECT ... FOR UPDATE` dentro de la transacción.
- **Sin logs de contenido:** el logger usa una lista blanca de campos y descarta pregunta, prompt, texto de documentos, cookies, contraseñas y claves.

## Resultados de referencia

Reporte real: [`eval/reports/reference-report.json`](eval/reports/reference-report.json), generado el 2026-11-12 con Node 22.13.1 sobre el fixture ficticio y el gold set de 25 casos (20 respondibles, 5 no respondibles). La latencia es la búsqueda por caso y **excluye** el embedding de la consulta, medido aparte (9.84 ms de media).

| Estrategia | Recall@5 | Precision@5 | MRR | Latencia media |
| --- | --- | --- | --- | --- |
| Vectorial exacta | 1.00 | 0.21 | 0.9667 | 3.18 ms |
| Léxica (`simple` + GIN) | 0.95 | 0.20 | 0.635 | 2.88 ms |
| Híbrida (RRF) | 1.00 | 0.21 | 0.90 | 3.60 ms |
| Híbrida + rerank | — | — | — | Omitida: `missing_model` |

Precision@5 usa denominador `k`, por eso su valor es bajo aunque el recall sea alto. Lectura honesta: en este corpus chico y ficticio la búsqueda vectorial exacta ya recupera el chunk relevante en todos los casos respondibles; la híbrida no la supera y el reranking no se midió. No se inventan métricas de calidad de respuesta: [`eval/answer-quality-review.md`](eval/answer-quality-review.md) es una plantilla manual sin resultados completados.

## Seguridad y límites conocidos

- **Autenticación local, no producción:** hay registro/login con Argon2id, sesión JWT y aislamiento, pero faltan recuperación de contraseña, verificación de email, MFA, auditoría y revocación inmediata de sesiones. Un JWT robado sigue siendo válido hasta su expiración (7 días por defecto).
- **Sin Row-Level Security:** el aislamiento depende de la DAL y de cada consulta; RLS sería una defensa adicional y no se activó porque el adaptador no transmite una identidad de usuario a PostgreSQL.
- **Documentos legacy:** los anteriores a la incorporación de usuarios quedaron asignados a `legacy-owner-0000000000000000`, una cuenta sin login. Reasignarlos requiere una decisión y un `UPDATE` manual.
- **Confianza en headers de proxy:** el rate limit por IP usa `x-forwarded-for`/`x-real-ip`; solo es confiable detrás de un proxy que sobrescriba esos headers. El límite por email sigue protegiendo una cuenta concreta.
- **Sin OCR:** un PDF escaneado como imagen se rechaza con “No se encontró texto seleccionable en el PDF.”.
- **Límites de archivo y uso:** 10 MB local y 4 MB en Vercel, con 50 páginas por defecto. La extracción es síncrona y ocurre en el proceso de Next.js.
- **El documento sale del servidor:** la generación envía la pregunta y los fragmentos recuperados a OpenRouter. En modo de embeddings remoto, los chunks también se envían. No uses documentos confidenciales sin revisar las condiciones del proveedor.
- **Prompt injection:** el system prompt trata las fuentes como datos, pero no es una frontera de seguridad. Las defensas reales son la ausencia de herramientas, la validación de citas, el renderizado como texto y los filtros de ownership fuera del control del modelo.
- **Evaluación pequeña y no representativa:** 25 casos sobre dos documentos ficticios y un solo modelo de embeddings; sirve para detectar regresiones, no para declarar un ganador universal.
- **Sin ANN:** la búsqueda exacta es O(n) sobre las filas compatibles. Con un corpus grande habrá que medir HNSW/IVFFlat.
- **Sin umbral de distancia:** la búsqueda siempre devuelve hasta `topK` resultados, incluso si son poco relevantes.
- **Rate limit de ventana fija:** no es token bucket ni sliding window; un atacante puede concentrar solicitudes en el borde de la ventana. Las filas vencidas se limpian a mano.
- **Regenerar chunks borra embeddings:** la cascada elimina los vectores de los chunks reemplazados; hay que volver a generarlos.
- **Prisma Studio:** no puede leer la tabla `ChunkEmbedding` por el tipo `vector`; para inspeccionarla se usa `psql`.
- **Proveedores remotos verificados solo con mocks:** la integración con OpenRouter está cubierta con `fetch` mockeado. No se ejecutó una llamada real de embeddings ni de reranking; el modelo remoto debe existir, aceptar `dimensions: 384` y estar disponible en el plan contratado.

## Documentación

- [`docs/deployment.md`](docs/deployment.md) — entornos, Neon, Vercel, migraciones, embeddings, observabilidad, costos, CI y checklist manual.
- [`docs/api.md`](docs/api.md) — payloads, ejemplos y catálogo de errores.
- [`docs/testing.md`](docs/testing.md) — prueba manual completa, aislamiento con dos cuentas, consultas SQL y registro de verificación.
- `docs/sprint-*-como-funciona.{html,pdf}` — guías de estudio del proyecto.
- [`eval/answer-quality-review.md`](eval/answer-quality-review.md) — plantilla manual para revisar exactitud, fidelidad, citas y abstención.
