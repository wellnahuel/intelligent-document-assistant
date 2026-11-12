import { AppError } from "@/lib/errors";

// Prisma cuid() ids are URL-safe alphanumeric strings. Keeping the check
// narrow rejects malformed ids before they reach the database.
const DOCUMENT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export function assertDocumentId(id: string): void {
  if (!DOCUMENT_ID_PATTERN.test(id)) {
    throw new AppError(
      "INVALID_DOCUMENT_ID",
      "El identificador del documento no es válido.",
    );
  }
}
