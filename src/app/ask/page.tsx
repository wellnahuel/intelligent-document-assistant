import type { Metadata } from "next";
import Link from "next/link";

import { AskPanel } from "@/components/ask/AskPanel";
import {
  getEmbeddingConfig,
  getEmbeddingModelInfo,
} from "@/lib/embeddings/config";
import { listAskDocumentOptions } from "@/lib/rag/queries";
import { getRagConfig } from "@/lib/rag/config";
import type { AskDocumentOptionDto } from "@/lib/rag/types";

import styles from "./ask.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Preguntar al documento",
};

export default async function AskPage() {
  const ragConfig = getRagConfig();
  const model = getEmbeddingModelInfo(getEmbeddingConfig());
  const providerConfigured = Boolean(
    process.env.OPENROUTER_API_KEY?.trim() && ragConfig.openRouterModel,
  );
  let documents: AskDocumentOptionDto[] = [];
  let loadError: string | null = null;

  try {
    documents = await listAskDocumentOptions(model);
  } catch (error) {
    console.error("[ask-page] Could not load document options.", error);
    loadError = "No se pudieron cargar los documentos.";
  }

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Migas de pan">
        <Link href="/">← Biblioteca</Link>
      </nav>

      <header className={styles.header}>
        <p className={styles.kicker}>Sprint 4 · RAG generativo</p>
        <h1 className={styles.title}>Preguntar al documento</h1>
        <p className={styles.lead}>
          Elegí un documento y escribí una pregunta. El servidor recupera sus
          fragmentos más cercanos con embeddings locales, los envía como
          contexto a un modelo de OpenRouter y devuelve una respuesta con
          citas verificadas a las páginas reales.
        </p>
        <p className={styles.modelLine}>
          Recuperación local con <code>{model.modelId}</code> · hasta{" "}
          {ragConfig.topK} fragmentos · {ragConfig.maxContextChars.toLocaleString("es")}{" "}
          caracteres de contexto máximo · respuesta sin streaming
        </p>
        <p className={styles.note}>
          La respuesta es de un solo turno. No hay historial de conversación,
          herramientas ni agentes. El texto de las fuentes se trata como
          material de referencia, no como instrucciones.
        </p>
      </header>

      {loadError ? (
        <p className={styles.errorCard} role="alert">
          {loadError}
        </p>
      ) : documents.length === 0 ? (
        <p className={styles.emptyCard}>
          Todavía no hay documentos.{" "}
          <Link href="/">Subí un PDF en la biblioteca</Link> y generá sus
          fragmentos y embeddings para poder preguntar.
        </p>
      ) : (
        <AskPanel
          documents={documents}
          questionMaxChars={ragConfig.questionMaxChars}
          topK={ragConfig.topK}
          providerConfigured={providerConfigured}
        />
      )}
    </div>
  );
}
