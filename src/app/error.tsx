"use client";

import Link from "next/link";
import { useEffect } from "react";

import styles from "./feedback.module.css";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] Unhandled error.", error);
  }, [error]);

  return (
    <div className={styles.wrapper} role="alert">
      <span
        className={`${styles.icon} ${styles.iconDanger}`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M12 8v5m0 3.25v.25M10.3 4.6 3.2 17a2 2 0 0 0 1.73 3h14.14a2 2 0 0 0 1.73-3L13.7 4.6a2 2 0 0 0-3.4 0Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <p className={styles.eyebrow}>Error inesperado</p>
      <h1 className={styles.title}>No pudimos mostrar esta página</h1>
      <p className={styles.text}>
        Revisa que PostgreSQL esté en ejecución y vuelve a intentarlo. Si el
        problema continúa, consulta la terminal del servidor para ver el detalle
        técnico.
      </p>

      <div className={styles.actions}>
        <button type="button" onClick={reset} className={styles.primary}>
          Reintentar
        </button>
        <Link href="/" className={styles.secondary}>
          Volver a la biblioteca
        </Link>
      </div>
    </div>
  );
}
