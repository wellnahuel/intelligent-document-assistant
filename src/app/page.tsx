import type { Metadata } from "next";
import Link from "next/link";

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
          Subí un PDF, revisá el texto extraído página por página, generá
          fragmentos y probá la búsqueda semántica local con embeddings. La
          búsqueda recupera los fragmentos más cercanos; todavía no redacta una
          respuesta.
        </p>
        <ul className={styles.chips} aria-label="Tecnologías del sprint">
          <li>PDF.js</li>
          <li>PostgreSQL + pgvector</li>
          <li>Transformers.js</li>
          <li>Prisma</li>
          <li>Next.js</li>
        </ul>
        <div className={styles.heroActions}>
          <Link href="/search" className={styles.heroLink}>
            Probar búsqueda semántica →
          </Link>
        </div>
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
