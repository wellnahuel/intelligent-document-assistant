import { describe, expect, it } from "vitest";

import { sanitizeAnswerCitations } from "@/lib/rag/citations";
import { AppError } from "@/lib/errors";
import { generateAnswerFromChunks } from "@/lib/rag/generate";
import { parseAskRequest } from "@/lib/rag/input";
import { prepareRagPrompt } from "@/lib/rag/prompt";
import type { RetrievedChunk } from "@/lib/rag/types";

function chunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
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

describe("Sprint 4 verification probes", () => {
  it("S7 removes invented ids from mixed and adjacent citation groups", () => {
    const cases: Array<[string, string, string[]]> = [
      ["[S9]", "", []],
      ["[S1, S9]", "[S1]", ["S1"]],
      ["[S9, S1]", "[S1]", ["S1"]],
      ["[S1][S9]", "[S1]", ["S1"]],
      ["[S9][S1]", "[S1]", ["S1"]],
      ["[S1, S9, S2]", "[S1, S2]", ["S1", "S2"]],
    ];

    for (const [input, expectedText, expectedIds] of cases) {
      const result = sanitizeAnswerCitations(input, ["S1", "S2"]);
      expect(result.text).toBe(expectedText);
      expect(result.citedSourceIds).toEqual(expectedIds);
    }
  });

  it("S4/S7 keeps only budget-fitting sources and maps response labels to the same chunks", async () => {
    const chunks = [
      chunk({ chunkId: "c1", pageNumber: 1, content: "A".repeat(300) }),
      chunk({ chunkId: "c2", pageNumber: 2, content: "B".repeat(300) }),
      chunk({ chunkId: "c3", pageNumber: 3, content: "C".repeat(300) }),
    ];
    const prepared = prepareRagPrompt("¿Qué dice?", chunks, 500);

    expect(prepared.contextChars).toBeLessThanOrEqual(500);
    expect(prepared.sources.length).toBe(2);
    expect(prepared.sources.map((source) => source.sourceId)).toEqual([
      "S1",
      "S2",
    ]);
    expect(prepared.user).toContain("[S1]");
    expect(prepared.user).toContain("[S2]");
    expect(prepared.user).not.toContain("[S3]");
    expect(prepared.sources[1]?.contextText.endsWith("…")).toBe(true);
    expect(prepared.sources[1]?.excerpt.endsWith("…")).toBe(true);

    const result = await generateAnswerFromChunks({
      documentId: "doc-1",
      documentName: "contrato.pdf",
      question: "¿Qué dice?",
      chunks,
      maxContextChars: 500,
      retrieval: { topK: 5, retrievedCount: 3, indexedChunkCount: 3 },
      generate: async () => ({
        content: "Respuesta [S2] y una cita inventada [S9].",
        model: "test/model",
        finishReason: "stop",
        usage: null,
      }),
    });

    expect(result.answer).toBe("Respuesta [S2] y una cita inventada.");
    expect(result.citedSourceIds).toEqual(["S2"]);
    expect(result.sources.map((source) => source.sourceId)).toEqual([
      "S1",
      "S2",
    ]);
    expect(result.sources.map((source) => source.chunkId)).toEqual(["c1", "c2"]);
    expect(result.sources.some((source) => source.sourceId === "S9")).toBe(
      false,
    );
    expect(result.sources.find((source) => source.sourceId === "S1")?.cited).toBe(
      false,
    );
    expect(result.sources.find((source) => source.sourceId === "S2")?.cited).toBe(
      true,
    );
  });

  it("S4/S8 does not call the provider when the budget excludes every source", async () => {
    let called = false;

    const result = await generateAnswerFromChunks({
      documentId: "doc-1",
      documentName: "x.pdf",
      question: "q",
      chunks: [chunk({ documentName: "x".repeat(600) })],
      maxContextChars: 500,
      retrieval: { topK: 5, retrievedCount: 1, indexedChunkCount: 1 },
      generate: async () => {
        called = true;
        return { content: "no", model: "m", finishReason: "stop", usage: null };
      },
    });

    expect(called).toBe(false);
    expect(result.noEvidence).toBe(true);
    expect(result.noEvidenceReason).toBe("context_budget");
    expect(result.sources).toEqual([]);
  });

  it("S2 accepts exactly the configured maximum question length and rejects one more", () => {
    const max = 10;
    expect(
      parseAskRequest({ documentId: "cm123", question: "x".repeat(max) }, max)
        .question,
    ).toHaveLength(max);

    let caught: unknown;
    try {
      parseAskRequest(
        { documentId: "cm123", question: "x".repeat(max + 1) },
        max,
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).code).toBe("INVALID_ASK_QUESTION");
  });
});
