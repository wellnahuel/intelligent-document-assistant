import assert from "node:assert/strict";
import test from "node:test";

import {
  ChunkingOptionsError,
  chunkText,
  normalizeText,
  validateChunkingOptions,
} from "../src/lib/chunking/chunk-text.ts";

const DEFAULT_OPTIONS = {
  targetChars: 1200,
  overlapChars: 150,
  minChars: 100,
};

function options(overrides = {}) {
  return { ...DEFAULT_OPTIONS, ...overrides };
}

function assertChunkContract(text, chunkingOptions) {
  const normalized = normalizeText(text);
  const chunks = chunkText(text, chunkingOptions);

  for (const chunk of chunks) {
    assert.ok(chunk.content.length > 0, "chunk content must not be empty");
    assert.ok(
      chunk.content.trim().length > 0,
      "chunk content must not be whitespace-only",
    );
    assert.equal(
      chunk.content,
      normalized.slice(chunk.startChar, chunk.endChar),
      "content must be the exact normalized-text slice",
    );
    assert.ok(chunk.startChar >= 0, "startChar must be in bounds");
    assert.ok(
      chunk.endChar <= normalized.length,
      "endChar must be in bounds",
    );
    assert.ok(chunk.startChar < chunk.endChar, "chunk range must be non-empty");
    assert.ok(
      chunk.endChar - chunk.startChar <=
        chunkingOptions.targetChars +
          chunkingOptions.overlapChars +
          chunkingOptions.minChars +
          2,
      "chunk must not exceed the target plus overlap and the trailing merge margin",
    );
  }

  for (let index = 1; index < chunks.length; index += 1) {
    assert.ok(
      chunks[index].startChar > chunks[index - 1].startChar,
      "chunks must advance in the normalized text",
    );
  }

  return { normalized, chunks };
}

test("rejects non-positive or inconsistent options", () => {
  assert.throws(() => validateChunkingOptions(options({ targetChars: 0 })), ChunkingOptionsError);
  assert.throws(() => validateChunkingOptions(options({ targetChars: -10 })), ChunkingOptionsError);
  assert.throws(() => validateChunkingOptions(options({ targetChars: 10.5 })), ChunkingOptionsError);
  assert.throws(() => validateChunkingOptions(options({ overlapChars: -1 })), ChunkingOptionsError);
  assert.throws(
    () => validateChunkingOptions(options({ targetChars: 100, overlapChars: 100 })),
    ChunkingOptionsError,
  );
  assert.throws(
    () => validateChunkingOptions(options({ targetChars: 100, overlapChars: 150 })),
    ChunkingOptionsError,
  );
  assert.throws(() => validateChunkingOptions(options({ minChars: 0 })), ChunkingOptionsError);
  assert.throws(() => validateChunkingOptions(options({ minChars: -5 })), ChunkingOptionsError);
  assert.throws(
    () => validateChunkingOptions(options({ minChars: 1201 })),
    ChunkingOptionsError,
  );
  assert.doesNotThrow(() => validateChunkingOptions(options({ overlapChars: 0 })));
});

test("normalizes whitespace consistently and idempotently", () => {
  const raw = "  Hola\r\n\r\n\r\n  mundo\u00A0  crueles  \r\n\r\n  ";
  const normalized = normalizeText(raw);

  assert.equal(normalized, "Hola\n\nmundo crueles");
  assert.equal(normalizeText(normalized), normalized);
});

test("returns no chunks for empty or whitespace-only pages", () => {
  assert.deepEqual(chunkText("", options()), []);
  assert.deepEqual(chunkText("   \n\n \t \u00A0 ", options()), []);
});

test("keeps a short page as one exact chunk", () => {
  const text = "Un párrafo corto.";
  const { normalized, chunks } = assertChunkContract(text, options());

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].content, normalized);
  assert.equal(chunks[0].startChar, 0);
  assert.equal(chunks[0].endChar, normalized.length);
});

test("packs whole paragraphs before exceeding the target", () => {
  const text = [
    "A".repeat(120),
    "B".repeat(120),
    "C".repeat(120),
  ].join("\n\n");

  const { chunks } = assertChunkContract(
    text,
    options({ targetChars: 250, overlapChars: 0, minChars: 1 }),
  );

  assert.equal(chunks.length, 2);
  assert.ok(chunks[0].content.includes("A"));
  assert.ok(chunks[0].content.includes("B"));
  assert.ok(!chunks[0].content.includes("C"));
  assert.ok(chunks[1].content.includes("C"));
  assert.ok(!chunks[1].content.includes("\n\nA"));
});

