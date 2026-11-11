import type { Metadata } from "next";

import { DocumentLibrary } from "@/components/documents/DocumentLibrary";
import { getUploadLimits } from "@/lib/config";
import { toDocumentSummaryDto } from "@/lib/documents/dto";
import { listDocuments } from "@/lib/documents/queries";
import type { DocumentSummaryDto } from "@/lib/documents/types";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Biblioteca de documentos",
};

export default async function HomePage() {
  const limits = getUploadLimits();
  let initialDocuments: DocumentSummaryDto[] = [];
  let initialLoadError: string | null = null;

  try {
    const documents = await listDocuments();
    initialDocuments = documents.map(toDocumentSummaryDto);
  } catch (error) {
    console.error("[page] Could not load the document library.", error);
    initialLoadError = "No se pudieron cargar los documentos.";
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <p className={styles.kicker}>Intelligent Document Assistant</p>
        <h1 id="hero-title" className={styles.title}>
          Tu biblioteca de documentos, lista para RAG.
        </h1>
        <p className={styles.lead}>
          Sube un PDF y revisa el texto extraído página por página. Este primer
          hito prepara la materia prima para la búsqueda semántica y las
          respuestas con citas.
        </p>
        <ul className={styles.chips} aria-label="Tecnologías del sprint">
          <li>PDF.js</li>
          <li>PostgreSQL</li>
          <li>Prisma</li>
          <li>Next.js</li>
        </ul>
      </section>

      <DocumentLibrary
        initialDocuments={initialDocuments}
        initialLoadError={initialLoadError}
        limits={{
          maxSizeMb: limits.maxSizeMb,
          maxPages: limits.maxPages,
        }}
      />
    </div>
  );
}
