"use client";

import { useId, useRef, useState, type FormEvent } from "react";

import type { UploadLimitsDto } from "@/lib/documents/types";
import { formatBytes } from "@/lib/format";

import styles from "./UploadForm.module.css";

type UploadFormProps = {
  limits: UploadLimitsDto;
  isUploading: boolean;
  errorMessage: string | null;
  onUpload: (file: File) => Promise<boolean>;
  onError: (message: string | null) => void;
};

export function UploadForm({
  limits,
  isUploading,
  errorMessage,
  onUpload,
  onError,
}: UploadFormProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const maxSizeBytes = limits.maxSizeMb * 1024 * 1024;

  function validateLocally(file: File): string | null {
    if (file.size === 0) {
      return "El archivo está vacío.";
    }

    if (file.size > maxSizeBytes) {
      return `El archivo supera el límite de ${limits.maxSizeMb} MB.`;
    }

    if (file.type !== "application/pdf") {
      return "El archivo debe ser un PDF.";
    }

    return null;
  }

  function selectFile(file: File | undefined) {
    if (!file) {
      return;
    }

    const localError = validateLocally(file);

    if (localError) {
      setSelectedFile(null);
      onError(localError);

      if (inputRef.current) {
        inputRef.current.value = "";
      }

      return;
    }

    setSelectedFile(file);
    onError(null);
  }

  function clearSelection() {
    setSelectedFile(null);
    onError(null);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFile || isUploading) {
      return;
    }

    const localError = validateLocally(selectedFile);

    if (localError) {
      onError(localError);
      return;
    }

    const succeeded = await onUpload(selectedFile);

    if (succeeded) {
      clearSelection();
    }
  }

  return (
    <form className={styles.card} onSubmit={handleSubmit} noValidate>
      <div className={styles.heading}>
        <span className={styles.eyebrow}>Paso 1</span>
        <h2 className={styles.title}>Sube un PDF</h2>
        <p className={styles.description}>
          Extraeremos el texto de cada página en el servidor. Todavía no hay
          OCR: el PDF debe contener texto seleccionable.
        </p>
      </div>

      <label
        htmlFor={inputId}
        className={`${styles.dropzone} ${
          isDragging ? styles.dropzoneActive : ""
        } ${selectedFile ? styles.dropzoneSelected : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          selectFile(event.dataTransfer.files[0]);
        }}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="application/pdf,.pdf"
          className={styles.fileInput}
          onChange={(event) => selectFile(event.target.files?.[0])}
          disabled={isUploading}
        />

        <span className={styles.dropIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M12 16V5m0 0-3.5 3.5M12 5l3.5 3.5M5.5 15.5v2.25A2.25 2.25 0 0 0 7.75 20h8.5a2.25 2.25 0 0 0 2.25-2.25V15.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        <span className={styles.dropTitle}>
          {selectedFile ? "Archivo seleccionado" : "Arrastra el PDF aquí"}
        </span>
        <span className={styles.dropHint}>
          {selectedFile
            ? "Puedes cambiar el archivo antes de procesarlo"
            : "o haz clic para elegirlo desde tu equipo"}
        </span>
      </label>

      {selectedFile ? (
        <div className={styles.fileSummary}>
          <div>
            <p className={styles.fileName}>{selectedFile.name}</p>
            <p className={styles.fileMeta}>
              {formatBytes(selectedFile.size)} · listo para procesar
            </p>
          </div>
          <button
            type="button"
            className={styles.removeButton}
            onClick={clearSelection}
            disabled={isUploading}
          >
            Quitar
          </button>
        </div>
      ) : null}

      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        className={styles.submit}
        disabled={!selectedFile || isUploading}
      >
        {isUploading ? (
          <>
            <span className={styles.spinner} aria-hidden="true" />
            Procesando…
          </>
        ) : (
          "Procesar documento"
        )}
      </button>

      <p className={styles.limits}>
        PDF · hasta {limits.maxSizeMb} MB · {limits.maxPages} páginas
      </p>
    </form>
  );
}