test("splits an oversized paragraph by sentences", () => {
  const text =
    "Primera oración de prueba con varias palabras. " +
    "Segunda oración de prueba con varias palabras. " +
    "Tercera oración de prueba con varias palabras.";

  const { chunks } = assertChunkContract(
    text,
    options({ targetChars: 120, overlapChars: 0, minChars: 1 }),
  );

  assert.equal(chunks.length, 2);
  assert.ok(chunks[0].content.startsWith("Primera"));
  assert.ok(chunks[0].content.includes("Segunda"));
  assert.ok(!chunks[0].content.includes("Tercera"));
  assert.ok(chunks[0].content.endsWith("."));
  assert.ok(chunks[1].content.startsWith("Tercera"));
  assert.ok(chunks[1].content.endsWith("."));
});

test("splits an oversized sentence by words without cutting them", () => {
  const text = Array.from({ length: 24 }, (_, index) => `palabra${index}`).join(" ");

  const { normalized, chunks } = assertChunkContract(
    text,
    options({ targetChars: 60, overlapChars: 0, minChars: 1 }),
  );

  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.notEqual(chunk.content.at(0), " ");
    assert.notEqual(chunk.content.at(-1), " ");
    assert.ok(
      chunk.startChar === 0 || /\s/.test(normalized[chunk.startChar - 1]),
      "chunk must start at a word boundary",
    );
    assert.ok(
      chunk.endChar === normalized.length || /\s/.test(normalized[chunk.endChar]),
      "chunk must end at a word boundary",
    );
  }
});

test("guarantees progress with a single word longer than the target", () => {
  const text = "x".repeat(25);
  const { normalized, chunks } = assertChunkContract(
    text,
    options({ targetChars: 10, overlapChars: 0, minChars: 1 }),
  );

  assert.equal(chunks.length, 3);
  assert.equal(chunks.map((chunk) => chunk.content).join(""), normalized);
});

test("adds overlap from the previous chunk at word boundaries", () => {
  const text = [
    "aaaa",
    "bbbb",
    "cccc",
    "dddd",
    "eeee",
    "ffff",
    "gggg",
    "hhhh",
    "iiii",
    "jjjj",
    "kkkk",
    "llll",
    "mmmm",
    "nnnn",
    "oooo",
    "pppp",
    "qqqq",
    "rrrr",
    "ssss",
    "tttt",
  ].join(" ");
  const chunkingOptions = options({ targetChars: 24, overlapChars: 10, minChars: 1 });
  const { normalized, chunks } = assertChunkContract(text, chunkingOptions);

  assert.ok(chunks.length > 2);

  for (let index = 1; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const previous = chunks[index - 1];
    const overlapLength = previous.endChar - chunk.startChar;

    assert.ok(
      chunk.startChar < previous.endChar,
      "consecutive chunks should overlap when the window starts inside the previous chunk",
    );
    assert.ok(overlapLength <= chunkingOptions.overlapChars);
    assert.ok(
      chunk.startChar === 0 || /\s/.test(normalized[chunk.startChar - 1]),
      "overlap must not start in the middle of a word",
    );
    assert.ok(
      chunk.endChar === normalized.length || /\s/.test(normalized[chunk.endChar]),
      "chunk must end at a word boundary",
    );
  }
});

test("overlap never starts at the previous chunk start", () => {
  const shortParagraph = `${"A".repeat(50)} ${"A".repeat(49)}`;
  const text = `${shortParagraph}\n\n${"B".repeat(1100)}`;
  const { chunks } = assertChunkContract(
    text,
    options({ targetChars: 1200, overlapChars: 150, minChars: 100 }),
  );

  assert.equal(chunks.length, 2);
  assert.ok(chunks[1].startChar > chunks[0].startChar);
  assert.ok(chunks[1].startChar < chunks[0].endChar);
});

test("merges a trailing chunk smaller than the minimum", () => {
  const text = `${"A".repeat(90)}\n\n${"B".repeat(20)}`;
  const chunkingOptions = options({ targetChars: 100, overlapChars: 0, minChars: 40 });
  const { chunks } = assertChunkContract(text, chunkingOptions);

  assert.equal(chunks.length, 1);
  assert.ok(chunks[0].content.includes("A".repeat(90)));
  assert.ok(chunks[0].content.includes("B".repeat(20)));
});

test("keeps all ranges traceable and ordered on realistic text", () => {
  const paragraph =
    "La biblioteca conserva cada página como una unidad. " +
    "Cada fragmento apunta a una sola página y a un rango de caracteres. ";
  const text = Array.from({ length: 8 }, () => paragraph.trim()).join("\n\n");

  const { normalized, chunks } = assertChunkContract(
    text,
    options({ targetChars: 240, overlapChars: 40, minChars: 80 }),
  );

  assert.ok(chunks.length > 1);

  for (const chunk of chunks) {
    assert.ok(chunk.startChar >= 0 && chunk.endChar <= normalized.length);
    assert.equal(chunk.content, normalized.slice(chunk.startChar, chunk.endChar));
  }
});
