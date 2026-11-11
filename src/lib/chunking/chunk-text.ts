export type ChunkingOptions = {
  /** Maximum number of characters of new content in a chunk. */
  targetChars: number;
  /** Characters copied from the end of the previous chunk. Zero disables overlap. */
  overlapChars: number;
  /** A trailing chunk smaller than this is merged into the previous one. */
  minChars: number;
};

export type TextChunk = {
  /** Exact slice of the normalized text. */
  content: string;
  /** Inclusive start offset into the normalized text. */
  startChar: number;
  /** Exclusive end offset into the normalized text. */
  endChar: number;
};

type Range = {
  start: number;
  end: number;
};

export class ChunkingOptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChunkingOptionsError";
  }
}

export function validateChunkingOptions(options: ChunkingOptions): void {
  if (!Number.isInteger(options.targetChars) || options.targetChars <= 0) {
    throw new ChunkingOptionsError("targetChars must be a positive integer.");
  }

  if (!Number.isInteger(options.overlapChars) || options.overlapChars < 0) {
    throw new ChunkingOptionsError(
      "overlapChars must be a non-negative integer.",
    );
  }

  if (options.overlapChars >= options.targetChars) {
    throw new ChunkingOptionsError(
      "overlapChars must be smaller than targetChars.",
    );
  }

  if (!Number.isInteger(options.minChars) || options.minChars <= 0) {
    throw new ChunkingOptionsError("minChars must be a positive integer.");
  }

  if (options.minChars > options.targetChars) {
    throw new ChunkingOptionsError(
      "minChars must not be greater than targetChars.",
    );
  }
}

function isWhitespace(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}

/**
 * Collapses horizontal whitespace, normalizes line endings and limits blank
 * lines to one. It keeps paragraph boundaries and sentence punctuation, so the
 * text stays readable while offsets remain stable for traceability.
 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00A0\u2007\u202F]/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function trimRange(text: string, start: number, end: number): Range | null {
  let rangeStart = start;
  let rangeEnd = end;

  while (rangeStart < rangeEnd && isWhitespace(text[rangeStart])) {
    rangeStart += 1;
  }

  while (rangeEnd > rangeStart && isWhitespace(text[rangeEnd - 1])) {
    rangeEnd -= 1;
  }

  return rangeStart < rangeEnd
    ? { start: rangeStart, end: rangeEnd }
    : null;
}

function paragraphRanges(text: string): Range[] {
  const ranges: Range[] = [];
  const separator = /\n{2,}/g;
  let cursor = 0;

  for (const match of text.matchAll(separator)) {
    const matchIndex = match.index ?? cursor;
    const range = trimRange(text, cursor, matchIndex);

    if (range) {
      ranges.push(range);
    }

    cursor = matchIndex + match[0].length;
  }

  const lastRange = trimRange(text, cursor, text.length);

  if (lastRange) {
    ranges.push(lastRange);
  }

  return ranges;
}

function sentenceRanges(text: string, paragraph: Range): Range[] {
  const segment = text.slice(paragraph.start, paragraph.end);
  // A boundary is terminal punctuation followed by whitespace or the end.
  const boundary = /[.!?…]+["'»”’)\]]*(?=\s|$)/g;
  const ranges: Range[] = [];
  let cursor = 0;

  for (const match of segment.matchAll(boundary)) {
    const matchIndex = match.index ?? cursor;
    const end = matchIndex + match[0].length;
    const range = trimRange(
      text,
      paragraph.start + cursor,
      paragraph.start + end,
    );

    if (range) {
      ranges.push(range);
    }

    cursor = end;
  }

  const tail = trimRange(
    text,
    paragraph.start + cursor,
    paragraph.end,
  );

  if (tail) {
    ranges.push(tail);
  }

  return ranges;
}

function wordRanges(
  text: string,
  sentence: Range,
  targetChars: number,
): Range[] {
  const segment = text.slice(sentence.start, sentence.end);
  const ranges: Range[] = [];

  for (const match of segment.matchAll(/\S+/g)) {
    const wordStart = sentence.start + (match.index ?? 0);
    const wordEnd = wordStart + match[0].length;

    if (wordEnd - wordStart <= targetChars) {
      ranges.push({ start: wordStart, end: wordEnd });
      continue;
    }

    // A single word longer than the target must be hard-split to guarantee
    // progress. At most one target-sized piece per unit.
    for (let cursor = wordStart; cursor < wordEnd; cursor += targetChars) {
      ranges.push({
        start: cursor,
        end: Math.min(cursor + targetChars, wordEnd),
      });
    }
  }

  return ranges;
}

function buildUnits(text: string, targetChars: number): Range[] {
  const units: Range[] = [];

  for (const paragraph of paragraphRanges(text)) {
    if (paragraph.end - paragraph.start <= targetChars) {
      units.push(paragraph);
      continue;
    }

    for (const sentence of sentenceRanges(text, paragraph)) {
      if (sentence.end - sentence.start <= targetChars) {
        units.push(sentence);
        continue;
      }

      units.push(...wordRanges(text, sentence, targetChars));
    }
  }

  return units;
}

function packUnits(units: Range[], options: ChunkingOptions): Range[] {
  const chunks: Range[] = [];
  let index = 0;

  while (index < units.length) {
    const firstUnit = units[index];

    if (!firstUnit) {
      break;
    }

    const start = firstUnit.start;
    let end = firstUnit.end;
    let nextIndex = index + 1;

    while (nextIndex < units.length) {
      const nextUnit = units[nextIndex];

      if (!nextUnit || nextUnit.end - start > options.targetChars) {
        break;
      }

      end = nextUnit.end;
      nextIndex += 1;
    }

    chunks.push({ start, end });
    index = nextIndex;
  }

  // Do not leave a tiny orphan fragment at the end when the page has more
  // than one chunk. The merged chunk may exceed the target by less than
  // minChars; losing context is worse than a slightly larger final chunk.
  while (chunks.length > 1) {
    const lastChunk = chunks[chunks.length - 1];
    const previousChunk = chunks[chunks.length - 2];

    if (
      !lastChunk ||
      !previousChunk ||
      lastChunk.end - lastChunk.start >= options.minChars
    ) {
      break;
    }

    previousChunk.end = lastChunk.end;
    chunks.pop();
  }

  return chunks;
}

/**
 * Moves forward to the first word start at or after `from`, never past
 * `limit`. This is what keeps overlap from cutting a word in half.
 */
