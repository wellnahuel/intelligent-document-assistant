# Sprint 7 — Despliegue y cierre del proyecto

Branch: `feat/sprint-7-deployment` (stacked on `main`, Sprint 6 merge `b50b70e`).
Delivery: single feature branch, work-unit commits; push, PR and merge are user decisions.
Runner: Node 22.13.1, `node:test` (chunking) + Vitest (unit/integration).
Scope: deployment readiness, remote embedding option, observability, CI, portfolio README. No account access, no deploy, no invented URLs or metrics.

## Specs

- **S1 — Ambientes separados.** "Variables separadas para Local, Preview y Production." Preview and Production must use separate variables and separate databases, so branch tests never write to the public database. No private key may use `NEXT_PUBLIC_` or appear in versioned files, logs or client bundles.
- **S2 — Límite de carga.** "Vercel Functions acepta cuerpos de hasta 4,5 MB." Production demo limit: "un máximo de 4 MB en producción y mantener el valor local más alto." Validate size, signature and pages on the server. "Devolver un error 413 claro ante exceso de tamaño." Document that larger PDFs require direct object-storage upload. Keep storing extracted text only, not the PDF binary.
- **S3 — Embeddings configurables.** Keep an embedding-provider interface with a local implementation for development and a remote implementation for production. Configure provider and model through server-only variables. Store model/revision with each embedding. "La aplicación debe usar el mismo modelo para crear embeddings de documentos y de preguntas." Never copy incompatible local embeddings into a new production database. Changing the model requires re-embedding every chunk. Do not bundle unnecessary large models in production.
- **S4 — PostgreSQL, pgvector y migraciones.** Neon for PostgreSQL; enable pgvector with `CREATE EXTENSION IF NOT EXISTS vector;`. Keep every migration in version control. Apply production migrations with `prisma migrate deploy` ("no se usa `migrate dev` contra la base de producción"). Never run `migrate dev` or `db push` against production. Use a reusable PrismaClient singleton in the serverless runtime. Document direct-vs-pooled connection URLs when the provider and installed Prisma version require it. Never migrate per request or from concurrent functions. Never expose connection errors or credentials from public endpoints.
- **S5 — Entornos y secretos.** Update `.env.example` with names and descriptions, never real values. Cover `DATABASE_URL`, `DIRECT_URL` only if required by the installed setup, Auth.js variables, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL_ID`, upload/page/topK/context limits. Separate Local, Preview and Production.
- **S6 — CI/CD.** Install from the lockfile, run lint, typecheck, unit tests and build, run E2E only if the existing environment supports it, keep Preview branches away from Production secrets and database, and fail the workflow on any failed step. "No afirmar que un paso pasó si no se ejecutó."
- **S7 — Observabilidad y costos.** Structured logs with `requestId`, stage, duration and error type. Never log the full prompt, PDF text, cookies, passwords or API keys. Log input/output tokens when the provider reports them. Keep timeouts and retry limits. Document potential costs without claiming the deployment is free. Do not add paid monitoring. Provide `/api/health` or equivalent with a minimal response that leaks no secrets or internals.
- **S8 — README de portfolio.** Name and description; screenshots or instructions to capture them; real features; RAG pipeline diagram; architecture and stack; local and Docker setup; environment variables; migrations and test data; real Sprint 5 evaluation if it exists (otherwise mark it pending); Local/Preview/Production deployment; security (auth, isolation, limits, external providers); limitations (OCR, prompt injection, free-model availability, upload limits, costs); demo link only when it exists and was verified.
- **S9 — Validación final manual.** Checklist for local build, Preview deployment, Preview migration, login and two-account isolation, PDF under the limit, PDF over the limit, embeddings, question with answer and citation, question without evidence, provider error/timeout, health endpoint, and logs without secrets or sensitive text. "No simules estos resultados. Marcá cada ítem como verificado solo si realmente se comprobó."
- **S10 — Entrega.** List changed files and config, concrete commands for the detected versions, user-account steps, Vercel upload and local-model limitations, and how to present the project in a technical interview.
- **S11 — Límites de la intervención.** Inspect the real repository before editing. "No accedas a cuentas externas ni publiques la aplicación por tu cuenta." "No inventes claves, URLs, dominios, costos ni resultados." Do not delete or rewrite existing code to simplify deployment.

### Assumptions (marked as such)

- **A1:** OpenRouter exposes embeddings at `POST https://openrouter.ai/api/v1/embeddings` and a separate catalogue at `/api/v1/embeddings/models` (verified against OpenRouter docs). No free model is assumed or hardcoded.
- **A2:** The SQL column stays `vector(384)`; the remote provider requests `dimensions: 384` so both providers share the same schema. A remote model must support that output size.
- **A3:** `/api/ask` keeps its existing vector-only retrieval. Hybrid search and reranking remain evaluation-only, as documented since Sprint 5; this sprint does not change that behavior.
- **A4:** The repository has no E2E suite. CI runs unit tests plus the existing PostgreSQL integration suite; it does not claim E2E coverage.
- **A5:** The project rule forbids running `next build` locally after changes. CI runs the build; the local verification record states it was not run.

