import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: db }));

import {
  buildLexicalTsQuery,
  normalizeLexicalQuery,
  searchLexicalChunks,
} from "@/lib/retrieval/lexical";

type SqlLike = {
  sql?: string;
  strings?: readonly string[];
  values?: readonly unknown[];
};

function sqlText(sql: SqlLike): string {
  return sql.sql ?? sql.strings?.join("?") ?? "";
}

const ROW = {
  chunkId: "chunk-7",
  content: "The contract requires thirty days of written notice.",
  chunkIndex: 3,
  pageNumber: 2,
  documentId: "doc-demo",
  documentName: "demo-contract.pdf",
  lexicalScore: "0.06079271",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.$queryRaw.mockResolvedValue([]);
});

describe("normalizeLexicalQuery", () => {
  it("trims queries that contain letters or numbers", () => {
    expect(normalizeLexicalQuery("  notice period  ")).toBe("notice period");
    expect(normalizeLexicalQuery("2024")).toBe("2024");
    expect(normalizeLexicalQuery("Año 2025")).toBe("Año 2025");
  });

  it("keeps stopword-only queries because the simple configuration has no stopwords", () => {
    expect(normalizeLexicalQuery("the and of")).toBe("the and of");
  });

  it("returns null for blank, whitespace-only and punctuation-only queries", () => {
    expect(normalizeLexicalQuery("")).toBeNull();
    expect(normalizeLexicalQuery("   \n\t ")).toBeNull();
    expect(normalizeLexicalQuery("...!!!---")).toBeNull();
    expect(normalizeLexicalQuery("—–🔥")).toBeNull();
  });
});

describe("buildLexicalTsQuery", () => {
  it("ORs normalized question terms instead of requiring every word", () => {
    expect(buildLexicalTsQuery("¿Cuál es el código del contrato?")).toBe(
      '"cuál" or "es" or "el" or "código" or "del" or "contrato"',
    );
  });

  it("preserves exact codes and removes case-insensitive duplicates", () => {
    expect(buildLexicalTsQuery("ESC-104 esc-104 FLT-450-A")).toBe(
      '"esc-104" or "flt-450-a"',
    );
  });

  it("returns null when every token is punctuation", () => {
    expect(buildLexicalTsQuery("...!!!---")).toBeNull();
  });
});

describe("searchLexicalChunks", () => {
  it.each(["", "   ", "\n\t", "...", "?!—🔥"])(
    "returns no results without querying the database for %j",
    async (query) => {
      await expect(
        searchLexicalChunks({ documentId: "doc-demo", query, topK: 5 }),
      ).resolves.toEqual([]);

      expect(db.$queryRaw).not.toHaveBeenCalled();
    },
  );

  it("runs a stopword-only query instead of rejecting it", async () => {
    await searchLexicalChunks({
      documentId: "doc-demo",
      query: "the and of",
      topK: 5,
    });

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("binds documentId, query and topK while preserving citation metadata", async () => {
    db.$queryRaw.mockResolvedValue([ROW]);

    const result = await searchLexicalChunks({
      documentId: "doc-demo",
      query: "notice period",
      topK: 5,
    });

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const arg = db.$queryRaw.mock.calls[0]?.[0] as SqlLike;
    const text = sqlText(arg);

    expect(text).toContain("ts_rank_cd");
    expect(text).toContain("to_tsvector('simple', c.\"content\")");
    expect(text).toContain("websearch_to_tsquery('simple',");
    expect(text).toContain("@@");
    expect(text).toContain('p."documentId" =');
    expect(text).toContain('ORDER BY "lexicalScore" DESC, c."id" ASC');
    expect(text).toContain("LIMIT");
    expect(text).not.toContain("doc-demo");
    expect(text).not.toContain("notice period");
    expect(text).not.toContain("LIMIT 5");

    const tsQuery = '"notice" or "period"';

    expect(arg.values).toEqual(
      expect.arrayContaining(["doc-demo", tsQuery, 5]),
    );
    expect(arg.values?.filter((value) => value === tsQuery)).toHaveLength(2);

    expect(result).toEqual([
      {
        chunkId: ROW.chunkId,
        content: ROW.content,
        chunkIndex: ROW.chunkIndex,
        pageNumber: ROW.pageNumber,
        documentId: ROW.documentId,
        documentName: ROW.documentName,
        score: 0.06079271,
        lexicalScore: 0.06079271,
      },
    ]);
  });

  it("keeps quoted and punctuated queries parameterized", async () => {
    const query = `owner's "notice" & termination`;

    await searchLexicalChunks({ documentId: "doc-demo", query, topK: 3 });

    const arg = db.$queryRaw.mock.calls[0]?.[0] as SqlLike;
    const tsQuery = '"owner" or "s" or "notice" or "termination"';

    expect(sqlText(arg)).not.toContain("owner's");
    expect(arg.values?.filter((value) => value === tsQuery)).toHaveLength(2);
  });

  it.each([0, -2, 1.5, Number.NaN])(
    "rejects invalid topK %s without querying the database",
    async (topK) => {
      await expect(
        searchLexicalChunks({ documentId: "doc-demo", query: "notice", topK }),
      ).rejects.toThrow(/topK must be a positive integer/);

      expect(db.$queryRaw).not.toHaveBeenCalled();
    },
  );

  it("rejects a non-finite lexical score", async () => {
    db.$queryRaw.mockResolvedValue([{ ...ROW, lexicalScore: "Infinity" }]);

    await expect(
      searchLexicalChunks({
        documentId: "doc-demo",
        query: "notice period",
        topK: 5,
      }),
    ).rejects.toThrow(/non-finite lexical score/);
  });
});
