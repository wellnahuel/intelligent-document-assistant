# Feature: Sprint 6 — Autenticación, autorización y seguridad de RAG

Objective: make every document and every derived row belong to one user; add Auth.js credentials with Argon2id; centralize identity and scoped queries in a server-only DAL; close IDOR in pages and API routes; filter vector/lexical retrieval by owner inside SQL; add persistent per-user limits; and document the remaining RAG and privacy limits.
Branch: `feat/sprint-6-auth-and-rag-security`, stacked on `feat/sprint-5-retrieval-evaluation`.
Delivery: work-unit commits on the feature branch; no push, PR or merge requested. Forecast: ~2,200 authored changed lines (code, migration, tests, README, env). The branch keeps reviewable work-unit commits without a chain strategy because no PR was requested and prior sprints followed the same pattern.
Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, `npx prisma migrate status`, and a manual two-user isolation probe. No `npm run build` per project rule.

## Specs

- **S1 — Preconditions and preservation.** Inspect the current schema, routes, DAL-like modules, vector/lexical retrieval, PDF upload, chunks, embeddings and RAG answer flow before editing. Preserve Sprint 1–5 behavior: upload, extraction, chunking, embedding generation, `/search`, `/ask`, evaluation CLI, error shapes and UI, except where ownership changes require a scoped signature. Do not replace an existing auth system (there is none). Use Auth.js because it is the requested library and it supports the installed Next.js. Do not invent email-provider credentials or OAuth secrets.
- **S2 — User model and explicit migration.** Add `User` (`id`, normalized unique `email`, `passwordHash`, optional `name`, timestamps) and `Document.userId` with an index and cascade from `User` to `Document`. Preserve existing documents with an explicit, documented backfill to a legacy owner account that has no usable password and cannot log in. Keep transitive ownership through `DocumentPage` → `DocumentChunk` → `ChunkEmbedding`; document deletion must cascade to all of them. Document how to reassign legacy documents manually.
- **S3 — Authentication with Auth.js and Argon2id.** Integrate `next-auth` v5 (compatible with Next 16) with the Credentials provider and JWT sessions stored in Auth.js's secure cookie; never use `localStorage` for session tokens. Registration normalizes email and relies on the DB unique constraint. Passwords are stored only as Argon2id hashes with documented OWASP-starting parameters (19 MiB memory, 2 iterations, 1 lane, 32-byte output); never plaintext or reversible encryption. Login errors do not reveal whether an email exists. Add logout. Add login/registration rate limits. Do not add OAuth or an email provider without credentials.
- **S4 — Server-only DAL and identity source.** Create a `server-only` data access layer that reads the verified Auth.js session, exposes `requireUser`/`requireApiUser`, and returns scoped documents and DTOs with only needed fields. The user id always comes from the verified session; never from body, query string, form data or client state. UI hiding is never treated as security.
- **S5 — IDOR prevention on every surface.** Every server access to a document verifies ownership in the same query: `where: { id, userId }` or equivalent SQL predicate. Cover list, detail page, document API, delete, chunk regeneration, embedding generation, semantic search, RAG retrieval and ask. Foreign and nonexistent ids return the same non-revealing response shape: page `notFound()`, API `404 DOCUMENT_NOT_FOUND`. Add `DELETE /api/documents/[id]` and a UI action; cascade must remove pages, chunks and embeddings.
- **S6 — Ownership propagation.** Pages, chunks and embeddings inherit the document's owner. All queries that reach them join or filter through `Document.userId`, including counts and summaries. No global list, count or search may expose another user's rows.
- **S7 — Ownership inside retrieval SQL.** The vector SQL joins `Document` and filters `d."userId" = $userId` inside the query before rows reach the model. Lexical and hybrid retrieval receive the owner and filter by it; the evaluation CLI resolves each fixture document's owner instead of bypassing the filter. RAG citations only use chunks returned by the owned retrieval. Document-scoped retrieval must not rely on a late authorization check after fetching by id.
- **S8 — Untrusted RAG inputs and prompt injection.** Treat questions and PDF text as untrusted data. Keep system instructions separate from retrieved context. Add no tools, agents or executable actions in this sprint. The model never chooses `userId`, access rules or queries. Validate citation ids against the retrieved and authorized chunk set. Render answers as React text; never use `dangerouslySetInnerHTML` with model output. Add a test with malicious document content proving it cannot trigger an action or change permissions. The prompt is not a security boundary.
- **S9 — Persistent per-user limits.** Add configurable, database-backed fixed-window limits for uploads, embedding runs, RAG questions and semantic search, plus a maximum document count per user. Add login (email and IP) and registration (email and IP) rate limits. Return a safe `429 RATE_LIMITED` with `Retry-After` for API limits. Enforce the document quota inside the creation transaction so concurrent uploads cannot trivially exceed it. State that the limiter is persistent in PostgreSQL, not in memory. Do not log prompts, passwords, cookies, API keys, full questions or full document text.
- **S10 — PDF and provider handling preserved.** Keep server-side size, MIME and `%PDF-` header validation, page limits, filename sanitization, refusal of invalid/textless PDFs and no original-file storage. Map OpenRouter `429` and quota errors to safe application errors without leaking provider details. The UI and README must state that questions and retrieved chunks are sent to OpenRouter.
- **S11 — Privacy and honest documentation.** Update UI and README with authentication, authorization, IDOR prevention, env vars, migration/backfill strategy, manual two-account test, current retention (no PDF binary, extracted text and embeddings in PostgreSQL) and open threats. Do not claim guarantees that are not verified; do not invent a retention policy.
- **S12 — Tests.** Use Vitest and the existing structure. Add unit tests for password hashing/verification, auth input normalization, rate-limit windows, provider error mapping and prompt-injection resistance. Add real PostgreSQL integration tests with two users and two documents: anonymous access is covered by API/DAL boundaries; user A cannot read, delete, process or ask about B's document; lists only contain owned rows; vector and lexical SQL filter by owner; sources stay owned; quotas and limits reject excess; cascade deletion works. Do not claim tests ran unless executed.
- **S13 — Environment, commands and scope.** Document `AUTH_SECRET` (secret, server-only) and every new limit variable in `.env.example`; never commit the real secret. Add migration and test commands. Keep new env vars optional except `AUTH_SECRET`. Do not add antivirus, external file services, OAuth, tools/agents for RAG, a fabricated retention policy, or unrelated UI.

