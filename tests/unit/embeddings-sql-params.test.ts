import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: db }));

import {
  findNearestChunks,
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
});

describe("vector SQL parameterization", () => {
  it("binds upsert values instead of concatenating them into SQL", async () => {
    await upsertEmbeddingBatch(
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
    await findNearestChunks(vector, MODEL, 7);

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const arg = db.$queryRaw.mock.calls[0]?.[0] as SqlLike;
    const text = textOf(arg);

    expect(text).toContain('e."modelId" =');
    expect(text).toContain('e."modelRevision" =');
    expect(text).toContain('e."dimensions" =');
    expect(text).toContain('ORDER BY e."embedding" <=>');
    expect(text).toContain("ASC");
    expect(text).toContain("LIMIT");

    expect(text).not.toContain(MODEL.modelId);
    expect(text).not.toContain(MODEL.modelRevision);
    expect(text).not.toContain(literal);
    expect(text).not.toContain("7");

    expect(arg.values).toEqual(
      expect.arrayContaining([MODEL.modelId, MODEL.modelRevision, 384, 7]),
    );
    expect(arg.values?.filter((value) => value === literal)).toHaveLength(2);
  });

  it("does not run an upsert for an empty batch", async () => {
    await upsertEmbeddingBatch([], MODEL);
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });
});
