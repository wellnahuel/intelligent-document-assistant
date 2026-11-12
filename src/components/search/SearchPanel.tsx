"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { readErrorMessage } from "@/lib/client/read-error";
import type { ChunkSearchResponseDto } from "@/lib/embeddings/types";

import styles from "./SearchPanel.module.css";

type SearchPanelProps = {
  defaultTopK: number;
  maxTopK: number;
  queryMaxChars: number;
};

type SearchStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; result: ChunkSearchResponseDto }
  | { kind: "error"; message: string };

type SearchResponse = {
  search?: ChunkSearchResponseDto;
};

const GENERIC_ERROR = "No se pudo realizar la búsqueda. Intenta nuevamente.";

export function SearchPanel({
  defaultTopK,
  maxTopK,
  queryMaxChars,
}: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [topKInput, setTopKInput] = useState(String(defaultTopK));
  const [status, setStatus] = useState<SearchStatus>({ kind: "idle" });

  const isLoading = status.kind === "loading";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuery = query.trim();

    if (trimmedQuery.length === 0) {
      setStatus({ kind: "error", message: "Escribí una pregunta para buscar." });
      return;
    }

    if (trimmedQuery.length > queryMaxChars) {
      setStatus({
        kind: "error",
        message: `La pregunta no puede superar los ${queryMaxChars} caracteres.`,
      });
      return;
    }

    const topK = Number(topKInput);

    if (!Number.isInteger(topK) || topK < 1 || topK > maxTopK) {
      setStatus({
        kind: "error",
        message: `topK debe ser un entero entre 1 y ${maxTopK}.`,
      });
      return;
    }

    setStatus({ kind: "loading" });

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmedQuery, topK }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setStatus({
          kind: "error",
          message: readErrorMessage(payload) ?? GENERIC_ERROR,
        });
        return;
      }

      const result = (payload as SearchResponse).search;

      if (!result) {
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
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.queryField}>
          <label htmlFor="search-query" className={styles.label}>
            Pregunta de prueba
          </label>
          <textarea
            id="search-query"
            className={styles.textarea}
            rows={3}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={queryMaxChars}
            placeholder="¿Qué dice el documento sobre…?"
            disabled={isLoading}
          />
          <span className={styles.counter}>
            {query.length}/{queryMaxChars} caracteres
          </span>
        </div>

        <div className={styles.controls}>
          <div className={styles.topKField}>
            <label htmlFor="search-topk" className={styles.label}>
              Resultados (topK)
            </label>
            <input
              id="search-topk"
              className={styles.input}
              type="number"
              min={1}
              max={maxTopK}
              value={topKInput}
              onChange={(event) => setTopKInput(event.target.value)}
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            className={styles.submitButton}
            disabled={isLoading || query.trim().length === 0}
          >
            {isLoading ? "Buscando…" : "Buscar fragmentos"}
          </button>
        </div>
      </form>

      {status.kind === "loading" ? (
        <p className={styles.status} role="status">
          Generando el embedding de la consulta y buscando los fragmentos más
          cercanos. La primera ejecución puede descargar el modelo y tardar
          varios minutos…
        </p>
      ) : null}

      {status.kind === "error" ? (
        <p className={`${styles.status} ${styles.statusError}`} role="alert">
          {status.message}
        </p>
      ) : null}

      {status.kind === "success" ? (
        <SearchResults result={status.result} />
      ) : null}
    </div>
  );
}

function SearchResults({ result }: { result: ChunkSearchResponseDto }) {
  return (
    <section className={styles.resultsSection} aria-labelledby="resultados">
      <div className={styles.resultsHeader}>
        <div>
          <h2 id="resultados" className={styles.resultsTitle}>
            Resultados
          </h2>
          <p className={styles.modelLine}>
            Modelo <code>{result.model.modelId}</code> ·{" "}
            {result.model.dimensions} dimensiones · {result.topK} solicitados ·{" "}
            {result.indexedChunkCount.toLocaleString("es")} fragmentos indexados
          </p>
        </div>
        <p className={styles.queryEcho}>“{result.query}”</p>
      </div>

      {result.indexedChunkCount === 0 ? (
        <p className={styles.empty}>
          Todavía no hay embeddings para este modelo. Abrí un documento y
          generá sus embeddings para poder buscar.{" "}
          <Link href="/">Ir a la biblioteca</Link>.
        </p>
      ) : result.results.length === 0 ? (
        <p className={styles.empty}>
          No se encontraron fragmentos. Probá con otra pregunta.
        </p>
      ) : (
        <ol className={styles.results}>
          {result.results.map((item, index) => (
            <li key={item.chunkId} className={styles.result}>
              <div className={styles.resultHeader}>
                <span className={styles.rank}>#{index + 1}</span>
                <span className={styles.document}>{item.documentName}</span>
                <span>Página {item.pageNumber}</span>
                <span className={styles.metric}>
                  distancia {item.distance.toFixed(4)}
                </span>
                <span className={styles.metric}>
                  similitud {(item.similarity * 100).toFixed(1)}%
                </span>
              </div>
              <p className={styles.resultText}>{item.content}</p>
              <div className={styles.resultFooter}>
                <Link href={`/documents/${item.documentId}`}>
                  Abrir documento
                </Link>
                <span>Fragmento {item.chunkIndex}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