## Tasks

| ID | Spec | Task | Route | Status | Commit |
| --- | --- | --- | --- | --- | --- |
| T1 | S5, S1 | Rewrite `.env.example` by environment with new provider/limit variables | inline | done | `0d659d2` |
| T2 | S2 | Production upload cap: 4 MB on Vercel, 10 MB local, clear 413 | inline | done | `c6df4aa` |
| T3 | S3 | Configurable local/OpenRouter embedding provider with stored model/revision | inline | done | `6df906a` |
| T4 | S4 | Prisma serverless singleton, pool bound, CLI `DIRECT_URL`, build generates client | inline | done | `11e8022` |
| T5 | S7 | Structured logger, request IDs, stage timings, `/api/health` | inline | done | `57905d1` |
| T6 | S6 | GitHub Actions: install, generate, lint, typecheck, tests, build, integration | inline | done | `904f6a4` |
| T7 | S8 | README Sprint 7: deployment, architecture, eval results, limits, checklist | inline | done | `0d659d2` |
| T8 | S9, S10 | Local verification (no build), honest record, delivery summary | inline | in progress | — |

## Log

### L1 — Pedido original del usuario (verbatim)

# Sprint 7: despliegue y cierre del proyecto

Sí: este es **el sprint final de los 7**. Vamos a desplegar la aplicación y dejarla documentada para que se pueda mostrar en tu portfolio.

## Decisiones para el despliegue

Para mantener el stack conocido, propongo **Vercel para Next.js y Neon para PostgreSQL con pgvector**. Neon permite habilitar pgvector con `CREATE EXTENSION IF NOT EXISTS vector;`.

Hay dos detalles de arquitectura que afectan al despliegue:

1. **Límite de carga:** Vercel Functions acepta cuerpos de hasta 4,5 MB. Como el Sprint 1 partió de un límite de PDF de 10 MB, para el demo podemos configurar un máximo de **4 MB en producción** y mantener el valor local más alto. Si queremos aceptar archivos mayores, necesitamos subirlos directamente a almacenamiento de objetos o cambiar el modo de despliegue.

2. **Modelo local de embeddings:** para desarrollo es útil y evita una API extra. En Vercel, cargarlo desde una función puede complicar el tamaño y el arranque. Para el demo, podemos configurar un proveedor remoto de embeddings disponible en OpenRouter y dejar Transformers.js para desarrollo local. La aplicación debe usar **el mismo modelo para crear embeddings de documentos y de preguntas**. Como la base de producción empieza separada, se procesan allí los PDFs de prueba con ese modelo. Si más adelante migramos datos ya indexados, tendremos que regenerar sus embeddings.

OpenRouter admite embeddings y chat con endpoints distintos; los modelos, sus costos y disponibilidad pueden cambiar, así que se configuran por variables y se comprueban al desplegar.

## Qué significa "listo para producción"

No alcanza con que la app abra en una URL. El despliegue debe tener:

- Variables separadas para Local, Preview y Production. Vercel permite asignarlas por entorno; los cambios se aplican a nuevos deployments.
- Migraciones aplicadas con el comando de producción que corresponda a la versión de Prisma instalada. En versiones actuales, `migrate deploy` aplica migraciones pendientes; no se usa `migrate dev` contra la base de producción.
- Una instancia de Prisma reutilizable por proceso para evitar abrir conexiones en cada llamada. La documentación de Prisma señala este cuidado para plataformas serverless.
- Logs que permitan entender errores sin guardar claves, contraseñas, preguntas completas ni texto de PDFs.
- Un README que explique el flujo RAG, decisiones, límites y cómo ejecutar el proyecto.

