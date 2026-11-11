import { join, sep } from "node:path";

/**
 * PDF.js needs its bundled standard fonts when a PDF uses a non-embedded
 * standard font (for example Helvetica). In this local Next.js app,
 * `process.cwd()` is the project root, where `node_modules` lives.
 *
 * Bundlers virtualize `require.resolve` for external packages, so a plain
 * filesystem path is more reliable here than trying to resolve the package.
 * If the path is unavailable, extraction still works and PDF.js only logs
 * a warning.
 */
export const STANDARD_FONT_DATA_URL = `${join(
  process.cwd(),
  "node_modules",
  "pdfjs-dist",
  "standard_fonts",
)}${sep}`;
