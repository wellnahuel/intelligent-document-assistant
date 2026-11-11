"use client";

import { useState } from "react";

import type {
  ChunkGenerationResultDto,
  ChunkingConfigDto,
  DocumentPageDto,
} from "@/lib/documents/types";

import styles from "./DocumentDetail.module.css";

type GenerationStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

type DocumentChunkViewerProps = {
  documentId: string;
  pages: DocumentPageDto[];
  chunking: ChunkingConfigDto;
};

const GENERIC_ERROR =
  "No se pudieron generar los fragmentos. Intenta nuevamente.";

function readErrorMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null || !("error" in payload)) {
    return null;
  }

  const error = (payload as { error?: unknown }).error;

  if (typeof error !== "object" || error === null) {
    return null;
  }

  const message = (error as { message?: unknown }).message;

  return typeof message === "string" && message.length > 0 ? message : null;
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

export function DocumentChunkViewer({
  documentId,
  pages: initialPages,
  chunking,
}: DocumentChunkViewerProps) {
  const [pages, setPages] = useState(initialPages);
  const [status, setStatus] = useState<GenerationStatus>({ kind: "idle" });

  const hasChunks = pages.some((page) => page.chunks.length > 0);
  const hasText = pages.some((page) => page.text.trim().length > 0);
  const isLoading = status.kind === "loading";

  async function handleGenerate() {
    setStatus({ kind: "loading" });

    try {
      const response = await fetch(`/api/documents/${documentId}/chunks`, {
        method: "POST",
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setStatus({
          kind: "error",
          message: readErrorMessage(payload) ?? GENERIC_ERROR,
        });
        return;
      }

      const result = payload as ChunkGenerationResultDto;

      setPages((current) =>
        current.map((page) => {
          const generated = result.pages.find(
            (candidate) => candidate.pageId === page.id,
          );

          return generated ? { ...page, chunks: generated.chunks } : page;
        }),
      );

      setStatus({
        kind: "success",
        message:
          result.chunkCount === 0
            ? "La generación terminó sin fragmentos: ninguna página tenía texto."
            : `Se generaron ${result.chunkCount} ${pluralize(
                result.chunkCount,
                "fragmento",
                "fragmentos",
              )} en ${result.pageCount} ${pluralize(
                result.pageCount,
                "página",
                "páginas",
              )}.`,
      });
    } catch {
      setStatus({ kind: "error", message: GENERIC_ERROR });
    }
  }

  return (
    <div className={styles.pages}>
      <section
        className={styles.chunkToolbar}
        aria-labelledby="fragmentos-titulo"
      >
        <div className={styles.chunkToolbarText}>
          <h2 id="fragmentos-titulo" className={styles.chunkToolbarTitle}>
            Fragmentos
          </h2>
          <p className={styles.chunkToolbarParams}>
            Objetivo {chunking.targetChars.toLocaleString("es")} caracteres ·
            Overlap {chunking.overlapChars.toLocaleString("es")} · Mínimo{" "}
            {chunking.minChars.toLocaleString("es")}
          </p>
          <p className={styles.chunkToolbarHint}>
            Se generan página por página. Un fragmento nunca cruza el límite de
            una página y conserva su rango de caracteres.
          </p>
        </div>

        <button
          type="button"
          className={styles.generateButton}
          onClick={handleGenerate}
          disabled={isLoading || !hasText}
        >
          {isLoading
            ? "Generando…"
            : hasChunks
              ? "Regenerar fragmentos"
              : "Generar fragmentos"}
        </button>
      </section>

      {status.kind === "loading" ? (
        <p className={styles.chunkStatus} role="status">
          Generando fragmentos…
        </p>
      ) : null}

      {status.kind === "success" ? (
        <p
          className={`${styles.chunkStatus} ${styles.chunkStatusSuccess}`}
          role="status"
        >
          {status.message}
        </p>
      ) : null}

      {status.kind === "error" ? (
        <p
          className={`${styles.chunkStatus} ${styles.chunkStatusError}`}
          role="alert"
        >
          {status.message}
        </p>
      ) : null}

      {!hasText ? (
        <p className={styles.chunkEmpty}>
          Este documento no tiene texto extraído para fragmentar.
        </p>
      ) : null}

      {pages.map((page) => (
        <section
          key={page.id}
          id={`pagina-${page.pageNumber}`}
          className={styles.pageCard}
          aria-labelledby={`pagina-${page.pageNumber}-titulo`}
        >
          <header className={styles.pageHeader}>
            <h2
              id={`pagina-${page.pageNumber}-titulo`}
              className={styles.pageTitle}
            >
              Página {page.pageNumber}
            </h2>
            <span className={styles.charCount}>
              {page.text.length.toLocaleString("es")} caracteres
            </span>
          </header>

          {page.text.trim().length > 0 ? (
            <div className={styles.pageText}>{page.text}</div>
          ) : (
            <p className={styles.emptyPage}>
              Sin texto seleccionable en esta página.
            </p>
          )}

          <div className={styles.chunkSection}>
            <div className={styles.chunkSectionHeader}>
              <h3 className={styles.chunkSectionTitle}>
                Fragmentos de la página {page.pageNumber}
              </h3>
              <span className={styles.chunkCount}>
                {page.chunks.length}{" "}
                {pluralize(page.chunks.length, "fragmento", "fragmentos")}
              </span>
            </div>

            {page.text.trim().length === 0 ? (
              <p className={styles.chunkEmpty}>
                Esta página no tiene texto; no se generan fragmentos.
              </p>
            ) : page.chunks.length === 0 ? (
              <p className={styles.chunkEmpty}>
                Esta página todavía no tiene fragmentos generados.
              </p>
            ) : (
              <ol className={styles.chunkList}>
                {page.chunks.map((chunk) => (
                  <li key={chunk.id} className={styles.chunkItem}>
                    <div className={styles.chunkMeta}>
                      <span className={styles.chunkIndex}>
                        Fragmento {chunk.chunkIndex}
                      </span>
                      <span>Página {page.pageNumber}</span>
                      <span className={styles.chunkRange}>
                        caracteres {chunk.startChar}–{chunk.endChar}
                      </span>
                    </div>
                    <div className={styles.chunkText}>{chunk.content}</div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