Los planes gratuitos y sus límites cambian; antes de publicar vamos a verificar el uso y las cuotas disponibles en las cuentas reales.

## Pipeline final

```text
Pull request
  → lint y tipos
  → pruebas
  → deployment Preview
  → revisión manual
  → migración y deployment Production
  → smoke checks
```

Las variables y la base de Preview deben estar separadas de las de Production. Así, las pruebas de una rama no escriben datos en la base pública.

## Rendimiento y costos

Medimos la aplicación antes de intentar optimizarla. Para este demo vamos a registrar tiempos por etapa:

- Embedding de la pregunta.
- Búsqueda vectorial y léxica.
- Reranking, si está activado.
- Llamada al modelo generativo.
- Tokens de entrada y salida, si el proveedor los informa.

Los controles principales serán:

- `topK` y tamaño máximo del contexto.
- Límite de páginas y tamaño del PDF.
- Límites por usuario para preguntas y procesamiento de documentos.
- Timeout y manejo de errores del proveedor.
- No reintentar sin límite: los reintentos pueden duplicar consumo y latencia.
- Búsqueda vectorial exacta para el corpus chico del portfolio; índices aproximados cuando las mediciones lo justifiquen.

## Entregable final

Al terminar este sprint, el portfolio debería incluir:

- URL de Preview y/o demo de producción.
- README con capturas, arquitectura, configuración local y despliegue.
- Diagrama del pipeline desde PDF hasta respuesta con citas.
- Explicación de chunking, embeddings, búsqueda vectorial, híbrida y evaluación.
- Resultados reales del conjunto de evaluación del Sprint 5, sin inventar métricas.
- Limitaciones conocidas: calidad de PDFs escaneados, disponibilidad de modelos gratuitos, límites de carga, prompt injection y privacidad del proveedor.

## Prompt para OpenCode