function nextWordStart(text: string, from: number, limit: number): number {
  let cursor = from;

  while (cursor < limit) {
    const startsWord =
      !isWhitespace(text[cursor]) &&
      (cursor === 0 || isWhitespace(text[cursor - 1]));

    if (startsWord) {
      break;
    }

    cursor += 1;
  }

  return cursor;
}

function applyOverlap(
  text: string,
  ranges: Range[],
  overlapChars: number,
): TextChunk[] {
  const chunks: TextChunk[] = [];
  let previousStart = 0;

  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index];

    if (!range) {
      continue;
    }

    let contentStart = range.start;

    if (index > 0 && overlapChars > 0) {
      const windowStart = Math.max(
        previousStart + 1,
        range.start - overlapChars,
      );
      contentStart = nextWordStart(text, windowStart, range.start);
    }

    chunks.push({
      content: text.slice(contentStart, range.end),
      startChar: contentStart,
      endChar: range.end,
    });

    previousStart = range.start;
  }

  return chunks;
}

/**
 * Splits one page of text into overlapping chunks.
 *
 * The algorithm is intentionally deterministic and page-scoped:
 * normalized text → paragraphs → sentences → words → packed ranges → overlap.
 * Every returned `content` is exactly `normalizedText.slice(startChar, endChar)`.
 */
export function chunkText(
  raw: string,
  options: ChunkingOptions,
): TextChunk[] {
  validateChunkingOptions(options);

  const text = normalizeText(raw);

  if (text.length === 0) {
    return [];
  }

  const units = buildUnits(text, options.targetChars);

  if (units.length === 0) {
    return [];
  }

  const packed = packUnits(units, options);

  return applyOverlap(text, packed, options.overlapChars);
}
