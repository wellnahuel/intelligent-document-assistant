import { describe, expect, it } from "vitest";

import { parseAskRequest } from "@/lib/rag/input";
import { AppError } from "@/lib/errors";

function catchAppError(callback: () => unknown): AppError {
  try {
    callback();
  } catch (error) {
    if (error instanceof AppError) {
      return error;
    }

    throw error;
  }

  throw new Error("Expected an AppError.");
}

describe("ask input validation", () => {
  it("trims the question and keeps a valid document id", () => {
    expect(
      parseAskRequest(
        { documentId: "cm123", question: "  ¿Qué dice el contrato?  " },
        1000,
      ),
    ).toEqual({
      documentId: "cm123",
      question: "¿Qué dice el contrato?",
    });
  });

  it("rejects missing fields and extra fields", () => {
    expect(catchAppError(() => parseAskRequest({}, 1000)).code).toBe(
      "INVALID_REQUEST_BODY",
    );
    expect(
      catchAppError(() =>
        parseAskRequest(
          { documentId: "cm123", question: "hola", extra: true },
          1000,
        ),
      ).code,
    ).toBe("INVALID_REQUEST_BODY");
    expect(
      catchAppError(() => parseAskRequest({ documentId: 42, question: "hola" }, 1000))
        .code,
    ).toBe("INVALID_REQUEST_BODY");
  });

  it("rejects empty, non-string and oversized questions", () => {
    expect(
      catchAppError(() =>
        parseAskRequest({ documentId: "cm123", question: "   " }, 1000),
      ).code,
    ).toBe("INVALID_ASK_QUESTION");

    expect(
      catchAppError(() =>
        parseAskRequest({ documentId: "cm123", question: "x".repeat(1001) }, 1000),
      ).code,
    ).toBe("INVALID_ASK_QUESTION");
  });

  it("rejects malformed document ids", () => {
    expect(
      catchAppError(() =>
        parseAskRequest({ documentId: "../../etc", question: "hola" }, 1000),
      ).code,
    ).toBe("INVALID_DOCUMENT_ID");
  });
});
