# Prueba manual

Recorrido para verificar la aplicación de punta a punta en local. Para requisitos y variables, ver el [README](../README.md); para el despliegue, [`deployment.md`](deployment.md).

## Antes de empezar

1. Copiá `.env.example` a `.env`, generá `AUTH_SECRET` con `openssl rand -base64 32`, levantá PostgreSQL y aplicá las migraciones.
2. Abrí `http://localhost:3000/register` y creá dos cuentas con emails distintos: `cuenta-a@example.test` y `cuenta-b@example.test`.

## Aislamiento con dos cuentas

1. Con A, subí `samples/documento-de-prueba.pdf`, generá fragmentos y embeddings. Copiá el id del documento A.
2. Con B, comprobá que la biblioteca no muestra el documento A, que `/documents/<id-A>` devuelve 404 y que `GET`, `DELETE`, `/chunks`, `/embeddings` y `/api/ask` contra ese id devuelven 404.
3. Con B, subí otro PDF y generá sus embeddings. En `/search`, B solo debe ver sus propios chunks; en `/ask`, las fuentes deben apuntar al documento B.
4. Con A, preguntá sobre su documento: las fuentes deben pertenecer a A. Cerrá sesión y comprobá que `/api/documents` devuelve 401.
5. La suite automatizada equivalente es `npm run test:integration`.

## Carga, chunking y embeddings

1. Usa `samples/documento-de-prueba.pdf` o sube un PDF con texto seleccionable.
2. Abre el documento y pulsa **Generar fragmentos** si todavía no tiene.
3. Pulsa **Generar embeddings**. La primera vez puede descargar el modelo; revisa la terminal y `.cache/transformers/`.
4. Verifica que el panel muestre “2 de 2 fragmentos con embeddings” (o el total del documento).
5. Pulsa **Regenerar todos** y confirma que la cantidad de filas no cambia.
6. Si regeneras los chunks de un documento, vuelve a generar sus embeddings antes de preguntar.

## Búsqueda

1. Ve a **Buscar** y prueba:
   - “¿Cuál es el período de garantía del producto?” → debe recuperar la página 1.
   - “¿Qué hace el asistente con el texto?” → debe recuperar la página 2.
2. Confirma que cada resultado muestra documento, página, distancia y similitud, y que una cuenta nunca ve chunks de la otra.

## Preguntas y citas

1. Configura `OPENROUTER_API_KEY` y `OPENROUTER_MODEL` en `.env` y reinicia el servidor. Sin esas variables, comprueba que `/api/ask` responde `503` después de recuperar fragmentos.
2. Ve a **Preguntar**, elige el documento y pregunta algo cuya respuesta esté claramente en una página. Confirma que la respuesta cita `[S1]` (o el ID correspondiente) y que la fuente muestra la página correcta.
3. Pregunta algo que no esté en el documento. El modelo debe decir que no encontró evidencia suficiente; si responde de todos modos, revisa las fuentes y no lo tomes como una respuesta respaldada.
4. Abre el detalle de fuentes y confirma que aparecen todos los fragmentos enviados al modelo, incluso los que no fueron citados, con documento, página, excerpt y distancia.
5. Fuerza un error del proveedor (por ejemplo, una API key inválida o un modelo inexistente) y comprueba que la UI muestra un mensaje entendible, sin claves, prompts ni respuestas crudas.
6. Abre las herramientas del navegador y busca `OPENROUTER_API_KEY` en el bundle, Network y Local Storage: no debe aparecer.
7. Prueba una pregunta vacía y una de más de `RAG_QUESTION_MAX_CHARS`: la API debe responder `400`.
8. Prueba `RAG_TOP_K` en `0` o `21`: se usa el valor por defecto con una advertencia, no se rompe la app.
9. Cambia `EMBEDDING_MODEL_ID` o `EMBEDDING_MODEL_REVISION` en `.env`, reinicia el servidor y pregunta: el documento debe quedar sin embeddings compatibles y la API debe devolver `noEvidence: true` sin llamar a OpenRouter.

