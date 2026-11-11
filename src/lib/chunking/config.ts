import {
  type ChunkingOptions,
  validateChunkingOptions,
} from "@/lib/chunking/chunk-text";

const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  targetChars: 1200,
  overlapChars: 150,
  minChars: 100,
};

function readInteger(
  name: string,
  fallback: number,
  minimum: number,
): number {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value < minimum) {
    console.warn(
      `[chunking] Ignoring invalid ${name}="${raw}". Using ${fallback}.`,
    );
    return fallback;
  }

  return value;
}

/**
 * Reads the chunking configuration from the environment.
 * Invalid combinations (for example overlap >= target) fall back to the
 * documented defaults instead of failing a request at runtime.
 */
export function getChunkingConfig(): ChunkingOptions {
  const options: ChunkingOptions = {
    targetChars: readInteger(
      "CHUNK_TARGET_CHARS",
      DEFAULT_CHUNKING_OPTIONS.targetChars,
      1,
    ),
    overlapChars: readInteger(
      "CHUNK_OVERLAP_CHARS",
      DEFAULT_CHUNKING_OPTIONS.overlapChars,
      0,
    ),
    minChars: readInteger(
      "CHUNK_MIN_CHARS",
      DEFAULT_CHUNKING_OPTIONS.minChars,
      1,
    ),
  };

  try {
    validateChunkingOptions(options);
    return options;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[chunking] ${message} Using defaults.`);
    return DEFAULT_CHUNKING_OPTIONS;
  }
}
