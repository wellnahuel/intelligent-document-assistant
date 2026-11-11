import Link from "next/link";

import { formatBytes, formatDateTime } from "@/lib/format";

import { StatusBadge } from "./StatusBadge";
import styles from "./DocumentDetail.module.css";

type DocumentDetailProps = {
  document: {
    id: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    pageCount: number;
    status: "PROCESSED" | "FAILED";
    errorMessage: string | null;
    createdAt: Date;
    pages: Array<{
      id: string;
      pageNumber: number;
      text: string;
    }>;
  };
};

export function DocumentDetail({ document }: DocumentDetailProps) {
  const totalCharacters = document.pages.reduce(
    (total, page) => total + page.text.length,
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
          </div>
        </aside>

        <div className={styles.pages}>
          {document.pages.map((page) => (
            <section
              key={page.id}
              id={`pagina-${page.pageNumber}`}
              className={styles.pageCard}
              aria-labelledby={`pagina-${page.pageNumber}-titulo`}
            >
              <header className={styles.pageHeader}>
                <h2
                  id={`pagina-${page.pageNumber}-titulo`}
                  className={styles.pageTitle}
                >
                  Página {page.pageNumber}
                </h2>
                <span className={styles.charCount}>
                  {page.text.length.toLocaleString("es")} caracteres
                </span>
              </header>

              {page.text.length > 0 ? (
                <div className={styles.pageText}>{page.text}</div>
              ) : (
                <p className={styles.emptyPage}>
                  Sin texto seleccionable en esta página.
                </p>
              )}
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}
