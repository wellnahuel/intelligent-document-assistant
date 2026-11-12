import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { LexicalHit } from "@/lib/retrieval/types";

/**
 * PostgreSQL full-text search over the `simple` configuration. `simple` only
 * lowercases and splits on token boundaries, so it does not depend on a
 * language-specific stemmer or stopword dictionary. Spanish and Italian
 * stemming are explicit future work.
 */
export type LexicalRow = {
  chunkId: string;
  content: string;
  chunkIndex: number;
  pageNumber: number;
  documentId: string;
  documentName: string;
  lexicalScore: number | string;
};

const LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;
const TERM_PATTERN = /[\p{L}\p{N}]+(?:[-_./:][\p{L}\p{N}]+)*/gu;
const MAX_LEXICAL_TERMS = 32;

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer; received ${value}.`);
  }
}

/**
 * Trims the query and returns `null` when it has no Unicode letter or number.
 * Blank, whitespace-only and punctuation-only inputs short-circuit before the
 * database. Stopwords are intentionally kept: with the `simple` configuration
 * there is no stopword dictionary, so a stopword-only query is a valid lexeme
 * search and `websearch_to_tsquery` does not error on it.
 */
export function normalizeLexicalQuery(query: string): string | null {
  const trimmed = query.trim();

  return LETTER_OR_NUMBER.test(trimmed) ? trimmed : null;
}

/**
 * Builds a `websearch_to_tsquery` expression that ORs the question's terms.
 *
 * Passing a whole question to `websearch_to_tsquery` joins every word with
 * AND, so a chunk has to contain all of them. Real questions almost never
 * satisfy that. OR keeps recall high and lets `ts_rank_cd` order chunks by how
 * many terms they match. Each term is quoted, so words such as "or" cannot be
 * reinterpreted as operators, and the result is still sent as a bind
 * parameter, never concatenated into SQL.
 */
export function buildLexicalTsQuery(query: string): string | null {
  if (normalizeLexicalQuery(query) === null) {
    return null;
  }

  const terms: string[] = [];
  const seen = new Set<string>();

  for (const match of query.matchAll(TERM_PATTERN)) {
    const term = match[0]?.toLowerCase();

    if (!term || seen.has(term)) {
      continue;
    }

    seen.add(term);
    terms.push(term);

    if (terms.length >= MAX_LEXICAL_TERMS) {
      break;
    }
  }

  if (terms.length === 0) {
    return null;
  }

  return terms.map((term) => `"${term}"`).join(" or ");
}

/**
 * Document-scoped lexical search. The document filter, the query and the limit
 * are all bound with `Prisma.sql`; nothing is concatenated into the statement.
 * The deterministic tie-break keeps repeated runs comparable.
 */
export async function searchLexicalChunks(input: {
  documentId: string;
  query: string;
  topK: number;
}): Promise<LexicalHit[]> {
  assertPositiveInteger(input.topK, "topK");

  const query = buildLexicalTsQuery(input.query);

  if (query === null) {
    return [];
  }

  const rows = await prisma.$queryRaw<LexicalRow[]>(Prisma.sql`
    SELECT
      c."id" AS "chunkId",
      c."content" AS "content",
      c."chunkIndex" AS "chunkIndex",
      p."pageNumber" AS "pageNumber",
      d."id" AS "documentId",
      d."originalFilename" AS "documentName",
      ts_rank_cd(
        to_tsvector('simple', c."content"),
        websearch_to_tsquery('simple', ${query})
      ) AS "lexicalScore"
    FROM "DocumentChunk" c
    JOIN "DocumentPage" p ON p."id" = c."documentPageId"
    JOIN "Document" d ON d."id" = p."documentId"
    WHERE p."documentId" = ${input.documentId}
      AND to_tsvector('simple', c."content")
        @@ websearch_to_tsquery('simple', ${query})
    ORDER BY "lexicalScore" DESC, c."id" ASC
    LIMIT ${input.topK}
  `);

  return rows.map((row) => {
    const lexicalScore = Number(row.lexicalScore);

    if (!Number.isFinite(lexicalScore)) {
      throw new Error(
        `PostgreSQL returned a non-finite lexical score for chunk "${row.chunkId}".`,
      );
    }

    return {
      chunkId: row.chunkId,
      documentId: row.documentId,
      documentName: row.documentName,
      pageNumber: row.pageNumber,
      chunkIndex: row.chunkIndex,
      content: row.content,
      score: lexicalScore,
      lexicalScore,
    };
  });
}