## Tasks

| ID | Specs | Route | Status | Commit / evidence |
| --- | --- | --- | --- | --- |
| T1 | S1, S2 | inline | done | `2042ca1`; schema, migration with legacy owner, Prisma generate, 5 migrations applied |
| T2 | S3 | inline | done | `dd07e49`; Auth.js v5, Argon2id, register/login/logout server actions; real HTTP probes passed |
| T3 | S4, S5, S6 | inline | done | `7a48137`; DAL, scoped queries, delete endpoint/UI, pages and document APIs |
| T4 | S6, S7 | inline | done | `de08c16`; vector/lexical/hybrid SQL filters, RAG retrieval, ask/search, eval owner map |
| T5 | S9, S10 | inline | done | `dd07e49` + `de08c16`; `RateLimitBucket`, quotas, 429/402 provider mapping |
| T6 | S8, S10, S11 | inline | done | `de08c16`; prompt-injection test, privacy copy, no raw HTML rendering |
| T7 | S12 | inline | done | `216f05a`; 197 unit tests / 24 files, 11 integration tests against `ida_test` |
| T8 | S11, S13 | inline | done | README, `.env.example`, manual two-account probe, commands |
| T9 | S1–S13 | delegated | pending | Independent verification at feature end; native review if due |

Route note: the feature names high-risk items 1 (schema migration and existing-data backfill), 2 (auth, sessions and password storage), 3 (contract/response changes for protected resources) and 4 (SQL ownership filters). One independent verifier runs at the end, not per task. No parallel writers: the units share the schema, DAL and route surfaces, so parallel edits would collide. All implementation ran inline.

## Log

### L1 — User request (verbatim)

````text
# Sprint 6: autenticación, permisos y seguridad de RAG

Quedan **2 sprints contando este**. Cuando terminemos el 6, queda **1**: producción, despliegue y optimización.

La meta de este sprint es que cada persona pueda acceder solo a sus documentos y que los endpoints de RAG no expongan datos ni permitan abusos fáciles.

## Autenticación y autorización

Son problemas distintos:

- **Autenticación:** quién es la persona que está haciendo la solicitud.
- **Autorización:** si esa persona puede acceder a un documento concreto.

Para este proyecto podemos reutilizar Auth.js, que ya apareció en AI Workspace. La guía actual de Next.js recomienda una biblioteca de autenticación y centralizar las comprobaciones de autorización en una capa de acceso a datos (DAL). 

