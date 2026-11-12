const SOURCE_GROUP_PATTERN =
  /^S\d+(?:(?:\s*[,;]\s*|\s+)S\d+)*$/i;

function canonicalSourceId(raw: string): string {
  return `S${Number(raw.slice(1))}`;
}

/**
 * Keeps only citations that map to a retrieved source. Invented ids are
 * removed from the answer text and are never used to build source metadata.
 */
export function sanitizeAnswerCitations(
  answer: string,
  validSourceIds: readonly string[],
): {
  text: string;
  citedSourceIds: string[];
  invalidCitationCount: number;
} {
  const valid = new Set(validSourceIds);
  const cited = new Set<string>();
  let invalidCitationCount = 0;

  const replaced = answer.replace(/\[([^\]]{1,160})\]/g, (match, rawContent) => {
    const content = String(rawContent).trim();

    if (!SOURCE_GROUP_PATTERN.test(content)) {
      return match;
    }

    const tokens = content
      .split(/(?:\s*[,;]\s*|\s+)/)
      .map((token) => token.trim())
      .filter(Boolean);

    const kept: string[] = [];

    for (const token of tokens) {
      const sourceId = canonicalSourceId(token);

      if (valid.has(sourceId)) {
        kept.push(sourceId);
        cited.add(sourceId);
      } else {
        invalidCitationCount += 1;
      }
    }

    return kept.length > 0 ? `[${kept.join(", ")}]` : "";
  });

  const text = replaced
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .trim();

  return {
    text,
    citedSourceIds: [...cited],
    invalidCitationCount,
  };
}
