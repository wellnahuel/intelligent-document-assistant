"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type {
  DocumentSummaryDto,
  UploadLimitsDto,
} from "@/lib/documents/types";
import { formatBytes, formatDateTime } from "@/lib/format";

import { StatusBadge } from "./StatusBadge";
import { UploadForm } from "./UploadForm";
import styles from "./DocumentLibrary.module.css";

type DocumentLibraryProps = {
  limits: UploadLimitsDto;
  initialDocuments: DocumentSummaryDto[];
  initialLoadError: string | null;
};

type UploadedDocument = {
  id: string;
  filename: string;
  pageCount: number;
};

type DocumentsResponse = {
  documents?: DocumentSummaryDto[];
  error?: { message?: string };
};

type UploadResponse = {
  document?: DocumentSummaryDto;
  error?: { message?: string };
};

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function DocumentLibrary({
  limits,
  initialDocuments,
  initialLoadError,
}: DocumentLibraryProps) {
  const [documents, setDocuments] =
    useState<DocumentSummaryDto[]>(initialDocuments);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(initialLoadError);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingFilename, setPendingFilename] = useState<string | null>(null);
  const [uploadedDocument, setUploadedDocument] =
    useState<UploadedDocument | null>(null);

  async function fetchDocuments(signal?: AbortSignal) {
    try {
      const response = await fetch("/api/documents", {
        cache: "no-store",
        signal,
      });
      const payload = (await response.json()) as DocumentsResponse;

      if (!response.ok) {
        throw new Error(
          payload.error?.message ?? "No se pudieron cargar los documentos.",
        );
      }

      setDocuments(payload.documents ?? []);
      setLoadError(null);
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      setLoadError(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los documentos.",
      );
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }

  function refreshDocuments() {
    setIsLoading(true);
    void fetchDocuments();
  }

  async function handleUpload(file: File): Promise<boolean> {
    setIsUploading(true);
    setUploadError(null);
    setUploadedDocument(null);
    setPendingFilename(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as UploadResponse;

      if (!response.ok || !payload.document) {
        setUploadError(
          payload.error?.message ?? "No se pudo procesar el documento.",
        );
        return false;
      }

      const document = payload.document;

      setDocuments((current) => [
        document,
        ...current.filter((item) => item.id !== document.id),
      ]);
      setUploadedDocument({
        id: document.id,
        filename: document.originalFilename,
        pageCount: document.pageCount,
      });

      return true;
    } catch {
      setUploadError(
        "No se pudo conectar con el servidor. Intenta nuevamente.",
      );
      return false;
    } finally {
      setIsUploading(false);
      setPendingFilename(null);
    }
  }

  const documentCountLabel = useMemo(() => {
    if (documents.length === 1) {
      return "1 documento";
    }

    return `${documents.length} documentos`;
  }, [documents.length]);

  const showSkeleton = isLoading && documents.length === 0;
  const showEmptyState =
    !isLoading &&
    loadError === null &&
    documents.length === 0 &&
    pendingFilename === null;
  const showList =
    !isLoading && (documents.length > 0 || pendingFilename !== null);

  return (
    <div className={styles.workspace}>
      <div className={styles.uploadColumn}>
        <UploadForm
          limits={limits}
          isUploading={isUploading}
          errorMessage={uploadError}
          onUpload={handleUpload}
          onError={setUploadError}
        />

        <aside className={styles.note} aria-label="Alcance del sprint">
          <span className={styles.noteTitle}>Qué ocurre al procesar</span>
          <ol className={styles.steps}>
            <li>Validamos el archivo en el servidor.</li>
            <li>PDF.js extrae el texto de cada página.</li>
            <li>PostgreSQL guarda el documento y sus páginas.</li>
          </ol>
          <p className={styles.noteFooter}>
            El archivo binario no se almacena en este sprint.
          </p>
        </aside>
      </div>

      <section
        className={styles.library}
        aria-labelledby="library-title"
        aria-busy={isLoading}
      >
        <header className={styles.libraryHeader}>
          <div>
            <h2 id="library-title" className={styles.libraryTitle}>
              Documentos
            </h2>
            <p className={styles.librarySubtitle}>
              {isLoading ? "Cargando biblioteca…" : documentCountLabel}
            </p>
          </div>

          <button
            type="button"
            className={styles.refresh}
            onClick={refreshDocuments}
            disabled={isLoading}
            aria-label="Actualizar lista de documentos"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{isLoading ? "Actualizando…" : "Actualizar"}</span>
          </button>
        </header>

        {uploadedDocument ? (
          <div className={styles.success} role="status">
            <p className={styles.successText}>
              <strong>{uploadedDocument.filename}</strong> se procesó
              correctamente. Se extrajeron {uploadedDocument.pageCount}{" "}
              {uploadedDocument.pageCount === 1 ? "página" : "páginas"}.
            </p>
            <Link
              href={`/documents/${uploadedDocument.id}`}
              className={styles.successLink}
            >
              Ver texto extraído →
            </Link>
            <button
              type="button"
              className={styles.dismiss}
              onClick={() => setUploadedDocument(null)}
              aria-label="Cerrar aviso"
            >
              ×
            </button>
          </div>
        ) : null}

        {loadError ? (
          <div className={styles.errorState} role="alert">
            <p>{loadError}</p>
            <button
              type="button"
              className={styles.retry}
              onClick={refreshDocuments}
            >
              Reintentar
            </button>
          </div>
        ) : null}

        {showSkeleton ? (
          <ul className={styles.list} aria-label="Cargando documentos">
            {[0, 1, 2].map((item) => (
              <li
                key={item}
                className={styles.skeleton}
                aria-hidden="true"
              />
            ))}
          </ul>
        ) : null}

        {showEmptyState ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M7 3.75h7.5L19 8.25v11A1.75 1.75 0 0 1 17.25 21h-10A1.75 1.75 0 0 1 5.5 19.25V5.5A1.75 1.75 0 0 1 7.25 3.75Z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
                <path
                  d="M14 4v4.5h4.5M9 13h6M9 16.5h4"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <h3 className={styles.emptyTitle}>Todavía no hay documentos</h3>
            <p className={styles.emptyText}>
              Sube tu primer PDF para ver el texto extraído, página por página.
            </p>
          </div>
        ) : null}

        {showList ? (
          <ul className={styles.list}>
            {pendingFilename ? (
              <li className={styles.pendingRow} aria-live="polite">
                <span className={styles.pendingSpinner} aria-hidden="true" />
                <span className={styles.rowMain}>
                  <span className={styles.filename}>{pendingFilename}</span>
                  <span className={styles.meta}>
                    Procesando y extrayendo texto…
                  </span>
                </span>
                <StatusBadge status="PENDING" />
              </li>
            ) : null}

            {documents.map((document) => (
              <li key={document.id}>
                <Link
                  href={`/documents/${document.id}`}
                  className={styles.row}
                >
                  <span className={styles.fileIcon} aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path
                        d="M7 3.75h7.5L19 8.25v11A1.75 1.75 0 0 1 17.25 21h-10A1.75 1.75 0 0 1 5.5 19.25V5.5A1.75 1.75 0 0 1 7.25 3.75Z"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M14 4v4.5h4.5"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>

                  <span className={styles.rowMain}>
                    <span className={styles.filename}>
                      {document.originalFilename}
                    </span>
                    <span className={styles.meta}>
                      {document.pageCount}{" "}
                      {document.pageCount === 1 ? "página" : "páginas"} ·{" "}
                      {formatBytes(document.sizeBytes)} ·{" "}
                      {formatDateTime(document.createdAt)}
                    </span>
                  </span>

                  <StatusBadge status={document.status} />
                  <span className={styles.chevron} aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