Si el proyecto permite crear cuentas con contraseña, guardamos una **contraseña derivada**, nunca la contraseña original. OWASP recomienda Argon2id para el almacenamiento de contraseñas y publica parámetros mínimos que sirven como punto de partida. 

## Evitar IDOR

Un IDOR aparece cuando una persona cambia un ID de la URL y obtiene acceso a un objeto de otra persona. Por ejemplo, abre `/documents/123`, cambia `123` por `456` y el servidor devuelve un documento ajeno.

La regla es: **cada acceso a un recurso debe verificar los permisos del usuario en el servidor**. OWASP recomienda comprobar los permisos en cada solicitud; Next.js, además, sugiere centralizar esa lógica en el DAL. 

Una consulta debe estar acotada por el usuario desde el principio:

```ts
const document = await prisma.document.findFirst({
  where: {
    id: documentId,
    userId: session.user.id,
  },
});
```

En las búsquedas vectoriales esto es especialmente importante. Hay que filtrar por `userId` dentro de la consulta que recupera los chunks, antes de pasárselos al modelo. Las citas también deben construirse solo con esos resultados autorizados.

## Aislamiento de datos

La relación principal será:

```text
User
└── Document
    └── DocumentPage
        └── DocumentChunk
            └── ChunkEmbedding
```

Las páginas, los chunks y los embeddings heredan el permiso del documento. Las operaciones de listar, leer, borrar, procesar, buscar y citar deben respetar esa relación.

Podemos agregar Row-Level Security de PostgreSQL como defensa adicional, pero no la vamos a activar automáticamente sin entender cómo se transmite la identidad de usuario a la base. PostgreSQL aplica políticas por fila y puede denegar el acceso cuando no existe una política aplicable; eso requiere configuración cuidadosa junto al patrón de conexión elegido. 

## Seguridad específica de RAG

Los documentos y las preguntas son entradas no confiables. Un PDF podría contener instrucciones destinadas a manipular al modelo. Etiquetar el texto como “contexto” en el prompt ayuda a expresar la intención, pero **no es una frontera de seguridad**: el modelo puede seguir instrucciones maliciosas incluidas en documentos recuperados. 

Para este proyecto, las defensas concretas son:

- No darle herramientas que ejecuten acciones en este sprint.
- No usar la salida del modelo para modificar datos o permisos.
- Validar las citas contra los chunks recuperados.
- Renderizar respuestas como texto seguro; no insertar HTML crudo.
- Mantener los filtros de propiedad fuera del control del modelo.
- No registrar prompts, contraseñas ni contenido completo de documentos.

## Límites de uso y archivos

La carga, la generación de embeddings y las preguntas pueden consumir CPU, almacenamiento o cuota del proveedor. Vamos a imponer límites por usuario, además de validar tamaño y tipo del PDF en el servidor. OWASP recomienda limitar las cargas y validar su contenido; el MIME informado por el navegador no basta para confiar en el archivo. 

La aplicación también enviará la pregunta y los fragmentos recuperados a OpenRouter para generar respuestas. La interfaz y el README deben dejar claro ese flujo; los documentos privados no deberían usarse con el proveedor sin entender las condiciones aplicables.

## Objetivos del sprint

- Incorporar autenticación con la biblioteca existente o una compatible.
- Agregar `User` y vincular cada documento con su dueño.
- Crear una DAL que obtenga la identidad y haga consultas acotadas.
- Proteger todos los endpoints, incluidos los de búsqueda, generación y eliminación.
- Agregar límites por usuario para cargas, embeddings y preguntas.
- Revisar el flujo de archivos y el tratamiento de texto no confiable.
- Crear pruebas que intenten acceder a documentos con otra cuenta.

## Prompt para OpenCode

