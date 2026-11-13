import { readFile } from "node:fs/promises";

import { z } from "zod";

/**
 * Typed evaluation dataset. The fixture is fictional and owns deterministic
 * ids; the gold set references those ids so a retrieval report can be
 * reproduced without depending on freshly generated cuids.
 */

export const fixtureChunkSchema = z.object({
  id: z.string().trim().min(1),
  content: z.string().trim().min(1),
});

export const fixturePageSchema = z.object({
  id: z.string().trim().min(1),
  pageNumber: z.number().int().positive(),
  chunks: z.array(fixtureChunkSchema),
});

export const fixtureDocumentSchema = z.object({
  id: z.string().trim().min(1),
  originalFilename: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  pages: z.array(fixturePageSchema).min(1),
});

export const fixtureSchema = z.object({
  documents: z.array(fixtureDocumentSchema).min(1),
});

export const goldCaseSchema = z.object({
  id: z.string().trim().min(1),
  question: z.string().trim().min(1),
  documentId: z.string().trim().min(1),
  relevantChunkIds: z.array(z.string().trim().min(1)),
  answerable: z.boolean(),
  expectedFacts: z.array(z.string().trim().min(1)).optional(),
});

export const goldSetSchema = z.object({
  version: z.literal(1),
  cases: z.array(goldCaseSchema).min(1),
});

export type FixtureChunk = z.infer<typeof fixtureChunkSchema>;
export type FixturePage = z.infer<typeof fixturePageSchema>;
export type FixtureDocument = z.infer<typeof fixtureDocumentSchema>;
export type Fixture = z.infer<typeof fixtureSchema>;
export type GoldCase = z.infer<typeof goldCaseSchema>;
export type GoldSet = z.infer<typeof goldSetSchema>;

export type FixtureChunkLocation = {
  chunk: FixtureChunk;
  documentId: string;
  documentName: string;
  pageNumber: number;
  chunkIndex: number;
};

export type ValidatedDataset = {
  fixture: Fixture;
  goldSet: GoldSet;
  documentsById: Map<string, FixtureDocument>;
  chunksById: Map<string, FixtureChunkLocation>;
};

export class DatasetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatasetValidationError";
  }
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";

      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function parseFixture(raw: unknown): Fixture {
  const parsed = fixtureSchema.safeParse(raw);

  if (!parsed.success) {
    throw new DatasetValidationError(
      `The evaluation fixture is invalid: ${formatIssues(parsed.error)}`,
    );
  }

  return parsed.data;
}

export function parseGoldSet(raw: unknown): GoldSet {
  const parsed = goldSetSchema.safeParse(raw);

  if (!parsed.success) {
    throw new DatasetValidationError(
      `The gold set is invalid: ${formatIssues(parsed.error)}`,
    );
  }

  return parsed.data;
}

/**
 * Checks referential integrity between the fixture and the gold set before a
 * single embedding or SQL query runs. A typo in a chunk id must fail loudly,
 * not silently turn a relevant case into a miss.
 */
export function validateDataset(
  fixture: Fixture,
  goldSet: GoldSet,
): ValidatedDataset {
  const documentsById = new Map<string, FixtureDocument>();
  const chunksById = new Map<string, FixtureChunkLocation>();
  const pageIds = new Set<string>();

  for (const document of fixture.documents) {
    if (documentsById.has(document.id)) {
      throw new DatasetValidationError(
        `Duplicate fixture document id "${document.id}".`,
      );
    }

    documentsById.set(document.id, document);

    for (const page of document.pages) {
      if (pageIds.has(page.id)) {
        throw new DatasetValidationError(
          `Duplicate fixture page id "${page.id}".`,
        );
      }

      pageIds.add(page.id);

      page.chunks.forEach((chunk, chunkIndex) => {
        if (chunksById.has(chunk.id)) {
          throw new DatasetValidationError(
            `Duplicate fixture chunk id "${chunk.id}".`,
          );
        }

        chunksById.set(chunk.id, {
          chunk,
          documentId: document.id,
          documentName: document.originalFilename,
          pageNumber: page.pageNumber,
          chunkIndex,
        });
      });
    }
  }

  const caseIds = new Set<string>();

  for (const goldCase of goldSet.cases) {
    if (caseIds.has(goldCase.id)) {
      throw new DatasetValidationError(
        `Duplicate gold set case id "${goldCase.id}".`,
      );
    }

    caseIds.add(goldCase.id);

    if (!documentsById.has(goldCase.documentId)) {
      throw new DatasetValidationError(
        `Case "${goldCase.id}" references unknown document "${goldCase.documentId}".`,
      );
    }

    if (goldCase.answerable && goldCase.relevantChunkIds.length === 0) {
      throw new DatasetValidationError(
        `Case "${goldCase.id}" is answerable but has no relevant chunk ids.`,
      );
    }

    if (!goldCase.answerable && goldCase.relevantChunkIds.length > 0) {
      throw new DatasetValidationError(
        `Case "${goldCase.id}" is unanswerable but lists relevant chunk ids.`,
      );
    }

    if (!goldCase.answerable && (goldCase.expectedFacts?.length ?? 0) > 0) {
      throw new DatasetValidationError(
        `Case "${goldCase.id}" is unanswerable but lists expected facts.`,
      );
    }

    for (const chunkId of goldCase.relevantChunkIds) {
      const location = chunksById.get(chunkId);

      if (!location) {
        throw new DatasetValidationError(
          `Case "${goldCase.id}" references unknown chunk "${chunkId}".`,
        );
      }

      if (location.documentId !== goldCase.documentId) {
        throw new DatasetValidationError(
          `Case "${goldCase.id}" references chunk "${chunkId}" from document "${location.documentId}", not "${goldCase.documentId}".`,
        );
      }
    }
  }

  return {
    fixture,
    goldSet,
    documentsById,
    chunksById,
  };
}

async function readJsonFile(path: string): Promise<unknown> {
  let raw: string;

  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new DatasetValidationError(
      `Could not read evaluation file "${path}": ${message}`,
    );
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new DatasetValidationError(
      `Evaluation file "${path}" is not valid JSON: ${message}`,
    );
  }
}

export async function loadDatasetFromFiles(input: {
  fixturePath: string;
  goldSetPath: string;
}): Promise<ValidatedDataset> {
  const [fixtureRaw, goldSetRaw] = await Promise.all([
    readJsonFile(input.fixturePath),
    readJsonFile(input.goldSetPath),
  ]);

  return validateDataset(parseFixture(fixtureRaw), parseGoldSet(goldSetRaw));
}
