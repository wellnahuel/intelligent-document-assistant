import type { SearchConfig } from "@/lib/embeddings/config";
import type { GenerationOptions } from "@/lib/embeddings/types";
import { AppError } from "@/lib/errors";

export type SearchRequestInput = {
  query: unknown;
  topK: unknown;
};

export function parseSearchQuery(raw: unknown, maxChars: number): string {
  if (typeof raw !== "string") {
    throw new AppError(
      "INVALID_SEARCH_QUERY",
      "La pregunta debe enviarse como texto.",
    );
  }

  const query = raw.trim();

  if (query.length === 0) {
    throw new AppError(
      "INVALID_SEARCH_QUERY",
      "Escribí una pregunta para buscar.",
    );
  }

  if (query.length > maxChars) {
    throw new AppError(
      "INVALID_SEARCH_QUERY",
      `La pregunta no puede superar los ${maxChars} caracteres.`,
    );
  }

  return query;
}

export function parseTopK(raw: unknown, config: SearchConfig): number {
  if (raw === undefined) {
    return config.defaultTopK;
  }

  if (
    typeof raw !== "number" ||
    !Number.isInteger(raw) ||
    raw < 1 ||
    raw > config.maxTopK
  ) {
    throw new AppError(
      "INVALID_TOP_K",
      `topK debe ser un entero entre 1 y ${config.maxTopK}.`,
    );
  }

  return raw;
}

export function parseSearchRequest(raw: unknown): SearchRequestInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new AppError(
      "INVALID_REQUEST_BODY",
      "El cuerpo de la búsqueda debe ser un objeto JSON.",
    );
  }

  const body = raw as { query?: unknown; topK?: unknown };

  return {
    query: body.query,
    topK: body.topK,
  };
}

export function parseGenerationOptions(raw: unknown): GenerationOptions {
  if (raw === undefined || raw === null) {
    return { regenerate: false };
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new AppError(
      "INVALID_REQUEST_BODY",
      "El cuerpo de la solicitud debe ser un objeto JSON.",
    );
  }

  const regenerate = (raw as { regenerate?: unknown }).regenerate;

  if (regenerate === undefined) {
    return { regenerate: false };
  }

  if (typeof regenerate !== "boolean") {
    throw new AppError(
      "INVALID_REQUEST_BODY",
      "El campo regenerate debe ser booleano.",
    );
  }

  return { regenerate };
}
