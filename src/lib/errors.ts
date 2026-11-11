export type AppErrorCode =
  | "MISSING_FILE"
  | "EMPTY_FILE"
  | "INVALID_FORM_DATA"
  | "FILE_TOO_LARGE"
  | "INVALID_FILE_TYPE"
  | "INVALID_PDF_HEADER"
  | "TOO_MANY_PAGES"
  | "NO_EXTRACTABLE_TEXT"
  | "CORRUPT_PDF"
  | "DOCUMENT_NOT_FOUND"
  | "INVALID_DOCUMENT_ID";

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  MISSING_FILE: 400,
  EMPTY_FILE: 400,
  INVALID_FORM_DATA: 400,
  FILE_TOO_LARGE: 413,
  INVALID_FILE_TYPE: 415,
  INVALID_PDF_HEADER: 400,
  TOO_MANY_PAGES: 422,
  NO_EXTRACTABLE_TEXT: 422,
  CORRUPT_PDF: 422,
  DOCUMENT_NOT_FOUND: 404,
  INVALID_DOCUMENT_ID: 400,
};

/**
 * An error whose message is safe to show to the client.
 * Internal details stay in server logs.
 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}
