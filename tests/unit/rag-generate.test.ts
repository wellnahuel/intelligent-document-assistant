import { describe, expect, it, vi } from "vitest";

import { generateAnswerFromChunks } from "@/lib/rag/generate";
import type { RetrievedChunk } from "@/lib/rag/types";

const RETRIEVAL = {
  topK: 5,
  retrievedCount: 2,
  indexedChunkCount: 2,
};

function makeChunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    chunkId: "chunk-1",
    documentId: "doc-1",
    documentName: "contrato.pdf",
    pageNumber: 4,
    chunkIndex: 0,
    content:
      "El cliente podrá cancelar el servicio dando aviso con treinta días de anticipación.",
    distance: 0.12,
    ...overrides,
  };
}

const COMPLETION = {
  content: "El contrato pide treinta días de aviso [S1]. La garantía es de dos años [S9].",
  model: "test/model",
  finishReason: "stop",
  usage: {
    promptTokens: 100,
    completionTokens: 20,
    totalTokens: 120,
    cost: null,
  },
};

describe("RAG answer generation", () => {
  it("does not call the provider when there are no sources", async () => {
    const generate = vi.fn(async () => COMPLETION);

    const result = await generateAnswerFromChunks({
      documentId: "doc-1",
      documentName: "contrato.pdf",
      question: "¿Qué dice?",
      chunks: [],
      maxContextChars: 8000,
      retrieval: { ...RETRIEVAL, retrievedCount: 0, indexedChunkCount: 0 },
      generate,
    });

    expect(generate).not.toHaveBeenCalled();
    expect(result.noEvidence).toBe(true);
    expect(result.noEvidenceReason).toBe("context_budget");
    expect(result.sources).toEqual([]);
    expect(result.answer).toContain("No se encontró evidencia suficiente");
  });

  it("returns only retrieved source metadata and sanitizes invented ids", async () => {
    const result = await generateAnswerFromChunks({
      documentId: "doc-1",
      documentName: "contrato.pdf",
      question: "¿Cuántos días de aviso pide el contrato?",
      chunks: [
        makeChunk(),
        makeChunk({
          chunkId: "chunk-2",
          pageNumber: 8,
          chunkIndex: 1,
          content: "El pago vence el primer día hábil de cada mes.",
          distance: 0.35,
        }),
      ],
      maxContextChars: 8000,
      retrieval: RETRIEVAL,
      generate: async () => COMPLETION,
    });

    expect(result.answer).toBe(
      "El contrato pide treinta días de aviso [S1]. La garantía es de dos años.",
    );
    expect(result.citedSourceIds).toEqual(["S1"]);
    expect(result.sources).toEqual([
      expect.objectContaining({
        sourceId: "S1",
        chunkId: "chunk-1",
        documentId: "doc-1",
        documentName: "contrato.pdf",
        pageNumber: 4,
        retrievalDistance: 0.12,
        cited: true,
      }),
      expect.objectContaining({
        sourceId: "S2",
        chunkId: "chunk-2",
        pageNumber: 8,
        cited: false,
      }),
    ]);
    expect(result.sources.some((source) => source.sourceId === "S9")).toBe(
      false,
    );
    expect(result.sources.some((source) => source.pageNumber === 99)).toBe(
      false,
    );
  });

  it("marks every source as not cited when the model omits citations", async () => {
    const result = await generateAnswerFromChunks({
      documentId: "doc-1",
      documentName: "contrato.pdf",
      question: "¿Qué dice?",
      chunks: [makeChunk()],
      maxContextChars: 8000,
      retrieval: { ...RETRIEVAL, retrievedCount: 1, indexedChunkCount: 1 },
      generate: async () => ({
        ...COMPLETION,
        content: "No se encontró evidencia suficiente.",
      }),
    });

    expect(result.citedSourceIds).toEqual([]);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.cited).toBe(false);
  });
});
