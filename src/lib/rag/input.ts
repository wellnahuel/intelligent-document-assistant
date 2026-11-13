import { z } from "zod";

import { assertDocumentId } from "@/lib/documents/id";
import type { AskRequestInput } from "@/lib/rag/types";
import { AppError } from "@/lib/errors";

const askRequestSchema = z
  .object({
    documentId: z.string(),
    question: z.string(),
  })
  .strict();

export function parseAskRequest(
  raw: unknown,
  questionMaxChars: number,
): AskRequestInput {
  const parsed = askRequestSchema.safeParse(raw);

  if (!parsed.success) {
    throw new AppError(
      "INVALID_REQUEST_BODY",
      "El cuerpo de la solicitud debe incluir documentId y question como texto.",
    );
  }

  const documentId = parsed.data.documentId.trim();
  assertDocumentId(documentId);

  const question = parsed.data.question.trim();

  if (question.length === 0) {
    throw new AppError(
      "INVALID_ASK_QUESTION",
      "Escribí una pregunta para consultar el documento.",
    );
  }

  if (question.length > questionMaxChars) {
    throw new AppError(
      "INVALID_ASK_QUESTION",
      `La pregunta no puede superar los ${questionMaxChars} caracteres.`,
    );
  }

  return { documentId, question };
}