```text
Actuá como desarrollador senior de Next.js, PostgreSQL, Prisma y despliegues serverless. Implementá el Sprint 7 y último de Intelligent Document Assistant: preparar y documentar el despliegue de portfolio.

CONTEXTO
Este proyecto se desarrolló en sprints. Inspeccioná el estado real del repositorio; no afirmes que funcionalidades, pruebas o seguridad están completas si no lo verificaste. No elimines ni reescribas código existente para simplificar el despliegue.

ANTES DE EDITAR
1. Inspeccioná package.json, versión de Next.js y Prisma, rutas, migraciones, proveedor de embeddings, proveedor generativo y pruebas.
2. Resumí qué partes están listas, qué riesgos encontraste y qué archivos proponés cambiar.
3. No accedas a cuentas externas ni publiques la aplicación por tu cuenta.
4. No inventes claves, URLs, dominios, costos ni resultados.
5. Dejá las operaciones que requieran cuenta del usuario documentadas como pasos reproducibles.

DESTINO DE REFERENCIA
- Next.js en Vercel.
- PostgreSQL con pgvector en Neon.
- OpenRouter para generación.
- Proveedor de embeddings configurable por entorno.
- CI con GitHub Actions o la integración CI existente.
Verificá compatibilidad con las versiones instaladas antes de elegir comandos.

COMPATIBILIDAD DE EMBEDDINGS
1. Mantener una interfaz de proveedor de embeddings con una implementación local para desarrollo y una implementación remota opcional si ya existe o puede agregarse sin reestructurar la app.
2. No asumir que el proveedor remoto ofrece un modelo gratuito de forma permanente.
3. Configurar el proveedor y el modelo mediante variables server-only.
4. Guardar el modelo/revisión con cada embedding.
5. Asegurar que la consulta se embeba con el mismo modelo que los documentos recuperados.
6. En el entorno de producción nuevo, no copiar embeddings locales incompatibles.
7. Documentar que cambiar de modelo requiere regenerar embeddings de los chunks.
8. No incluir modelos grandes innecesarios dentro del bundle de producción.

ARCHIVOS PDF Y VERCEL
- Vercel Functions tiene un límite documentado de 4.5 MB por request body.
- Configurar un límite de producción seguro, máximo inicial 4 MB, sin cambiar silenciosamente el límite de desarrollo.
- Validar tamaño, firma y páginas en servidor.
- Devolver un error 413 claro ante exceso de tamaño.
- Documentar que aceptar PDFs mayores requiere upload directo a object storage o una arquitectura de upload distinta.
- No agregar Vercel Blob ni otro servicio pago sin necesidad.
- Esta app guarda texto extraído; no persistir el PDF binario si el alcance actual no lo necesita.

BASE DE DATOS Y MIGRACIONES
1. Documentar cómo crear la base y habilitar pgvector con `CREATE EXTENSION IF NOT EXISTS vector`.
2. Mantener todas las migraciones en control de versiones.
3. Aplicar migraciones en producción con el comando compatible con la versión de Prisma instalada (por ejemplo, `prisma migrate deploy` en versiones donde corresponda).
4. Nunca ejecutar `migrate dev` o `db push` contra producción.
5. Separar variables y bases para Preview y Production.
6. Configurar PrismaClient como singleton reutilizable en el runtime serverless.
7. Si el proyecto necesita URL de conexión directa para migraciones y URL agrupada para runtime, documentar la diferencia de acuerdo con el proveedor y la versión de Prisma.
8. No correr migraciones automáticamente desde cada petición ni desde múltiples funciones concurrentes.
9. No exponer errores de conexión o credenciales en endpoints públicos.

ENTORNOS Y SECRETOS
Actualizar `.env.example` con nombres y descripciones, nunca con valores reales. Evaluar según código existente:
- DATABASE_URL
- DIRECT_URL, solo si la configuración instalada la requiere
- AUTH_SECRET y variables Auth.js requeridas
- OPENROUTER_API_KEY
- OPENROUTER_MODEL
- EMBEDDING_PROVIDER
- EMBEDDING_MODEL_ID
- límites de tamaño, páginas, topK y contexto
Separar Local, Preview y Production. Ninguna clave privada debe tener prefijo NEXT_PUBLIC_ ni aparecer en archivos versionados, logs o bundles cliente.

CI/CD
Configurar o actualizar el workflow para:
- instalar con lockfile;
- ejecutar lint;
- ejecutar typecheck;
- ejecutar pruebas unitarias;
- ejecutar build;
- ejecutar pruebas E2E solo si el entorno existente las soporta con dependencias y datos de prueba adecuados;
- evitar que ramas Preview usen secretos y base Production;
- fallar el workflow ante cualquier paso fallido.
No afirmar que un paso pasó si no se ejecutó.

OBSERVABILIDAD Y COSTOS
- Logs estructurados con requestId, etapa, duración y tipo de error.
- No registrar prompt completo, texto PDF, cookies, contraseñas ni API keys.
- Registrar tokens de entrada/salida si la respuesta del proveedor los informa.
- Mantener timeouts y límites de reintentos.
- Documentar el costo potencial por generación, embeddings remotos, base de datos y funciones; no afirmar que el despliegue será gratuito.
- No agregar un sistema de monitoreo pago en este sprint.
- Crear `/api/health` o equivalente con respuesta mínima y sin filtrar secretos o detalles internos.

DOCUMENTACIÓN DE PORTFOLIO
Actualizar README con:
1. Nombre y descripción del proyecto.
2. Capturas o instrucciones para capturarlas.
3. Funcionalidades reales implementadas.
4. Diagrama/explicación del pipeline RAG.
5. Arquitectura y stack.
6. Configuración local y Docker.
7. Variables de entorno.
8. Migraciones y datos de prueba.
9. Evaluación real del Sprint 5 si existe; si no existe, marcarlo pendiente.
10. Despliegue Local/Preview/Production.
11. Seguridad: autenticación, aislamiento, límites y envío de contexto a proveedores externos.
12. Limitaciones: OCR, prompt injection, disponibilidad y límites de modelos gratuitos, límites de carga y costos.
13. Demo link solo cuando exista y haya sido verificado.

VALIDACIÓN FINAL
Preparar una checklist manual para:
- build local;
- deployment Preview;
- migración aplicada en base Preview;
- login y aislamiento de dos cuentas;
- carga de PDF menor al límite;
- rechazo de PDF mayor al límite;
- generación de embeddings;
- pregunta con respuesta y cita;
- pregunta sin evidencia;
- error/timeout del proveedor;
- endpoint de health;
- logs sin secretos ni texto sensible.
No simules estos resultados. Marcá cada ítem como verificado solo si realmente se comprobó.

ENTREGA
Al final:
1. Listá archivos y cambios de configuración.
2. Indicá comandos concretos según las versiones detectadas.
3. Enumerá pasos que requieren que el usuario conecte o configure sus cuentas.
4. Explicá las limitaciones de Vercel para el upload y el modelo local.
5. Resumí cómo enseñar el proyecto en una entrevista técnica.
```

