# Revisión manual de calidad de respuesta — Sprint 4

Esta plantilla evalúa por separado la respuesta generada y las citas. No usa un
LLM juez: una persona revisa cada respuesta contra las fuentes recuperadas. El
objetivo es distinguir un problema de recuperación de un problema de generación.

## Cómo preparar la revisión

1. Ejecutá `npm run eval:seed` para cargar los documentos ficticios de
   `eval/fixtures/fictional-documents.json` y sus embeddings.
2. Usá la pantalla `/ask` o `POST /api/ask` con el `documentId` y la `question`
   de cada caso de `eval/gold-set.json`.
3. Guardá la respuesta JSON completa: `answer`, `sources`, `citedSourceIds`,
   `noEvidence`, `noEvidenceReason`, `model`, `usage` y `retrieval`.
4. Completá una fila por caso. No cambies el system prompt durante la revisión:
   si querés proponer un cambio, primero definí cómo lo evaluarías con la misma
   tabla y el mismo conjunto de casos.

Los documentos del fixture son ficticios y no contienen datos sensibles. Si
activás el reranking, la pregunta y los fragmentos candidatos se envían a un
proveedor externo; no uses documentos reales para estas pruebas.

## Qué significa cada columna

| Columna | Qué comprobar |
| --- | --- |
| Exactitud | ¿La respuesta contiene todos los `expectedFacts` del caso, sin contradecirlos? `sí` / `parcial` / `no`. |
| Fidelidad | ¿Cada afirmación importante está respaldada por el texto de una fuente recuperada? `respaldada` / `parcial` / `sin respaldo`. |
| Citas | ¿Cada `[S#]` apunta a una fuente recuperada y esa fuente sostiene la afirmación? `válida` / `inválida`; anotá el `S#` y el problema. |
| Abstención | Para casos `answerable: false`: ¿reconoce que no hay evidencia? Para casos respondibles: ¿evita abstenerse cuando la evidencia alcanza? `correcta` / `incorrecta` / `n/a`. |
| Latencia | Tiempo de retrieval, generación y total si está disponible. |
| Uso | `promptTokens`, `completionTokens`, `totalTokens` y `cost` si el proveedor los devuelve. |

## Criterios de revisión

- **Exactitud:** todos los hechos esperados presentes y ninguno contradicho →
  `sí`; algunos presentes o una imprecisión menor → `parcial`; falta un hecho
  central o hay una contradicción → `no`.
- **Fidelidad:** toda afirmación factual importante tiene una cita que la
  sostiene → `respaldada`; alguna afirmación menor sin cita pero sin inventar →
  `parcial`; una afirmación importante no está en las fuentes o las contradice →
  `sin respaldo`.
- **Citas:** el ID citado existe entre las fuentes recuperadas **y** el excerpt
  de esa fuente contiene el dato citado → `válida`; un ID válido que apunta a un
  fragmento que no sostiene la afirmación cuenta como `inválida`.
- **Abstención:** en un caso no respondible, inventar un dato es `incorrecta`.
  En un caso respondible, decir “no hay evidencia” cuando el fragmento correcto
  sí estaba en las fuentes es `incorrecta` (sobre-abstención).
- **Citas inventadas:** el servidor elimina `[S#]` que no correspondan a fuentes
  recuperadas. Si la respuesta original del modelo las tenía, anotalo aunque no
  aparezcan en el texto final.

## Plantilla

Copiá esta tabla a una hoja de cálculo o a un archivo de trabajo. La primera
fila es un **ejemplo ilustrativo**, no un resultado real.

| Caso | Pregunta | Respuesta | Hechos esperados | Exactitud | Fidelidad | Citas | Abstención | Latencia (retrieval / generación / total) | Tokens (prompt / completion / total / costo) | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EJEMPLO q-01 | ¿Cuál es el código del contrato? | “El código es NA-2026-014 [S1].” | El código del contrato es NA-2026-014. | sí | respaldada | válida: S1 | n/a | 120 ms / 900 ms / 1020 ms | 800 / 40 / 840 / 0.0002 | Fila de ejemplo, no es una ejecución real. |
| q-01 |  |  |  |  |  |  |  |  |  |  |
| q-02 |  |  |  |  |  |  |  |  |  |  |
| q-03 |  |  |  |  |  |  |  |  |  |  |
| q-04 |  |  |  |  |  |  |  |  |  |  |
| q-05 |  |  |  |  |  |  |  |  |  |  |
| q-06 |  |  |  |  |  |  |  |  |  |  |
| q-07 |  |  |  |  |  |  |  |  |  |  |
| q-08 |  |  |  |  |  |  |  |  |  |  |
| q-09 |  |  |  |  |  |  |  |  |  |  |
| q-10 |  |  |  |  |  |  |  |  |  |  |
| q-11 |  |  |  |  |  |  |  |  |  |  |
| q-12 |  |  |  |  |  |  |  |  |  |  |
| q-13 |  |  |  |  |  |  |  |  |  |  |
| q-14 |  |  |  |  |  |  |  |  |  |  |
| q-15 |  |  |  |  |  |  |  |  |  |  |
| q-16 |  |  |  |  |  |  |  |  |  |  |
| q-17 |  |  |  |  |  |  |  |  |  |  |
| q-18 |  |  |  |  |  |  |  |  |  |  |
| q-19 |  |  |  |  |  |  |  |  |  |  |
| q-20 |  |  |  |  |  |  |  |  |  |  |
| q-21 |  |  |  |  |  |  |  |  |  |  |
| q-22 |  |  |  |  |  |  |  |  |  |  |
| q-23 |  |  |  |  |  |  |  |  |  |  |
| q-24 |  |  |  |  |  |  |  |  |  |  |
| q-25 |  |  |  |  |  |  |  |  |  |  |

## Cómo interpretar el resultado

- Si **Recall@k** es bajo, el fragmento correcto no llega a los candidatos:
  investigá chunking, embeddings, filtros, idioma o la estrategia de búsqueda.
- Si **Recall@k** es alto pero **MRR** es bajo, el fragmento aparece pero
  demasiado abajo: investigá el ranking, el reranking o el tamaño de `topK`.
- Si la recuperación es buena pero la **exactitud** o la **fidelidad** fallan,
  el problema está en el prompt, el modelo o el presupuesto de contexto.
- Si las **citas** fallan pero la respuesta es correcta, el problema está en la
  instrucción de citas o en la validación, no en la búsqueda.
- Si la **abstención** falla en casos no respondibles, el prompt está siendo
  demasiado permisivo o el modelo está completando con conocimiento general.

No agregues un LLM juez en este sprint. Un juez automático puede servir más
adelante, pero primero hace falta una muestra manual revisada que sirva como
referencia y un acuerdo explícito sobre los criterios.