```text
Actuá como desarrollador senior de Next.js App Router, TypeScript, Prisma y seguridad de aplicaciones RAG. Implementá el Sprint 6 de Intelligent Document Assistant: autenticación, autorización por usuario, aislamiento de documentos y controles básicos de uso.

CONTEXTO
Este proyecto se está construyendo por sprints. Inspeccioná el repositorio antes de modificarlo. No asumas que la autenticación, la búsqueda, la ingesta o el esquema están completos. Preservá las funcionalidades existentes.

ANTES DE EDITAR
1. Inspeccioná modelos, endpoints, server actions, DAL, búsqueda vectorial, carga PDF, chunks y embeddings.
2. Verificá qué biblioteca de autenticación existe y su versión.
3. Resumí brevemente el estado actual y los archivos que pensás modificar.
4. No reemplaces un sistema de autenticación existente sin explicar el motivo.
5. Si el proyecto no tiene autenticación, usá Auth.js en una versión compatible con el Next.js instalado. No implementes manualmente cookies o tokens.
6. Si el alcance depende de un proveedor de correo o secretos que no están configurados, dejá esa parte indicada en README y no inventes credenciales.

OBJETIVO
Cada usuario autenticado puede listar, leer, procesar, buscar y borrar solo sus propios documentos y resultados derivados.

AUTENTICACIÓN
- Integrar Auth.js o reutilizar su configuración existente.
- Crear registro/login solo si todavía no existe una forma de autenticación.
- Si se usan contraseñas, guardar exclusivamente un hash Argon2id con parámetros documentados; nunca texto plano ni cifrado reversible.
- Normalizar email y aplicar unicidad en la base de datos.
- Usar mensajes de login que no revelen si un email está registrado.
- Aplicar rate limit al login y registro.
- Conservar la sesión mediante el mecanismo seguro soportado por la biblioteca.
- Agregar logout.
- No guardar tokens de sesión en localStorage.
- No exponer secretos en código cliente ni en responses.
- No agregar OAuth si requiere credenciales que no están disponibles.

AUTORIZACIÓN Y DAL
1. Crear o adaptar una Data Access Layer server-only para:
   - obtener la sesión autenticada;
   - exigir usuario para operaciones protegidas;
   - obtener documentos dentro del ámbito de ese usuario;
   - devolver DTOs con solo los campos necesarios.
2. Usar el ID de usuario obtenido de la sesión verificada. Nunca aceptar userId del body, query string, formulario o cliente.
3. No confiar en esconder botones en la interfaz como control de seguridad.
4. Para IDs ajenos o inexistentes, responder de forma que no revele si el recurso existe.
5. Evitar consultas globales por ID seguidas de una autorización tardía.

AISLAMIENTO DE DATOS
- Agregar User y relacionarlo con Document.
- Crear la migración necesaria preservando documentos existentes con una estrategia explícita y documentada.
- Mantener ownership transitivo para páginas, chunks y embeddings mediante su Document.
- Actualizar listados, detalle, carga, borrado, chunking, generación de embeddings, pregunta RAG y citas.
- En consultas vectoriales SQL, hacer JOIN con Document y filtrar por el userId autenticado dentro de la consulta.
- No pasar al modelo chunks que no estén dentro del ámbito autorizado.
- Si el borrado elimina documento, asegurar que el borrado en cascada alcance páginas, chunks y embeddings.

RAG Y PROMPT INJECTION
- Tratar preguntas y texto extraído de PDFs como datos no confiables.
- Mantener el contexto separado de las instrucciones del sistema.
- No agregar herramientas, agentes ni acciones ejecutables en este sprint.
- No confiar en el prompt como frontera de seguridad.
- Validar IDs de cita contra chunks recuperados y autorizados.
- No permitir que el modelo decida el userId, el acceso o las consultas de base.
- Renderizar la respuesta de forma segura; no usar dangerouslySetInnerHTML con texto del modelo.
- Agregar un caso de prueba con contenido de documento que incluya una instrucción maliciosa y comprobar que no puede disparar una acción o modificar permisos.

LÍMITES DE USO
- Agregar límites configurables por usuario para tamaño y cantidad de documentos, generación de embeddings y preguntas RAG.
- Aplicar rate limiting también a login/registro.
- Evitar almacenar contenido completo de preguntas o PDFs en los logs.
- Si el mecanismo es en memoria, documentar que no es fiable entre réplicas o funciones serverless; preferir una implementación persistente compatible con la base existente.
- Manejar 429 y errores de cuota del proveedor externo con mensajes seguros.

CARGA DE PDF
- Mantener validación del lado servidor de tamaño, tipo y cabecera del archivo.
- Mantener límites de páginas y rechazar archivos que superen los límites.
- No usar el filename original como una ruta.
- Evitar servir PDFs como HTML activo.
- Rechazar archivos inválidos o sin texto extraíble con mensajes comprensibles.
- No agregar antivirus ni servicios externos que requieran una cuenta en este sprint.

DATOS Y PRIVACIDAD
- Indicar en UI/README que preguntas y fragmentos recuperados se envían a OpenRouter para generar respuestas.
- No registrar API keys, cookies, contraseñas, prompts completos ni texto completo de documentos.
- No afirmar garantías de privacidad que no estén verificadas.
- No agregar una política de retención inventada; documentar la política actual.

PRUEBAS
Usar Vitest/Playwright según la estructura actual para verificar:
- usuario anónimo no puede acceder a endpoints protegidos;
- usuario A no puede leer un documento de usuario B;
- usuario A no puede borrar, procesar, consultar o citar un documento de B;
- los listados solo incluyen documentos propios;
- búsqueda vectorial aplica el filtro de ownership dentro del SQL;
- las fuentes enviadas al modelo pertenecen al usuario autenticado;
- un usuario puede acceder a sus documentos;
- límites por usuario y rate limit rechazan solicitudes excedidas;
- texto de documento malicioso no puede ejecutar acciones ni alterar el acceso.
Usar dos usuarios y dos documentos de fixture, sin datos personales reales.
No afirmar que se ejecutaron pruebas si no se ejecutaron.

ENTREGA
Al final:
1. Explicá autenticación, autorización y prevención de IDOR con el flujo de esta app.
2. Enumerá cambios de esquema, migraciones, rutas y variables de entorno.
3. Indicá cómo probar manualmente el aislamiento con dos cuentas.
4. Aclarar qué controles son defense-in-depth y qué amenazas siguen abiertas.
5. Listá los comandos de migración y ejecución.
6. Señalá los módulos que debería leer primero para entender la implementación.
```

