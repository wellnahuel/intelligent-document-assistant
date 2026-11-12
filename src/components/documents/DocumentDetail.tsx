import Link from "next/link";

import type { DocumentEmbeddingSummaryDto } from "@/lib/embeddings/types";
import type {
  ChunkingConfigDto,
  DocumentDetailDto,
} from "@/lib/documents/types";
import { formatBytes, formatDateTime } from "@/lib/format";

import { DocumentChunkViewer } from "./DocumentChunkViewer";
import { DocumentEmbeddingsPanel } from "./DocumentEmbeddingsPanel";
import { StatusBadge } from "./StatusBadge";
import styles from "./DocumentDetail.module.css";

type DocumentDetailProps = {
  document: DocumentDetailDto;
  chunking: ChunkingConfigDto;
  embeddingSummary: DocumentEmbeddingSummaryDto;
};

export function DocumentDetail({
  document,
  chunking,
  embeddingSummary,
}: DocumentDetailProps) {
  const totalCharacters = document.pages.reduce(
    (total, page) => total + page.text.length,
    0,
  );
  const totalChunks = document.pages.reduce(
    (total, page) => total + page.chunks.length,
    0,
  );
  const emptyPages = document.pages.filter(
    (page) => page.text.length === 0,
  ).length;

  return (
    <article className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Migas de pan">
        <Link href="/">← Biblioteca</Link>
      </nav>

      <header className={styles.header}>
        <div className={styles.titleRow}>
          <div>
            <p className={styles.eyebrow}>
              Documento · {document.pageCount}{" "}
              {document.pageCount === 1 ? "página" : "páginas"}
            </p>
            <h1 className={styles.title}>{document.originalFilename}</h1>
          </div>
          <StatusBadge status={document.status} />
        </div>

        <dl className={styles.metaGrid}>
          <div>
            <dt>Tamaño</dt>
            <dd>{formatBytes(document.sizeBytes)}</dd>
          </div>
          <div>
            <dt>Páginas</dt>
            <dd>{document.pageCount}</dd>
          </div>
          <div>
            <dt>Caracteres extraídos</dt>
            <dd>{totalCharacters.toLocaleString("es")}</dd>
          </div>
          <div>
            <dt>Fragmentos</dt>
            <dd>{totalChunks.toLocaleString("es")}</dd>
          </div>
          <div>
            <dt>Embeddings</dt>
            <dd>
              {embeddingSummary.embeddedChunkCount.toLocaleString("es")}/
              {totalChunks.toLocaleString("es")}
            </dd>
          </div>
          <div>
            <dt>Subido</dt>
            <dd>{formatDateTime(document.createdAt)}</dd>
          </div>
          <div>
            <dt>Tipo</dt>
            <dd>{document.mimeType}</dd>
          </div>
        </dl>
      </header>

      {document.status === "FAILED" && document.errorMessage ? (
        <p className={styles.error} role="alert">
          {document.errorMessage}
        </p>
      ) : null}

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarCard}>
            <h2 className={styles.sidebarTitle}>Índice</h2>
            <ol className={styles.pageIndex}>
              {document.pages.map((page) => (
                <li key={page.id}>
                  <a href={`#pagina-${page.pageNumber}`}>
                    Página {page.pageNumber}
                    {page.text.length === 0 ? " · vacía" : ""}
                    {page.chunks.length > 0
                      ? ` · ${page.chunks.length} frag.`
                      : ""}
                  </a>
                </li>
              ))}
            </ol>
          </div>

          <div className={styles.sidebarNote}>
            <h2 className={styles.sidebarTitle}>Cómo se extrajo</h2>
            <p>
              PDF.js leyó el contenido de cada página en el servidor. Se
              conserva el número de página para poder citarlo en los próximos
              sprints.
            </p>
            {emptyPages > 0 ? (
              <p>
                {emptyPages}{" "}
                {emptyPages === 1
                  ? "página no contiene"
                  : "páginas no contienen"}{" "}
                texto seleccionable.
              </p>
            ) : null}
            <p>
              Los fragmentos se generan por página y guardan su rango de
              caracteres dentro del texto normalizado.
            </p>
            <p>
              Los embeddings se generan desde cada fragmento y se guardan con
              el modelo, su revisión y la dimensión del vector.
            </p>
          </div>
        </aside>

        <div className={styles.pages}>
          <DocumentEmbeddingsPanel
            documentId={document.id}
            initialSummary={embeddingSummary}
          />
          <DocumentChunkViewer
            documentId={document.id}
            pages={document.pages}
            chunking={chunking}
          />
        </div>
      </div>
    </article>
  );
}
