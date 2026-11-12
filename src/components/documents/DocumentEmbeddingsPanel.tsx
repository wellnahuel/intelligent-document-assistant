"use client";

import { useEffect, useState } from "react";

import { readErrorMessage } from "@/lib/client/read-error";
import type {
  DocumentEmbeddingSummaryDto,
  EmbeddingGenerationErrorDto,
  EmbeddingGenerationResultDto,
} from "@/lib/embeddings/types";

import styles from "./DocumentEmbeddingsPanel.module.css";

type PanelStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; message: string }
  | { kind: "partial"; message: string; errors: string[] }
  | { kind: "error"; message: string };

type DocumentEmbeddingsPanelProps = {
  documentId: string;
  initialSummary: DocumentEmbeddingSummaryDto;
};

type ChunksRegeneratedDetail = {
  documentId: string;
  chunkCount: number;
};

const GENERIC_ERROR =
  "No se pudieron generar los embeddings. Intenta nuevamente.";

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function shortRevision(revision: string): string {
  return revision.length > 12 ? `${revision.slice(0, 12)}…` : revision;
}

function formatBatchError(error: EmbeddingGenerationErrorDto): string {
  const stage = error.stage === "embedding" ? "modelo" : "base de datos";

  return `Lote ${error.batch} (${stage}): ${error.message}`;
}

export function DocumentEmbeddingsPanel({
  documentId,
  initialSummary,
}: DocumentEmbeddingsPanelProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [status, setStatus] = useState<PanelStatus>({ kind: "idle" });

  const isLoading = status.kind === "loading";
  const hasChunks = summary.chunkCount > 0;
  const hasEmbeddings = summary.embeddedChunkCount > 0;
  const isComplete =
    hasChunks && summary.embeddedChunkCount >= summary.chunkCount;

  useEffect(() => {
    function handleChunksRegenerated(event: Event) {
      const detail = (event as CustomEvent<ChunksRegeneratedDetail>).detail;

      if (detail?.documentId !== documentId) {
        return;
      }

      setSummary((current) => ({
        ...current,
        chunkCount: detail.chunkCount,
        embeddedChunkCount: 0,
      }));
      setStatus({ kind: "idle" });
    }

    window.addEventListener(
      "document-chunks-regenerated",
      handleChunksRegenerated,
    );

    return () => {
      window.removeEventListener(
        "document-chunks-regenerated",
        handleChunksRegenerated,
      );
    };
  }, [documentId]);

  async function handleGenerate(regenerate: boolean) {
    setStatus({ kind: "loading" });

    try {
      const response = await fetch(
        `/api/documents/${documentId}/embeddings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ regenerate }),
        },
      );
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setStatus({
          kind: "error",
          message: readErrorMessage(payload) ?? GENERIC_ERROR,
        });
        return;
      }

      const result = payload as EmbeddingGenerationResultDto;

      setSummary((current) => ({
        ...current,
        model: result.model,
        chunkCount: result.chunkCount,
        embeddedChunkCount: result.embeddedChunkCount,
      }));

      if (result.status === "complete") {
        setStatus({
          kind: "success",
          message:
            result.generatedCount === 0
              ? "Todos los fragmentos ya tenían embeddings para este modelo."
              : `Se generaron ${result.generatedCount} ${pluralize(
                  result.generatedCount,
                  "embedding",
                  "embeddings",
                )}${
                  result.skippedCount > 0
                    ? ` y se omitieron ${result.skippedCount} ya existentes`
                    : ""
                }.`,
        });
        return;
      }

      if (result.status === "partial") {
        setStatus({
          kind: "partial",
          message: `Se generaron ${result.generatedCount} de ${
            result.chunkCount
          } fragmentos; fallaron ${result.failedCount}. Los fragmentos que no se pudieron regenerar conservan su versión anterior.`,
          errors: result.errors.map(formatBatchError),
        });
        return;
      }

      if (result.status === "failed") {
        setStatus({
          kind: "error",
          message: `No se pudo generar ningún embedding: fallaron ${result.failedCount} ${pluralize(
            result.failedCount,
            "fragmento",
            "fragmentos",
          )}.`,
        });
      }
    } catch {
      setStatus({ kind: "error", message: GENERIC_ERROR });
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="embeddings-titulo">
      <div className={styles.header}>
        <div className={styles.text}>
          <h2 id="embeddings-titulo" className={styles.title}>
            Embeddings
          </h2>
          <p className={styles.modelLine}>
            Modelo <code>{summary.model.modelId}</code> · revisión{" "}
            <code title={summary.model.modelRevision}>
              {shortRevision(summary.model.modelRevision)}
            </code>{" "}
            · {summary.model.dimensions} dimensiones
          </p>
          <p className={styles.countLine}>
            {summary.embeddedChunkCount.toLocaleString("es")} de{" "}
            {summary.chunkCount.toLocaleString("es")} fragmentos con embeddings
          </p>
          <p className={styles.hint}>
            El modelo corre localmente. La primera ejecución puede descargar
            cientos de MB en la caché; el texto de los documentos no se envía a
            un servicio externo.
          </p>
        </div>

        <div className={styles.actions}>
          {!hasChunks ? (
            <button type="button" className={styles.primaryButton} disabled>
              Generar embeddings
            </button>
          ) : isComplete ? (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => handleGenerate(true)}
              disabled={isLoading}
            >
              {isLoading ? "Generando…" : "Regenerar todos"}
            </button>
          ) : (
            <>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => handleGenerate(false)}
                disabled={isLoading}
              >
                {isLoading
                  ? "Generando…"
                  : hasEmbeddings
                    ? "Completar pendientes"
                    : "Generar embeddings"}
              </button>
              {hasEmbeddings ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => handleGenerate(true)}
                  disabled={isLoading}
                >
                  Regenerar todos
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {!hasChunks ? (
        <p className={styles.empty}>
          Generá fragmentos primero. Los embeddings se crean a partir de los
          fragmentos del documento.
        </p>
      ) : null}

      {status.kind === "loading" ? (
        <p className={styles.status} role="status">
          Generando embeddings. La primera ejecución puede descargar el modelo y
          tardar varios minutos…
        </p>
      ) : null}

      {status.kind === "success" ? (
        <p
          className={`${styles.status} ${styles.statusSuccess}`}
          role="status"
        >
          {status.message}
        </p>
      ) : null}

      {status.kind === "partial" ? (
        <div
          className={`${styles.status} ${styles.statusError}`}
          role="alert"
        >
          <p>{status.message}</p>
          <ul className={styles.errorList}>
            {status.errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {status.kind === "error" ? (
        <p
          className={`${styles.status} ${styles.statusError}`}
          role="alert"
        >
          {status.message}
        </p>
      ) : null}
    </section>
  );
}
