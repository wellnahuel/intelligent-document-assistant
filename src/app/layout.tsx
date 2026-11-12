import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Intelligent Document Assistant",
    template: "%s · Intelligent Document Assistant",
  },
  description:
    "Biblioteca de documentos con extracción por página, chunking y búsqueda semántica local con embeddings.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <a href="#contenido" className="skipLink">
          Saltar al contenido
        </a>

        <div className="appShell">
          <header className="siteHeader">
            <div className="siteHeaderInner">
              <Link
                href="/"
                className="brand"
                aria-label="Intelligent Document Assistant — Biblioteca"
              >
                <span className="brandMark" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="M7 3.75h7.5L19 8.25v11A1.75 1.75 0 0 1 17.25 21h-10A1.75 1.75 0 0 1 5.5 19.25V5.5A1.75 1.75 0 0 1 7.25 3.75Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M14 4v4.5h4.5M8.75 12h6.5M8.75 15.5h4.25"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="brandText">
                  <strong>Intelligent Document Assistant</strong>
                  <span>Biblioteca, texto y búsqueda · Sprint 3</span>
                </span>
              </Link>

              <nav className="siteNav" aria-label="Navegación principal">
                <Link href="/" className="navLink">
                  Biblioteca
                </Link>
                <Link href="/search" className="navLink">
                  Buscar
                </Link>
                <span className="sprintBadge">Sprint 3</span>
              </nav>
            </div>
          </header>

          <main id="contenido" className="siteMain">
            {children}
          </main>

          <footer className="siteFooter">
            <div className="siteFooterInner">
              <p>Proyecto educativo de AI Engineering · RAG paso a paso.</p>
              <p className="footerWarning">
                Entorno local sin autenticación. No exponer públicamente.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
