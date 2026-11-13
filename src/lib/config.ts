const DEFAULT_MAX_PDF_SIZE_MB = 10;
const DEFAULT_MAX_PDF_PAGES = 50;
const DEFAULT_DATABASE_POOL_MAX = 5;

// Vercel Functions accept request bodies up to 4.5 MB. The 4 MB file limit
// leaves room for multipart framing. Local development keeps the original
// 10 MB default.
const VERCEL_MAX_PDF_SIZE_MB = 4;
const VERCEL_DEFAULT_DATABASE_POOL_MAX = 1;
const MAX_DATABASE_POOL_MAX = 20;

export type UploadLimits = {
  maxSizeMb: number;
  maxSizeBytes: number;
  maxPages: number;
};

let warnedAboutVercelClamp = false;

function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1";
}

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
  const vercel = isVercelRuntime();
  const defaultMaxSizeMb = vercel
    ? VERCEL_MAX_PDF_SIZE_MB
    : DEFAULT_MAX_PDF_SIZE_MB;
  const configuredMaxSizeMb = readPositiveInteger(
    "MAX_PDF_SIZE_MB",
    defaultMaxSizeMb,
  );

  // A deployment on Vercel cannot receive a body larger than its platform
  // limit, so a larger configured value is clamped instead of failing later
  // with an opaque platform error.
  const maxSizeMb =
    vercel && configuredMaxSizeMb > VERCEL_MAX_PDF_SIZE_MB
      ? VERCEL_MAX_PDF_SIZE_MB
      : configuredMaxSizeMb;

  if (
    vercel &&
    configuredMaxSizeMb > VERCEL_MAX_PDF_SIZE_MB &&
    !warnedAboutVercelClamp
  ) {
    warnedAboutVercelClamp = true;
    console.warn(
      `[config] MAX_PDF_SIZE_MB="${configuredMaxSizeMb}" exceeds the Vercel request body limit. Using ${VERCEL_MAX_PDF_SIZE_MB} MB in this deployment.`,
    );
  }

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

/**
 * Bounds the pg pool created by the Prisma driver adapter. Serverless
 * deployments should keep it small: each warm instance owns one pool, and the
 * database provider is expected to pool connections at its own endpoint.
 */
export function getDatabasePoolMax(): number {
  const fallback = isVercelRuntime()
    ? VERCEL_DEFAULT_DATABASE_POOL_MAX
    : DEFAULT_DATABASE_POOL_MAX;
  const raw = process.env.DATABASE_POOL_MAX?.trim();

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);

  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_DATABASE_POOL_MAX
  ) {
    console.warn(
      `[config] Ignoring invalid DATABASE_POOL_MAX="${raw}". Expected an integer between 1 and ${MAX_DATABASE_POOL_MAX}; using ${fallback}.`,
    );
    return fallback;
  }

  return value;
}
