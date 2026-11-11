import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = join(projectRoot, "samples");
const outputFile = join(outputDirectory, "documento-de-prueba.pdf");

function escapePdfText(text) {
  return text
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

/**
 * Builds a small, valid PDF with text on every page.
 * The xref offsets are computed from the real latin1 byte length.
 */
function buildPdf(pages) {
  const objects = [];
  const firstPageObject = 4; // catalog = 1, pages = 2, font = 3
  const pageReferences = pages.map(
    (_, index) => `${firstPageObject + index * 2} 0 R`,
  );

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageReferences.join(" ")}] /Count ${pages.length} >>`;
  objects[3] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

  pages.forEach((lines, index) => {
    const pageObject = firstPageObject + index * 2;
    const contentObject = pageObject + 1;
    const textCommands = lines
      .map((line, lineIndex) => {
        const operator = lineIndex === 0 ? "72 720 Td" : "0 -28 Td";
        return `${operator} (${escapePdfText(line)}) Tj`;
      })
      .join("\n");
    const content =
      lines.length > 0 ? `BT\n/F1 14 Tf\n${textCommands}\nET` : "";

    objects[pageObject] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] =
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\n` +
      `stream\n${content}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let objectNumber = 1; objectNumber < objects.length; objectNumber += 1) {
    offsets[objectNumber] = Buffer.byteLength(pdf, "latin1");
    pdf += `${objectNumber} 0 obj\n${objects[objectNumber]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  const objectCount = objects.length;

  pdf += `xref\n0 ${objectCount}\n0000000000 65535 f \n`;

  for (let objectNumber = 1; objectNumber < objectCount; objectNumber += 1) {
    pdf += `${String(offsets[objectNumber]).padStart(10, "0")} 00000 n \n`;
  }

  pdf +=
    `trailer\n<< /Size ${objectCount} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

const pages = [
  [
    "Intelligent Document Assistant",
    "Documento de prueba para el Sprint 1",
    "",
    "Este PDF contiene texto seleccionable en dos páginas.",
    "El período de garantía del producto es de dos años.",
    "La extracción conserva el número de página de cada fragmento.",
  ],
  [
    "Segunda página del documento de prueba",
    "",
    "El asistente divide el texto en fragmentos y conserva los metadatos.",
    "La búsqueda semántica y las citas llegan en los próximos sprints.",
    "Esta frase también debería aparecer en la vista de detalle.",
  ],
];

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(outputFile, buildPdf(pages));

console.log(`PDF de prueba generado en: ${outputFile}`);