## Evaluación de recuperación

1. Ejecuta `npm run eval:seed` y confirma que inserta 2 documentos y 21 chunks con embeddings. El comando es idempotente: repetirlo no duplica filas.
2. Ejecuta `npm run eval:retrieval`. Debe imprimir las estrategias `vector`, `lexical`, `hybrid` y `hybrid-rerank` (esta última como `skipped` si no configuraste un modelo) y escribir un JSON en `eval/reports/`.
3. Abre el reporte y verifica que incluya fecha, modelo/revisión/dimensión, `topK`, candidatos, RRF `k`, hashes del fixture y del gold set, y los rangos de cada chunk relevante. No confíes en el resumen sin mirar los casos.
4. Prueba `npm run eval:retrieval -- --top-k 1`: Recall@1 y MRR deben cambiar respecto de `k = 5`; si un relevante estaba en la posición 2, deja de aparecer en Recall@1.
5. Compara las listas de `vector` y `hybrid` para un caso con código exacto, por ejemplo `q-09` (`ESC-104`) o `q-19` (`FLT-450-A`). La búsqueda léxica debería priorizar la coincidencia literal; la vectorial puede fallar en códigos poco frecuentes.
6. Si configuras `RERANK_MODEL` (y una clave), ejecuta una vez sin `--no-rerank` y otra con `--no-rerank`; compara el orden de los candidatos y el MRR. Usa solo el fixture ficticio: el reranker envía la pregunta y los chunk candidatos a OpenRouter.
7. Revisa al menos una respuesta con `eval/answer-quality-review.md`: comprueba que cada cita `[S#]` apunte a una fuente recuperada y que el excerpt sostenga la afirmación. No cambies el prompt durante la revisión.
8. Si editas el fixture o el gold set, vuelve a ejecutar `npm run eval:seed` antes de `npm run eval:retrieval`; los embeddings guardados no se recalculan solos.

## Consultas SQL útiles

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

## Registro de verificación

Comprobado en el entorno de desarrollo con Node 22.13.1. No se desplegó ni se accedió a cuentas externas.

- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run test:chunking` ✅ (12 tests)
- `npm run test:unit` ✅ (232 tests en 29 archivos)
- `npm run test:integration` ❌ no ejecutado: requiere PostgreSQL local con pgvector y migraciones aplicadas. El workflow de CI lo ejecuta contra un servicio desechable.
- `npm run build` ❌ no ejecutado localmente por la regla del proyecto. El workflow de CI ejecuta `npm run build`, que incluye `prisma generate`.
- Verificador independiente ✅: `PASS` sobre el blocker corregido (aislamiento de `DIRECT_URL` en el runner de integración); typecheck, lint y 34 tests dirigidos pasaron en el recheck. No se ejecutaron build, integración, Neon ni llamadas reales.
- Native receipt review ❌ no disponible: `gentle-ai review assess` devolvió `risk: high` con `unassessable` porque el runtime OpenCode no es elegible para immutable receipt review. Se preserva el resultado tipado y no se inventa un PASS.
- `npx prisma migrate status` ❌ no ejecutado; no se modificó el esquema ni se agregaron migraciones.
- Deployment Preview/Production ❌ no creado.
- Migraciones en Neon ❌ no ejecutadas.
- Embeddings remotos reales ❌ no llamados: la integración está validada con `fetch` mockeado (request, dimensiones, orden por índice, 429/402, timeout, JSON inválido, prefijos ausentes).
- `/api/health` ✅ cubierto con la ruta simulada: `200 { "status": "ok" }` y `503 { "status": "unavailable" }` sin filtrar el error de conexión.
- Logger ✅ cubierto: conserva campos permitidos y descarta pregunta, prompt, texto, cookies, contraseña, API key y respuesta.
- Los resultados de evaluación provienen del reporte histórico `eval/reports/reference-report.json`; no se regeneraron en esta verificación.
