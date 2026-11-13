import "dotenv/config";

import path from "node:path";
import { fileURLToPath } from "node:url";

import { DocumentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getEmbeddingConfig, getEmbeddingModelInfo } from "@/lib/embeddings/config";
import { getNodeEmbeddingProvider } from "@/lib/embeddings/node-provider";
import { upsertEmbeddingBatch } from "@/lib/embeddings/store";
import {
  loadDatasetFromFiles,
  type FixtureDocument,
} from "@/lib/evaluation/dataset";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixturePath = path.join(
  projectRoot,
  "eval",
  "fixtures",
  "fictional-documents.json",
);
const goldSetPath = path.join(projectRoot, "eval", "gold-set.json");

// Sprint 6 gives every document an owner. The evaluation fixture uses its own
// non-login account so the CLI never bypasses the ownership filter and never
// mixes fictional documents with a real user's library.
const EVAL_FIXTURE_USER_ID = "eval-fixture-owner";
const EVAL_FIXTURE_EMAIL = "eval-fixture@local.invalid";

function pageText(chunks: readonly { content: string }[]): {
  text: string;
  offsets: Array<{ startChar: number; endChar: number }>;
} {
  let text = "";
  const offsets: Array<{ startChar: number; endChar: number }> = [];

  for (const chunk of chunks) {
    if (text.length > 0) {
      text += "\n\n";
    }

    const startChar = text.length;
    text += chunk.content;
    offsets.push({ startChar, endChar: text.length });
  }

  return { text, offsets };
}

function documentSizeBytes(document: FixtureDocument): number {
  return document.pages.reduce(
    (total, page) => total + Buffer.byteLength(pageText(page.chunks).text),
    0,
  );
}

async function main(): Promise<void> {
  const dataset = await loadDatasetFromFiles({ fixturePath, goldSetPath });
  const documentIds = dataset.fixture.documents.map((document) => document.id);
  const chunks = dataset.fixture.documents.flatMap((document) =>
    document.pages.flatMap((page) =>
      page.chunks.map((chunk) => ({
        id: chunk.id,
        content: chunk.content,
      })),
    ),
  );

  console.info(
    `[eval:seed] Fixture: ${dataset.fixture.documents.length} documents, ${chunks.length} chunks.`,
  );

  await prisma.$transaction(async (tx) => {
    await tx.document.deleteMany({
      where: { id: { in: documentIds } },
    });

    await tx.user.upsert({
      where: { id: EVAL_FIXTURE_USER_ID },
      update: {},
      create: {
        id: EVAL_FIXTURE_USER_ID,
        email: EVAL_FIXTURE_EMAIL,
        // Invalid Argon2id value: this account cannot authenticate.
        passwordHash: "!eval-fixture-no-login",
        name: "Evaluation fixture owner",
      },
    });

    for (const document of dataset.fixture.documents) {
      await tx.document.create({
        data: {
          id: document.id,
          userId: EVAL_FIXTURE_USER_ID,
          originalFilename: document.originalFilename,
          mimeType: document.mimeType,
          sizeBytes: documentSizeBytes(document),
          pageCount: document.pages.length,
          status: DocumentStatus.PROCESSED,
          pages: {
            create: document.pages.map((page) => {
              const built = pageText(page.chunks);

              return {
                id: page.id,
                pageNumber: page.pageNumber,
                text: built.text,
                chunks: {
                  create: page.chunks.map((chunk, chunkIndex) => ({
                    id: chunk.id,
                    chunkIndex,
                    content: chunk.content,
                    startChar: built.offsets[chunkIndex]?.startChar ?? 0,
                    endChar: built.offsets[chunkIndex]?.endChar ?? 0,
                  })),
                },
              };
            }),
          },
        },
      });
    }
  });

  const config = getEmbeddingConfig();
  const model = getEmbeddingModelInfo(config);
  const provider = await getNodeEmbeddingProvider();
  const rows: Array<{ chunkId: string; vector: number[] }> = [];

  for (let index = 0; index < chunks.length; index += config.batchSize) {
    const batch = chunks.slice(index, index + config.batchSize);
    const vectors = await provider.embedPassages(
      batch.map((chunk) => chunk.content),
    );

    vectors.forEach((vector, vectorIndex) => {
      const chunk = batch[vectorIndex];

      if (!chunk) {
        throw new Error("The embedding provider returned an extra vector.");
      }

      rows.push({ chunkId: chunk.id, vector });
    });

    console.info(
      `[eval:seed] Embedded ${Math.min(index + batch.length, chunks.length)}/${chunks.length} chunks.`,
    );
  }

  await upsertEmbeddingBatch(EVAL_FIXTURE_USER_ID, rows, model);

  console.info(
    `[eval:seed] Ready: ${rows.length} chunks with ${model.modelId}@${model.modelRevision} (${model.dimensions} dimensions).`,
  );
  console.info(
    "[eval:seed] The evaluation fixture is fictional and safe to send to an external provider if reranking is enabled.",
  );
}

main()
  .catch((error: unknown) => {
    console.error("[eval:seed] Failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
