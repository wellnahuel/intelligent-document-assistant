import "dotenv/config";

import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { prisma } from "@/lib/db";
import {
  getEmbeddingConfig,
  getEmbeddingModelInfo,
} from "@/lib/embeddings/config";
import { getNodeEmbeddingProvider } from "@/lib/embeddings/node-provider";
import { countDocumentEmbeddings } from "@/lib/embeddings/store";
import { loadDatasetFromFiles } from "@/lib/evaluation/dataset";
import {
  fileSha256,
  formatConsoleSummary,
  writeEvaluationReport,
  type EvaluationReport,
} from "@/lib/evaluation/report";
import { runEvaluation } from "@/lib/evaluation/run";
import { getRetrievalConfig } from "@/lib/retrieval/config";
import { createOpenRouterReranker } from "@/lib/retrieval/openrouter-reranker";
import type { Reranker } from "@/lib/retrieval/types";

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

function relativeToProject(absolutePath: string): string {
  return path.relative(projectRoot, absolutePath) || absolutePath;
}

function readPositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `${name} must be a positive integer; received "${value}".`,
    );
  }

  return parsed;
}

function timestampForFileName(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function assertFixtureIsSeeded(input: {
  documents: ReadonlyArray<{ id: string; chunkCount: number }>;
  model: ReturnType<typeof getEmbeddingModelInfo>;
  documentOwners: ReadonlyMap<string, string>;
}): Promise<void> {
  const counts = await Promise.all(
    input.documents.map(async (document) => ({
      ...document,
      embedded: await countDocumentEmbeddings(
        input.documentOwners.get(document.id) as string,
        document.id,
        input.model,
      ),
    })),
  );
  const missing = counts.filter(
    (document) => document.embedded < document.chunkCount,
  );

  if (missing.length > 0) {
    const detail = missing
      .map(
        (document) =>
          `${document.id}: ${document.embedded}/${document.chunkCount} embeddings`,
      )
      .join(", ");

    throw new Error(
      `The evaluation fixture is not seeded or its embeddings are stale (${detail}). Run "npm run eval:seed" first.`,
    );
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "top-k": { type: "string" },
      candidates: { type: "string" },
      "rrf-k": { type: "string" },
      "no-rerank": { type: "boolean", default: false },
      out: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.info(
      [
        "Usage: npm run eval:retrieval -- [options]",
        "",
        "  --top-k <n>       Metrics cutoff (default: EVAL_TOP_K or 5)",
        "  --candidates <n>  Candidates per source before RRF (default: RETRIEVAL_CANDIDATES or 20)",
        "  --rrf-k <n>       RRF constant (default: RETRIEVAL_RRF_K or 60)",
        "  --no-rerank       Skip reranking even when RERANK_MODEL is configured",
        "  --out <path>      Report path (default: eval/reports/retrieval-<timestamp>.json)",
        "",
        "The fixture must be seeded first with: npm run eval:seed",
      ].join("\n"),
    );
    return;
  }

  const config = getRetrievalConfig();
  const topK = readPositiveInteger(
    values["top-k"],
    config.evalTopK,
    "--top-k",
  );
  const candidates = readPositiveInteger(
    values.candidates,
    config.candidates,
    "--candidates",
  );
  const rrfK = readPositiveInteger(values["rrf-k"], config.rrfK, "--rrf-k");

  const dataset = await loadDatasetFromFiles({ fixturePath, goldSetPath });
  const embeddingConfig = getEmbeddingConfig();
  const model = getEmbeddingModelInfo(embeddingConfig);
  const fixtureDocuments = await prisma.document.findMany({
    where: {
      id: { in: dataset.fixture.documents.map((document) => document.id) },
    },
    select: { id: true, userId: true },
  });
  const documentOwners = new Map(
    fixtureDocuments.map((document) => [document.id, document.userId]),
  );
  const missingOwners = dataset.fixture.documents.filter(
    (document) => !documentOwners.has(document.id),
  );

  if (missingOwners.length > 0) {
    throw new Error(
      `The evaluation fixture is not seeded with an owner (${missingOwners
        .map((document) => document.id)
        .join(", ")}). Run "npm run eval:seed" first.`,
    );
  }

  await assertFixtureIsSeeded({
    documents: dataset.fixture.documents.map((document) => ({
      id: document.id,
      chunkCount: document.pages.reduce(
        (total, page) => total + page.chunks.length,
        0,
      ),
    })),
    model,
    documentOwners,
  });

  let reranker: Reranker | null = null;
  let rerankSkipReason: string | null = null;

  if (values["no-rerank"]) {
    rerankSkipReason = "disabled_by_flag";
  } else if (!config.rerank.enabled) {
    rerankSkipReason = config.rerank.disabledReason ?? "rerank_not_configured";
  } else if (config.rerank.apiKey && config.rerank.model) {
    reranker = createOpenRouterReranker({
      apiKey: config.rerank.apiKey,
      model: config.rerank.model,
      timeoutMs: config.rerank.timeoutMs,
    });
  } else {
    rerankSkipReason = "rerank_not_configured";
  }

  const provider = await getNodeEmbeddingProvider();
  const startedAt = new Date();
  const run = await runEvaluation({
    dataset,
    model,
    provider,
    config: { ...config, candidates, rrfK },
    topK,
    reranker,
    rerankSkipReason,
    documentOwners,
  });
  const answerableCaseCount = dataset.goldSet.cases.filter(
    (goldCase) => goldCase.answerable,
  ).length;
  const report: EvaluationReport = {
    schemaVersion: 1,
    generatedAt: startedAt.toISOString(),
    runtime: {
      node: process.version,
    },
    dataset: {
      fixturePath: relativeToProject(fixturePath),
      fixtureSha256: await fileSha256(fixturePath),
      goldSetPath: relativeToProject(goldSetPath),
      goldSetSha256: await fileSha256(goldSetPath),
      caseCount: dataset.goldSet.cases.length,
      answerableCaseCount,
      unanswerableCaseCount: dataset.goldSet.cases.length - answerableCaseCount,
    },
    retrieval: {
      topK,
      candidates,
      rrfK,
      meanEmbeddingMs: run.embeddingMs,
      embeddingModel: model,
      databaseProvider: "postgresql",
      precisionAtKDenominator: "k",
      notes: [
        "Precision@k divides by k, so missing positions count as non-relevant.",
        "Recall@k and MRR aggregates use answerable cases only; unanswerable cases belong to abstention evaluation.",
        "The query embedding is measured once per case and reported as meanEmbeddingMs; strategy latency excludes that shared embedding.",
        "RRF uses positions only. Cosine distance and lexical score are never added directly.",
        "The rerank strategy sends the query and candidate chunks to an external provider only when RERANK_MODEL and a key are configured.",
        "The fixture is fictional and non-sensitive; do not replace it with real documents when reranking is enabled.",
      ],
    },
    rerank: {
      enabled: reranker !== null,
      model: reranker?.model ?? config.rerank.model,
      topN: config.rerank.topN,
      disabledReason: reranker === null ? rerankSkipReason : null,
      meanLatencyMs: run.rerank.latencyMs,
      usage: run.rerank.usage,
      aborted: run.rerank.aborted,
      abortReason: run.rerank.abortReason,
    },
    strategies: run.strategies,
    cases: run.cases,
  };
  const outputPath = values.out
    ? path.resolve(projectRoot, values.out)
    : path.join(
        projectRoot,
        "eval",
        "reports",
        `retrieval-${timestampForFileName(startedAt)}.json`,
      );

  await writeEvaluationReport(report, outputPath);
  console.info(formatConsoleSummary(report));
  console.info("");
  console.info(`Report: ${relativeToProject(outputPath)}`);

  const failed = run.strategies.some(
    (strategy) => !strategy.skipped && strategy.failedCaseCount > 0,
  );

  if (failed) {
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error("[eval:retrieval] Failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
