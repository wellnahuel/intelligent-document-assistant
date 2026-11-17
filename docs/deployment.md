# Despliegue

Runbook para publicar la aplicación en **Vercel + Neon + OpenRouter**. Nada de esto se ejecutó desde el entorno de desarrollo: no hay demo publicado ni URL verificada.

## Arquitectura de despliegue

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

## Entornos: Local, Preview y Production

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

## Neon: crear la base y habilitar pgvector

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

## Vercel: publicar

1. Importar el repositorio en Vercel y seleccionar el framework Next.js.
2. Usar Node.js 22 (o la versión soportada que coincida con `package.json` y las dependencias nativas).
3. Configurar las variables de la tabla anterior **por entorno**. Preview y Production deben apuntar a bases distintas.
4. Build command: `npm run build`. El script ejecuta `prisma generate` antes de `next build`, porque el cliente generado está ignorado por git y no se versiona.
5. El límite de PDF en Vercel es 4 MB. La app lo aplica en servidor y devuelve `413 FILE_TOO_LARGE` con un mensaje claro; no se cambia en silencio el límite local. Un archivo apenas mayor a 4 MB llega a la Function y recibe ese JSON; uno mayor a 4,5 MB puede ser rechazado por la plataforma antes de ejecutar el handler, con la respuesta propia de Vercel.
6. Crear el deployment de Preview, aplicar migraciones en la base de Preview, ejecutar los smoke checks y recién después promover a Production.
7. Aplicar migraciones en Production una vez y ejecutar los smoke checks.

No se agregó Vercel Blob ni otro servicio pago: el alcance actual guarda texto, no el PDF binario. Para aceptar PDFs mayores a 4 MB hace falta subir el archivo directamente a object storage (S3, R2, Supabase Storage u otro), con URL firmada, y procesarlo después; eso cambia la arquitectura de upload y queda fuera de este alcance.

## PDF.js en Vercel

`pdfjs-dist` carga su worker y las fuentes estándar con rutas armadas en runtime. El file tracing de Vercel no puede seguirlas, así que un PDF válido puede fallar solo en producción con `422 CORRUPT_PDF` o `422 NO_EXTRACTABLE_TEXT`. `next.config.ts` las incluye explícitamente con `outputFileTracingIncludes` para `/api/**`; `serverExternalPackages` por sí solo no alcanza. Si aparece ese 422, revisá los logs `http.request` (campo `code`) y confirmá que el deploy incluyó esos assets.

## Embeddings: local para desarrollo, remoto para producción

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

## Observabilidad

Las rutas de documentos, búsqueda, embeddings y preguntas reciben un `requestId` (se reutiliza `x-request-id` solo si es un token seguro; si no, se genera un UUID) y lo devuelven en el header `x-request-id`. Los logs son una línea JSON por evento:

```json
{"level":"info","event":"ask.completed","timestamp":"...","requestId":"...","route":"POST /api/ask","topK":5,"retrievedCount":5,"embeddingMs":12,"searchMs":4,"generationMs":1800,"promptTokens":900,"completionTokens":80,"totalTokens":980,"costUsd":0.0002,"sourceCount":5,"citedCount":2,"totalMs":1900}
```

Se registran: ruta, método, etapa, resultado, duración, estado HTTP, código de error, tipo de error del proveedor, modelo, `topK`, cantidad de fuentes, tokens y costo si el proveedor los informa.

**No** se registran: pregunta completa, prompt, texto de PDFs, chunks, respuesta completa, cookies, contraseñas, API keys ni connection strings. El logger usa una lista blanca de campos; un campo desconocido se descarta aunque el llamador lo pase.

`GET /api/health` ejecuta `SELECT 1` y devuelve `{ "status": "ok" }` o `503 { "status": "unavailable" }`. No incluye versión, host, error de conexión ni configuración.

## Costos

No se afirma que el despliegue sea gratuito. Los componentes que pueden generar costo son:

- **Chat de OpenRouter:** tokens de entrada (pregunta + contexto) y de salida, según el modelo elegido. El modelo `openrouter/free` no está garantizado ni necesariamente disponible.
- **Embeddings remotos:** tokens de entrada de cada chunk al indexar y de cada pregunta al consultar.
- **Neon:** compute y almacenamiento del proyecto/branch; los planes y cuotas cambian.
- **Vercel:** invocaciones, duración y transferencia de las Functions; los límites del plan cambian.

Para estimar, usá los precios vigentes de cada proveedor y multiplicá por el uso real: `tokens de embedding`, `tokens de prompt`, `tokens de completion`, cantidad de requests y tiempo de Function. Los controles ya implementados son `RAG_TOP_K`, `RAG_MAX_CONTEXT_CHARS`, `MAX_PDF_PAGES`, `MAX_PDF_SIZE_MB`, los límites por usuario y los timeouts. No se agregó monitoreo pago.

## CI/CD

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

## Checklist manual de despliegue

Marcar solo lo que se comprobó de verdad.

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
- [ ] PDF apenas mayor a 4 MB: rechazo `413 FILE_TOO_LARGE` de la app. (Por encima de 4,5 MB puede rechazarlo Vercel antes de la Function.)
- [ ] Chunking y generación de embeddings completan.
- [ ] Pregunta con evidencia: respuesta con al menos una cita válida.
- [ ] Pregunta sin evidencia: `noEvidence: true` y sin llamada innecesaria al proveedor.
- [ ] Error/timeout del proveedor: respuesta segura (`502`/`504`) sin filtrar detalles.
- [ ] Logs del deployment: incluyen `requestId`, etapas y duración; no incluyen pregunta, texto, cookies ni claves.
- [ ] Demo de Production verificado y URL agregada al README.
