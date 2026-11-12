import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { EmbeddingModelInfo } from "@/lib/embeddings/types";
import type {
  CaseResult,
  StrategyAggregate,
} from "@/lib/evaluation/run";
import type { RerankUsage } from "@/lib/retrieval/types";

/**
 * Machine-readable Sprint 5 evaluation report. It records the exact dataset
 * hashes, model, retrieval parameters and per-case ranks so two runs can be
 * compared without guessing which configuration produced them.
 */
export type EvaluationReport = {
  schemaVersion: 1;
  generatedAt: string;
  runtime: {
    node: string;
  };
  dataset: {
    fixturePath: string;
    fixtureSha256: string;
    goldSetPath: string;
    goldSetSha256: string;
    caseCount: number;
    answerableCaseCount: number;
    unanswerableCaseCount: number;
  };
  retrieval: {
    topK: number;
    candidates: number;
    rrfK: number;
    meanEmbeddingMs: number | null;
    embeddingModel: EmbeddingModelInfo;
    databaseProvider: "postgresql";
    precisionAtKDenominator: "k";
    notes: string[];
  };
  rerank: {
    enabled: boolean;
    model: string | null;
    topN: number;
    disabledReason: string | null;
    meanLatencyMs: number | null;
    usage: RerankUsage | null;
    aborted: boolean;
    abortReason: string | null;
  };
  strategies: StrategyAggregate[];
  cases: CaseResult[];
};

export async function fileSha256(filePath: string): Promise<string> {
  const contents = await readFile(filePath);

  return createHash("sha256").update(contents).digest("hex");
}

export async function writeEvaluationReport(
  report: EvaluationReport,
  outputPath: string,
): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function formatMetric(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(4);
}

function formatLatency(value: number | null): string {
  return value === null ? "n/a" : `${Math.round(value)} ms`;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value.padEnd(width, " ");
}

function formatMisses(
  report: EvaluationReport,
  strategy: StrategyAggregate["strategy"],
): string[] {
  const lines: string[] = [];

  for (const evaluationCase of report.cases) {
    if (!evaluationCase.answerable) {
      continue;
    }

    const result = evaluationCase.strategies.find(
      (candidate) => candidate.strategy === strategy,
    );

    if (!result || result.error !== null) {
      continue;
    }

    const missing = Object.entries(result.relevantRanks)
      .filter(([, rank]) => rank === null)
      .map(([chunkId]) => chunkId);
    const lower = Object.entries(result.relevantRanks)
      .filter(([, rank]) => rank !== null && rank > 1)
      .map(([chunkId, rank]) => `${chunkId}=${rank}`);

    if (missing.length === 0 && lower.length === 0) {
      continue;
    }

    const parts: string[] = [];

    if (missing.length > 0) {
      parts.push(`not found: ${missing.join(", ")}`);
    }

    if (lower.length > 0) {
      parts.push(`ranks: ${lower.join(", ")}`);
    }

    lines.push(`  ${evaluationCase.id}: ${parts.join("; ")}`);
  }

  return lines;
}

export function formatConsoleSummary(report: EvaluationReport): string {
  const lines: string[] = [
    `Evaluation: ${report.generatedAt}`,
    `Dataset: ${report.dataset.caseCount} cases (${report.dataset.answerableCaseCount} answerable, ${report.dataset.unanswerableCaseCount} unanswerable)`,
    `Embedding: ${report.retrieval.embeddingModel.modelId}@${report.retrieval.embeddingModel.modelRevision} (${report.retrieval.embeddingModel.dimensions} dimensions, mean ${formatLatency(report.retrieval.meanEmbeddingMs)})`,
    `Retrieval: topK=${report.retrieval.topK}, candidates=${report.retrieval.candidates}, RRF k=${report.retrieval.rrfK}, Precision@k denominator=k`,
    "",
    `${pad("Strategy", 15)} ${pad("Cases", 6)} ${pad(`Recall@${report.retrieval.topK}`, 10)} ${pad(`Precision@${report.retrieval.topK}`, 13)} ${pad("MRR", 8)} Mean latency`,
  ];

  for (const strategy of report.strategies) {
    if (strategy.skipped) {
      lines.push(
        `${pad(strategy.strategy, 15)} skipped (${strategy.skipReason ?? "unavailable"})`,
      );
      continue;
    }

    lines.push(
      `${pad(strategy.strategy, 15)} ${pad(String(strategy.caseCount), 6)} ${pad(formatMetric(strategy.recallAtK), 10)} ${pad(formatMetric(strategy.precisionAtK), 13)} ${pad(formatMetric(strategy.mrr), 8)} ${formatLatency(strategy.meanLatencyMs)}`,
    );
  }

  lines.push("");

  const denominatorNotes = report.strategies
    .filter(
      (strategy) =>
        !strategy.skipped &&
        strategy.metricCaseCount < strategy.answerableCaseCount,
    )
    .map(
      (strategy) =>
        `  ${strategy.strategy}: metrics over ${strategy.metricCaseCount}/${strategy.answerableCaseCount} answerable cases; ${strategy.failedCaseCount} failed`,
    );

  if (denominatorNotes.length > 0) {
    lines.push(...denominatorNotes);
    lines.push("");
  }

  for (const strategy of report.strategies) {
    if (strategy.skipped || strategy.failedCaseCount > 0) {
      continue;
    }

    const misses = formatMisses(report, strategy.strategy);

    if (misses.length > 0) {
      lines.push(`${strategy.strategy} misses:`);
      lines.push(...misses);
      lines.push("");
    }
  }

  if (report.rerank.aborted) {
    lines.push(
      `Rerank aborted after a failure: ${report.rerank.abortReason ?? "unknown reason"}`,
    );
  }

  return lines.join("\n").trimEnd();
}
