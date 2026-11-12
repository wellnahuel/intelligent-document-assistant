"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { readErrorMessage } from "@/lib/client/read-error";
import type {
  AskDocumentOptionDto,
  RagAnswerDto,
  RagSourceDto,
} from "@/lib/rag/types";

import styles from "./AskPanel.module.css";

type AskPanelProps = {
  documents: AskDocumentOptionDto[];
  questionMaxChars: number;
  topK: number;
  providerConfigured: boolean;
};

type AskStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; result: RagAnswerDto }
  | { kind: "error"; message: string };

type AskResponse = {
  ask?: RagAnswerDto;
};

const GENERIC_ERROR =
  "No se pudo generar la respuesta. Intentá nuevamente.";

function isRagAnswer(value: unknown): value is RagAnswerDto {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<RagAnswerDto>;

  return (
    typeof candidate.answer === "string" &&
    typeof candidate.documentId === "string" &&
    Array.isArray(candidate.sources)
  );
}

export function AskPanel({
  documents,
  questionMaxChars,
  topK,
  providerConfigured,
}: AskPanelProps) {
  const [documentId, setDocumentId] = useState(documents[0]?.id ?? "");
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<AskStatus>({ kind: "idle" });

  const isLoading = status.kind === "loading";
  const selectedDocument = documents.find(
    (document) => document.id === documentId,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!documentId) {
      setStatus({
        kind: "error",
        message: "Elegí un documento antes de preguntar.",
      });
      return;
    }

    const trimmedQuestion = question.trim();

    if (trimmedQuestion.length === 0) {
      setStatus({
        kind: "error",
        message: "Escribí una pregunta para consultar el documento.",
      });
      return;
    }

    if (trimmedQuestion.length > questionMaxChars) {
      setStatus({
        kind: "error",
        message: `La pregunta no puede superar los ${questionMaxChars} caracteres.`,
      });
      return;
    }

    setStatus({ kind: "loading" });

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          question: trimmedQuestion,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setStatus({
          kind: "error",
          message: readErrorMessage(payload) ?? GENERIC_ERROR,
        });
        return;
      }

      const result = (payload as AskResponse | null)?.ask;

      if (!isRagAnswer(result)) {
        setStatus({ kind: "error", message: GENERIC_ERROR });
        return;
      }

      setStatus({ kind: "success", result });
    } catch {
      setStatus({ kind: "error", message: GENERIC_ERROR });
    }
  }

  return (
    <div className={styles.panel}>
      {!providerConfigured ? (
        <p className={styles.configWarning} role="status">
          El servidor no tiene configurados <code>OPENROUTER_API_KEY</code> y{" "}
          <code>OPENROUTER_MODEL</code>. La recuperación funciona, pero la
          generación va a responder con un error seguro hasta completar la
          configuración.
        </p>
      ) : null}

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="ask-document" className={styles.label}>
            Documento
          </label>
          <select
            id="ask-document"
            className={styles.select}
            value={documentId}
            onChange={(event) => setDocumentId(event.target.value)}
            disabled={isLoading}
          >
            {documents.map((document) => (
              <option key={document.id} value={document.id}>
                {document.originalFilename} · {document.pageCount} páginas ·{" "}
                {document.embeddedChunkCount} embeddings
              </option>
            ))}
          </select>
          {selectedDocument && selectedDocument.embeddedChunkCount === 0 ? (
            <span className={styles.fieldHint}>
              Este documento no tiene embeddings compatibles.{" "}
              <Link href={`/documents/${selectedDocument.id}`}>
                Generá sus embeddings
              </Link>{" "}
              para recuperar fragmentos.
            </span>
          ) : null}
        </div>

        <div className={styles.field}>
          <label htmlFor="ask-question" className={styles.label}>
            Pregunta
          </label>
          <textarea
            id="ask-question"
            className={styles.textarea}
            rows={4}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={questionMaxChars}
            placeholder="¿Qué dice el documento sobre…?"
            disabled={isLoading}
            aria-describedby="ask-question-help"
          />
          <div className={styles.questionMeta} id="ask-question-help">
            <span>
              Se recuperarán hasta {topK} fragmentos del documento elegido.
            </span>
            <span className={styles.counter}>
              {question.length}/{questionMaxChars} caracteres
            </span>
          </div>
        </div>

        <div className={styles.controls}>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={isLoading || question.trim().length === 0}
          >
            {isLoading ? "Generando respuesta…" : "Preguntar"}
          </button>
        </div>
      </form>

      {status.kind === "loading" ? (
        <p className={styles.status} role="status">
          Recuperando fragmentos y generando la respuesta. La primera ejecución
          puede descargar el modelo local de embeddings y tardar varios
          minutos…
        </p>
      ) : null}

      {status.kind === "error" ? (
        <p className={`${styles.status} ${styles.statusError}`} role="alert">
          {status.message}
        </p>
      ) : null}

      {status.kind === "success" ? (
        <AskResult result={status.result} />
      ) : null}
    </div>
  );
}

