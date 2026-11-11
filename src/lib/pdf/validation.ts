import type { UploadLimits } from "@/lib/config";
import { AppError } from "@/lib/errors";

const PDF_MIME_TYPE = "application/pdf";
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const PDF_HEADER_SCAN_BYTES = 1024;
const MAX_FILENAME_LENGTH = 200;

export type ValidatedPdf = {
  bytes: Uint8Array;
  originalFilename: string;
  mimeType: typeof PDF_MIME_TYPE;
  sizeBytes: number;
};

function hasPdfSignature(bytes: Uint8Array): boolean {
  // The PDF spec allows the header to appear within the first 1024 bytes,
  // so a prefix scan is more tolerant than checking offset 0 only.
  const lastOffset =
    Math.min(bytes.length, PDF_HEADER_SCAN_BYTES) - PDF_SIGNATURE.length;

  for (let offset = 0; offset <= lastOffset; offset += 1) {
    let matches = true;

    for (let index = 0; index < PDF_SIGNATURE.length; index += 1) {
      if (bytes[offset + index] !== PDF_SIGNATURE[index]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return true;
    }
  }

  return false;
}

/**
 * Keeps the original name as display metadata only.
 * It is never used to build a filesystem path.
 */
function sanitizeFilename(rawName: string): string {
  const basename = rawName.split(/[\\/]/).pop() ?? "";
  const withoutControlCharacters = basename.replace(
    /[\u0000-\u001f\u007f]/g,
    "",
  );
  const normalized = withoutControlCharacters.replace(/\s+/g, " ").trim();
  const limited = normalized.slice(0, MAX_FILENAME_LENGTH);

  return limited.length > 0 ? limited : "documento.pdf";
}

export async function validatePdfUpload(
  value: FormDataEntryValue | null,
  limits: UploadLimits,
): Promise<ValidatedPdf> {
  if (!(value instanceof File)) {
    throw new AppError("MISSING_FILE", "Selecciona un archivo PDF para subir.");
  }

  if (value.size === 0) {
    throw new AppError("EMPTY_FILE", "El archivo está vacío.");
  }

  if (value.size > limits.maxSizeBytes) {
    throw new AppError(
      "FILE_TOO_LARGE",
      `El archivo supera el límite de ${limits.maxSizeMb} MB.`,
    );
  }

  const declaredType = value.type.split(";")[0]?.trim().toLowerCase() ?? "";

  if (declaredType !== PDF_MIME_TYPE) {
    throw new AppError("INVALID_FILE_TYPE", "El archivo debe ser un PDF.");
  }

  const bytes = new Uint8Array(await value.arrayBuffer());

  if (bytes.byteLength === 0) {
    throw new AppError("EMPTY_FILE", "El archivo está vacío.");
  }

  if (bytes.byteLength > limits.maxSizeBytes) {
    throw new AppError(
      "FILE_TOO_LARGE",
      `El archivo supera el límite de ${limits.maxSizeMb} MB.`,
    );
  }

  if (!hasPdfSignature(bytes)) {
    throw new AppError(
      "INVALID_PDF_HEADER",
      "El archivo no parece ser un PDF válido.",
    );
  }

  return {
    bytes,
    originalFilename: sanitizeFilename(value.name),
    mimeType: PDF_MIME_TYPE,
    sizeBytes: bytes.byteLength,
  };
}
