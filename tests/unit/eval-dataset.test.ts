import { describe, expect, it } from "vitest";

import {
  DatasetValidationError,
  parseFixture,
  parseGoldSet,
  validateDataset,
  type Fixture,
  type GoldSet,
} from "@/lib/evaluation/dataset";

function fixture(): Fixture {
  return {
    documents: [
      {
        id: "doc-a",
        originalFilename: "doc-a.txt",
        mimeType: "text/plain",
        pages: [
          {
            id: "page-a-1",
            pageNumber: 1,
            chunks: [
              { id: "chunk-a-1", content: "El aviso es de treinta días." },
              { id: "chunk-a-2", content: "El código es ESC-104." },
            ],
          },
        ],
      },
      {
        id: "doc-b",
        originalFilename: "doc-b.txt",
        mimeType: "text/plain",
        pages: [
          {
            id: "page-b-1",
            pageNumber: 1,
            chunks: [{ id: "chunk-b-1", content: "El filtro es FLT-450-A." }],
          },
        ],
      },
    ],
  };
}

function goldSet(): GoldSet {
  return {
    version: 1,
    cases: [
      {
        id: "q-01",
        question: "¿Cuántos días de aviso hay?",
        documentId: "doc-a",
        relevantChunkIds: ["chunk-a-1"],
        answerable: true,
        expectedFacts: ["Treinta días."],
      },
      {
        id: "q-02",
        question: "¿Cuál es el teléfono del propietario?",
        documentId: "doc-a",
        relevantChunkIds: [],
        answerable: false,
        expectedFacts: [],
      },
    ],
  };
}

describe("evaluation dataset validation", () => {
  it("maps fixture chunks to their document, page and order", () => {
    const validated = validateDataset(fixture(), goldSet());
    const chunk = validated.chunksById.get("chunk-a-2");

    expect(chunk).toMatchObject({
      documentId: "doc-a",
      documentName: "doc-a.txt",
      pageNumber: 1,
      chunkIndex: 1,
    });
    expect(validated.documentsById.has("doc-b")).toBe(true);
  });

  it("rejects duplicate case ids", () => {
    const set = goldSet();
    set.cases.push({ ...set.cases[0]! });

    expect(() => validateDataset(fixture(), set)).toThrow(
      /Duplicate gold set case id/,
    );
  });

  it("rejects an unknown document reference", () => {
    const set = goldSet();
    set.cases[0]!.documentId = "doc-missing";

    expect(() => validateDataset(fixture(), set)).toThrow(
      /unknown document/,
    );
  });

  it("rejects an unknown chunk reference", () => {
    const set = goldSet();
    set.cases[0]!.relevantChunkIds = ["chunk-missing"];

    expect(() => validateDataset(fixture(), set)).toThrow(/unknown chunk/);
  });

  it("rejects a relevant chunk owned by another document", () => {
    const set = goldSet();
    set.cases[0]!.relevantChunkIds = ["chunk-b-1"];

    expect(() => validateDataset(fixture(), set)).toThrow(
      /from document "doc-b"/,
    );
  });

  it("rejects an answerable case without relevant chunks", () => {
    const set = goldSet();
    set.cases[0]!.relevantChunkIds = [];

    expect(() => validateDataset(fixture(), set)).toThrow(
      /answerable but has no relevant chunk ids/,
    );
  });

  it("rejects an unanswerable case with relevant chunks", () => {
    const set = goldSet();
    set.cases[1]!.relevantChunkIds = ["chunk-a-1"];

    expect(() => validateDataset(fixture(), set)).toThrow(
      /unanswerable but lists relevant chunk ids/,
    );
  });

  it("rejects an unanswerable case with expected facts", () => {
    const set = goldSet();
    set.cases[1]!.expectedFacts = ["Dato inventado"];

    expect(() => validateDataset(fixture(), set)).toThrow(
      /unanswerable but lists expected facts/,
    );
  });

  it("reports schema issues with their path", () => {
    expect(() => parseFixture({ documents: [{ id: "" }] })).toThrow(
      /documents\.0/,
    );
    expect(() => parseGoldSet({ version: 2, cases: [] })).toThrow(
      /version/,
    );
  });

  it("exposes a typed validation error", () => {
    expect(() => parseGoldSet({})).toThrow(DatasetValidationError);
  });
});