function AskResult({ result }: { result: RagAnswerDto }) {
  const citedCount = result.citedSourceIds.length;
  const sentCount = result.sources.length;
  const retrievedCount = result.retrieval.retrievedCount;

  return (
    <section className={styles.resultSection} aria-labelledby="respuesta">
      <div className={styles.resultHeader}>
        <div>
          <p className={styles.kicker}>Respuesta generada</p>
          <h2 id="respuesta" className={styles.resultTitle}>
            {result.documentName}
          </h2>
          <p className={styles.resultMeta}>
            {sentCount} de {retrievedCount} fragmentos enviados al modelo ·{" "}
            {result.contextChars.toLocaleString("es")} caracteres de contexto
            {result.model ? ` · modelo ${result.model}` : ""}
            {result.usage?.totalTokens
              ? ` · ${result.usage.totalTokens.toLocaleString("es")} tokens`
              : ""}
          </p>
        </div>
        <p className={styles.questionEcho}>“{result.question}”</p>
      </div>

      <div
        className={`${styles.answerCard} ${
          result.noEvidence ? styles.answerCardEmpty : ""
        }`}
      >
        <p className={styles.answerLabel}>
          {result.noEvidence ? "Sin evidencia suficiente" : "Respuesta"}
        </p>
        <p className={styles.answerText}>{result.answer}</p>
      </div>

      {!result.noEvidence && citedCount === 0 ? (
        <p className={`${styles.status} ${styles.statusWarning}`} role="status">
          El modelo no incluyó citas verificables. Revisá las fuentes
          recuperadas antes de confiar en la respuesta.
        </p>
      ) : null}

      {sentCount > 0 ? (
        <details className={styles.sources} open>
          <summary className={styles.sourcesSummary}>
            <span>
              Fuentes recuperadas ({sentCount})
              {citedCount > 0 ? ` · ${citedCount} citadas` : ""}
            </span>
            <span className={styles.sourcesHint}>
              Estas fueron las fuentes enviadas al modelo.
            </span>
          </summary>

          <ol className={styles.sourceList}>
            {result.sources.map((source) => (
              <SourceCard key={source.sourceId} source={source} />
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}

function SourceCard({ source }: { source: RagSourceDto }) {
  return (
    <li
      className={`${styles.sourceCard} ${
        source.cited ? styles.sourceCardCited : ""
      }`}
    >
      <div className={styles.sourceHeader}>
        <span className={styles.sourceId}>[{source.sourceId}]</span>
        <span className={styles.sourceDocument}>{source.documentName}</span>
        <span>Página {source.pageNumber}</span>
        <span className={styles.sourceDistance}>
          distancia {source.retrievalDistance.toFixed(4)}
        </span>
        <span
          className={`${styles.citationBadge} ${
            source.cited ? styles.citationBadgeCited : ""
          }`}
        >
          {source.cited ? "Citada" : "No citada"}
        </span>
      </div>

      <p className={styles.excerpt}>{source.excerpt}</p>

      <div className={styles.sourceFooter}>
        <Link href={`/documents/${source.documentId}`}>
          Abrir documento
        </Link>
        <span>Fragmento {source.chunkId}</span>
      </div>
    </li>
  );
}
