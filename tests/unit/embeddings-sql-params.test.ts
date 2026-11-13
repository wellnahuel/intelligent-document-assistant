import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
  documentChunk: { count: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma: db }));

import {
  findNearestChunksForUser,
  findNearestChunksForDocument,
  upsertEmbeddingBatch,
} from "@/lib/embeddings/store";

const MODEL = {
  modelId: "test/model",
  modelRevision: "rev-1",
  dimensions: 384,
};
const vector = Array.from(
  { length: 384 },
  (_, index) => ((index % 17) - 8) / 17,
);
const literal = `[${vector.join(",")}]`;

type SqlLike = {
  sql?: string;
  strings?: readonly string[];
  values?: readonly unknown[];
};

function textOf(sql: SqlLike): string {
  return sql.sql ?? sql.strings?.join("?") ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  db.$executeRaw.mockResolvedValue(1);
  db.$queryRaw.mockResolvedValue([]);
  db.documentChunk.count.mockResolvedValue(2);
});

describe("vector SQL parameterization", () => {
  it("binds upsert values instead of concatenating them into SQL", async () => {
    await upsertEmbeddingBatch(
      "user-1",
      [
        { chunkId: "chunk-1", vector },
        { chunkId: "chunk-2", vector },
      ],
      MODEL,
    );

    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    const arg = db.$executeRaw.mock.calls[0]?.[0] as SqlLike;
    const text = textOf(arg);

    expect(text).toContain('INSERT INTO "ChunkEmbedding"');
    expect(text).toContain(
      'ON CONFLICT ("chunkId", "modelId", "modelRevision")',
    );
    expect(text).toContain('"dimensions" = EXCLUDED."dimensions"');
    expect(text).not.toContain("chunk-1");
    expect(text).not.toContain("chunk-2");
    expect(text).not.toContain(MODEL.modelId);
    expect(text).not.toContain(MODEL.modelRevision);
    expect(text).not.toContain(literal);

    expect(arg.values).toEqual(
      expect.arrayContaining([
        "chunk-1",
        "chunk-2",
        MODEL.modelId,
        MODEL.modelRevision,
        384,
      ]),
    );
    expect(arg.values?.filter((value) => value === literal)).toHaveLength(2);
  });

  it("binds every search filter and limit while keeping ORDER BY ascending", async () => {
    await findNearestChunksForUser(vector, MODEL, "user-42", 7);

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const arg = db.$queryRaw.mock.calls[0]?.[0] as SqlLike;
    const text = textOf(arg);

    expect(text).toContain('e."modelId" =');
    expect(text).toContain('e."modelRevision" =');
    expect(text).toContain('e."dimensions" =');
    expect(text).toContain('d."userId" =');
    expect(text).toContain('ORDER BY e."embedding" <=>');
    expect(text).toContain("ASC");
    expect(text).toContain("LIMIT");

    expect(text).not.toContain(MODEL.modelId);
    expect(text).not.toContain(MODEL.modelRevision);
    expect(text).not.toContain(literal);
    expect(text).not.toContain("7");

    expect(arg.values).toEqual(
      expect.arrayContaining(["user-42", MODEL.modelId, MODEL.modelRevision, 384, 7]),
    );
    expect(arg.values?.filter((value) => value === literal)).toHaveLength(2);
  });

  it("binds the document filter for document-scoped retrieval", async () => {
    await findNearestChunksForDocument(vector, MODEL, "doc-42", "user-42", 5);

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const arg = db.$queryRaw.mock.calls[0]?.[0] as SqlLike;
    const text = textOf(arg);

    expect(text).toContain('p."documentId" =');
    expect(text).toContain('d."userId" =');
    expect(text).toContain('e."modelId" =');
    expect(text).toContain("ORDER BY e.\"embedding\" <=>");
    expect(text).toContain("LIMIT");
    expect(text).not.toContain("doc-42");
    expect(text).not.toContain(literal);

    expect(arg.values).toEqual(
      expect.arrayContaining([
        "user-42",
        MODEL.modelId,
        MODEL.modelRevision,
        384,
        "doc-42",
        5,
      ]),
    );
    expect(arg.values?.filter((value) => value === literal)).toHaveLength(2);
  });

  it("refuses to persist a batch containing a chunk outside the owner scope", async () => {
    db.documentChunk.count.mockResolvedValue(1);

    await expect(
      upsertEmbeddingBatch(
        "user-1",
        [
          { chunkId: "chunk-1", vector },
          { chunkId: "chunk-2", vector },
        ],
        MODEL,
      ),
    ).rejects.toThrow(/outside the authenticated user scope/);

    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it("does not run an upsert for an empty batch", async () => {
    await upsertEmbeddingBatch("user-1", [], MODEL);
    expect(db.documentChunk.count).not.toHaveBeenCalled();
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });
});