## Comprobación manual principal

Creá dos usuarios y cargá un documento distinto con cada uno. Copiá el ID del documento A e intentá abrirlo, borrarlo, procesarlo y hacerle preguntas desde la sesión B. No alcanza con que la página de detalle esté bloqueada: también hay que comprobar la lista, las rutas de API, las consultas vectoriales y las fuentes de las respuestas.

## Preguntas de repaso

1. ¿Qué diferencia hay entre autenticar a una persona y autorizar su acceso a un documento?
2. ¿Por qué un `documentId` recibido desde el cliente no demuestra que el usuario sea dueño?
3. ¿En qué parte de la consulta vectorial debe aplicarse el filtro de `userId`?
4. ¿Por qué una instrucción de sistema no puede garantizar que un PDF malicioso no manipule al modelo?
5. ¿Qué datos de una solicitud RAG evitarías guardar en logs y por qué?
6. ¿Qué cambia en el riesgo de aislamiento cuando pasamos de una app local de un usuario a una aplicación multiusuario?
````

### L2 — Implementation decisions

- Auth.js v5 (`next-auth@5.0.0-beta.32`) supports the installed Next 16.4.6; there was no existing auth system to replace.
- JWT sessions from Auth.js, stored in the library's HttpOnly cookie. No adapter tables were added because Credentials + JWT does not need them.
- Argon2id starts at OWASP's minimum: 19 MiB, 2 iterations, 1 lane, 32-byte tag. Parameters are encoded in the hash.
- Existing documents are preserved under `legacy-owner-0000000000000000` with an invalid hash. Reassignment is manual and documented.
- Rate limits are persistent fixed windows in PostgreSQL, keyed by opaque hashes for email/IP. Document quota uses `SELECT ... FOR UPDATE` on the user row.
- Vector and lexical SQL filter by `d."userId"` inside the query. The evaluation fixture has its own non-login owner and the CLI resolves the owner map.
- No proxy/middleware was added: it would buffer uploads and was not needed; the DAL is the authorization boundary.
- No tools/actions were added to RAG; the model output remains plain text and cannot change permissions.

### L3 — Verification evidence

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test` passed: 12 chunker tests + 197 Vitest tests in 24 files.
- `npm run test:integration` passed: 11 tests against the isolated `ida_test` database (created and migrated by `scripts/test-integration.ts`).
- `npx prisma migrate status` passed: 5 migrations applied to `ida`.
- Manual HTTP probes with two signed sessions passed: anonymous 401/redirect; foreign document GET/DELETE/chunks/embeddings/ask 404; own detail 200; search returned only owned indexed chunks; RAG sources belonged to the asking user; logout cleared the session.
- Register/login/logout server actions were exercised over HTTP: registration created an Argon2id hash and an Auth.js session; login redirect succeeded; wrong password rendered the generic message; logout deleted the session cookie.
- Real OpenRouter generation was exercised for both users; each answer cited sources from its own document.
- `npm run eval:seed` and `npm run eval:retrieval` still pass; metrics match the Sprint 5 reference report. The generated temporary report was removed.
- `next build` was not run (project rule).

### L4 — Pending

- T9 independent verification and native review decision at feature end.
- No push, PR or merge requested.
