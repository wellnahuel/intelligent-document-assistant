import { sanitizeAnswerCitations } from "@/lib/rag/citations";
import { prepareRagPrompt } from "@/lib/rag/prompt";
import type {
  OpenRouterCompletion,
  RagAnswerDto,
  RagNoEvidenceReason,
  RagRetrievalInfo,
  RetrievedChunk,
} from "@/lib/rag/types";

export type GenerateCompletion = (prompt: {
  system: string;
  user: string;
}) => Promise<OpenRouterCompletion>;

export type NoEvidenceInput = {
  documentId: string;
  documentName: string;
  question: string;
  reason: RagNoEvidenceReason;
  retrieval: RagRetrievalInfo;
};

export function createNoEvidenceAnswer(input: NoEvidenceInput): RagAnswerDto {
  const answer =
    input.reason === "no_embeddings"
      ? "No se encontró evidencia suficiente: el documento todavía no tiene embeddings compatibles con el modelo actual. Generá sus embeddings antes de preguntar."
      : "No se encontró evidencia suficiente dentro del límite de contexto configurado.";

  return {
    documentId: input.documentId,
    documentName: input.documentName,
    question: input.question,
    answer,
    sources: [],
    citedSourceIds: [],
    noEvidence: true,
    noEvidenceReason: input.reason,
    model: null,
    usage: null,
    contextChars: 0,
    retrieval: input.retrieval,
  };
}

export async function generateAnswerFromChunks(input: {
  documentId: string;
  documentName: string;
  question: string;
  chunks: readonly RetrievedChunk[];
  maxContextChars: number;
  retrieval: RagRetrievalInfo;
  generate: GenerateCompletion;
}): Promise<RagAnswerDto> {
  const prepared = prepareRagPrompt(
    input.question,
    input.chunks,
    input.maxContextChars,
  );

  if (prepared.sources.length === 0) {
    return createNoEvidenceAnswer({
      documentId: input.documentId,
      documentName: input.documentName,
      question: input.question,
      reason: "context_budget",
      retrieval: input.retrieval,
    });
  }

  const completion = await input.generate({
    system: prepared.system,
    user: prepared.user,
  });

  const sanitized = sanitizeAnswerCitations(
    completion.content,
    prepared.sources.map((source) => source.sourceId),
  );
  const cited = new Set(sanitized.citedSourceIds);

  return {
    documentId: input.documentId,
    documentName: input.documentName,
    question: input.question,
    answer:
      sanitized.text.length > 0
        ? sanitized.text
        : "El modelo no devolvió una respuesta utilizable.",
    sources: prepared.sources.map((source) => ({
      sourceId: source.sourceId,
      documentId: source.documentId,
      documentName: source.documentName,
      pageNumber: source.pageNumber,
      chunkId: source.chunkId,
      excerpt: source.excerpt,
      retrievalDistance: source.retrievalDistance,
      cited: cited.has(source.sourceId),
    })),
    citedSourceIds: prepared.sources
      .filter((source) => cited.has(source.sourceId))
      .map((source) => source.sourceId),
    noEvidence: false,
    noEvidenceReason: null,
    model: completion.model,
    usage: completion.usage,
    contextChars: prepared.contextChars,
    retrieval: input.retrieval,
  };
}
