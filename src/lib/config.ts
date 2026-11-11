const DEFAULT_MAX_PDF_SIZE_MB = 10;
const DEFAULT_MAX_PDF_PAGES = 50;

export type UploadLimits = {
  maxSizeMb: number;
  maxSizeBytes: number;
  maxPages: number;
};

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    console.warn(`[config] Ignoring invalid ${name}="${raw}". Using ${fallback}.`);
    return fallback;
  }

  return value;
}

export function getUploadLimits(): UploadLimits {
  const maxSizeMb = readPositiveInteger("MAX_PDF_SIZE_MB", DEFAULT_MAX_PDF_SIZE_MB);

  return {
    maxSizeMb,
    maxSizeBytes: maxSizeMb * 1024 * 1024,
    maxPages: readPositiveInteger("MAX_PDF_PAGES", DEFAULT_MAX_PDF_PAGES),
  };
}

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();

  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and start PostgreSQL.",
    );
  }

  return url;
}
