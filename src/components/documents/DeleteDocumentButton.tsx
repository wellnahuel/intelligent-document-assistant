"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { readErrorMessage } from "@/lib/client/read-error";

import styles from "./DeleteDocumentButton.module.css";

const GENERIC_ERROR = "No se pudo borrar el documento. Intentá nuevamente.";

export function DeleteDocumentButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      setError(null);
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(readErrorMessage(payload) ?? GENERIC_ERROR);
        setDeleting(false);
        setConfirming(false);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError(GENERIC_ERROR);
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={`${styles.button} ${confirming ? styles.confirm : ""}`}
        onClick={() => void handleDelete()}
        disabled={deleting}
      >
        {deleting
          ? "Borrando…"
          : confirming
            ? "Confirmar borrado"
            : "Borrar documento"}
      </button>
      {confirming && !deleting ? (
        <button
          type="button"
          className={styles.button}
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
        >
          Cancelar
        </button>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