## Preguntas finales de repaso

1. ¿Por qué los ambientes Preview y Production necesitan bases y variables separadas?
2. ¿Por qué conviene ejecutar migraciones una sola vez en el pipeline y no al iniciar cada función?
3. ¿Qué efecto tiene cambiar el modelo de embeddings después de indexar documentos?
4. ¿Qué límite de Vercel afecta directamente a la carga de PDFs y qué opciones tenemos?
5. ¿Qué datos conviene medir para entender costo y latencia de una respuesta RAG?
6. Si el demo responde lento, ¿qué mediciones mirarías antes de cambiar la arquitectura?

Con este sprint termina el plan de 7 sprints del **Intelligent Document Assistant**.

### L2 — Inspección inicial (2026-11-13)

- Next.js 16.4.6, React 19.3.1, Prisma 7.10.1 con `prisma.config.ts` y `@prisma/adapter-pg`; cliente generado en `src/generated/prisma` (ignorado por git).
- Auth.js 5 beta con Credentials + Argon2id; sesión JWT.
- Embeddings locales con `@huggingface/transformers` 4.3.2 y `Xenova/multilingual-e5-small` (384 dimensiones). No existe proveedor remoto todavía; `ChunkEmbedding` ya guarda `modelId`, `modelRevision` y `dimensions`.
- `/api/ask` recupera solo por vector exacto; léxico, híbrido y reranking viven en el CLI de evaluación (`src/lib/evaluation/run.ts`), no en la respuesta. Se documentará tal cual.
- No hay `.github/`, ni suite E2E, ni endpoint de salud.
- `next.config.ts` ya declara `serverExternalPackages` para PDF.js, Transformers.js, ONNX, Sharp y Argon2.
- `prisma.config.ts` usa `env("DATABASE_URL")`; el tipo `Datasource` de Prisma 7.10.1 solo expone `url` y `shadowDatabaseUrl` (no `directUrl`).
- Reporte real Sprint 5: 25 casos (20 respondibles, 5 no respondibles). Vector Recall@5 1.00 / Precision@5 0.21 / MRR 0.9667 / 3.18 ms; léxico 0.95 / 0.20 / 0.635 / 2.88 ms; híbrido 1.00 / 0.21 / 0.90 / 3.60 ms; híbrido+rerank omitido por `missing_model`. Embedding medio de consulta 9.84 ms.
- Decisión de alcance: no conectar híbrida/rerank a `/api/ask` (cambio de producto no pedido); instrumentar el pipeline real y documentar la diferencia.

### L3 — Verificación independiente (2026-11-13)

- `gentle-ai review assess --base-ref b50b70e --committed-only` devolvió `risk: high` con `unassessable: el runtime OpenCode no es elegible para immutable receipt review`. Se preserva el resultado tipado; no se inventa PASS ni se desactiva RDD.
- Verificador independiente: typecheck, lint, 231 unit tests y 33 probes dirigidos pasan. Encontró 1 blocker y 4 advisories.
- **Blocker corregido (S4/S6):** `scripts/test-integration.ts` solo pisaba `DATABASE_URL`; `prisma.config.ts` prefiere `DIRECT_URL` para el CLI, así que un `DIRECT_URL` heredado podía recibir `prisma migrate deploy`. Ahora el runner fija `DATABASE_URL` y `DIRECT_URL` al `*_test` y agrega un test de regresión.
- **Advisories corregidos:** `/api/documents/[id]` y `/chunks` ahora usan `runRoute` (requestId consistente); mensaje de error local recupera la pista de descarga/caché; tabla histórica de latencias de evaluación corregida a los valores reales del reporte; este documento actualizado con estados y commits.
- **Advisory no corregido:** ninguno pendiente.
- Queda un recheck acotado al blocker corregido.
