/**
 * The embedding column and the E5-small model both use 384 dimensions.
 * Changing the model requires updating the SQL column and this constant
 * together; a vector of another size cannot be stored in vector(384).
 */
export const EMBEDDING_DIMENSIONS = 384;

/**
 * Validates a vector before it reaches pgvector.
 *
 * PostgreSQL would reject a wrong dimension, but NaN and Infinity can produce
 * confusing driver or database errors. Validating here keeps the failure close
 * to the model output and prevents partial writes.
 */
export function assertEmbeddingVector(
  vector: readonly number[],
  dimensions: number = EMBEDDING_DIMENSIONS,
): void {
  if (!Array.isArray(vector)) {
    throw new Error("Embedding vector must be an array of numbers.");
  }

  if (vector.length !== dimensions) {
    throw new Error(
      `Embedding vector has ${vector.length} dimensions; expected ${dimensions}.`,
    );
  }

  for (let index = 0; index < vector.length; index += 1) {
    const value = vector[index];

    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(
        `Embedding vector contains a non-finite value at index ${index}.`,
      );
    }
  }
}

/**
 * Formats a validated vector as a pgvector text literal. The result is passed
 * as a SQL parameter and cast with `::vector`; it is never concatenated into a
 * query string.
 */
export function formatVectorForSql(
  vector: readonly number[],
  dimensions: number = EMBEDDING_DIMENSIONS,
): string {
  assertEmbeddingVector(vector, dimensions);

  return `[${vector.join(",")}]`;
}

/** E5 was trained with this prefix on document passages. */
export function toPassageText(text: string): string {
  return `passage: ${text}`;
}

/** E5 was trained with this prefix on questions. */
export function toQueryText(text: string): string {
  return `query: ${text}`;
}

/**
 * pgvector's `<=>` returns cosine distance. Similarity is the complement,
 * clamped to the valid cosine range to absorb floating-point noise.
 */
export function cosineSimilarityFromDistance(distance: number): number {
  if (!Number.isFinite(distance)) {
    throw new Error("Cosine distance must be a finite number.");
  }

  return Math.min(1, Math.max(-1, 1 - distance));
}
