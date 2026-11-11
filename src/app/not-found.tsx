import Link from "next/link";

import styles from "./feedback.module.css";

export default function NotFound() {
  return (
    <div className={styles.wrapper}>
      <span
        className={`${styles.icon} ${styles.iconAccent}`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M7 3.75h7.5L19 8.25v11A1.75 1.75 0 0 1 17.25 21h-10A1.75 1.75 0 0 1 5.5 19.25V5.5A1.75 1.75 0 0 1 7.25 3.75Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M14 4v4.5h4.5M9.25 12.5h5.5M9.25 16h3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </span>

      <p className={styles.eyebrow}>404</p>
      <h1 className={styles.title}>Documento no encontrado</h1>
      <p className={styles.text}>
        El documento que buscas no existe o fue eliminado de la biblioteca.
      </p>

      <div className={styles.actions}>
        <Link href="/" className={styles.primary}>
          Volver a la biblioteca
        </Link>
      </div>
    </div>
  );
}
