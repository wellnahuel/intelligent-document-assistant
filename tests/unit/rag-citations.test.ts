import { describe, expect, it } from "vitest";

import { sanitizeAnswerCitations } from "@/lib/rag/citations";

const VALID = ["S1", "S2"];

describe("citation validation", () => {
  it("keeps valid citations and reports them", () => {
    const result = sanitizeAnswerCitations(
      "El contrato pide treinta días [S1]. El pago vence el primer día hábil [S2].",
      VALID,
    );

    expect(result.text).toBe(
      "El contrato pide treinta días [S1]. El pago vence el primer día hábil [S2].",
    );
    expect(result.citedSourceIds).toEqual(["S1", "S2"]);
    expect(result.invalidCitationCount).toBe(0);
  });

  it("accepts adjacent and comma-separated source groups", () => {
    const result = sanitizeAnswerCitations(
      "Una parte [S1][S2] y otra [S1, S2].",
      VALID,
    );

    expect(result.text).toBe("Una parte [S1][S2] y otra [S1, S2].");
    expect(result.citedSourceIds).toEqual(["S1", "S2"]);
  });

  it("removes invented source ids and keeps the valid ones", () => {
    const result = sanitizeAnswerCitations(
      "La garantía es de dos años [S1, S9]. La página 99 no existe [S8].",
      VALID,
    );

    expect(result.text).toBe(
      "La garantía es de dos años [S1]. La página 99 no existe.",
    );
    expect(result.citedSourceIds).toEqual(["S1"]);
    expect(result.invalidCitationCount).toBe(2);
  });

  it("removes groups that only contain invented ids", () => {
    const result = sanitizeAnswerCitations("Respuesta inventada [S9].", VALID);

    expect(result.text).toBe("Respuesta inventada.");
    expect(result.citedSourceIds).toEqual([]);
    expect(result.invalidCitationCount).toBe(1);
  });

  it("normalizes leading zeros and case to the real source id", () => {
    const result = sanitizeAnswerCitations(
      "La respuesta está respaldada [s01].",
      VALID,
    );

    expect(result.text).toBe("La respuesta está respaldada [S1].");
    expect(result.citedSourceIds).toEqual(["S1"]);
  });

  it("leaves unrelated brackets untouched", () => {
    const result = sanitizeAnswerCitations(
      "Una nota [ver anexo] y un rango [1-3].",
      VALID,
    );

    expect(result.text).toBe("Una nota [ver anexo] y un rango [1-3].");
    expect(result.citedSourceIds).toEqual([]);
    expect(result.invalidCitationCount).toBe(0);
  });
});
