import type { Metadata } from "next";
import Link from "next/link";

import { SearchPanel } from "@/components/search/SearchPanel";
import {
  getEmbeddingModelInfo,
  getSearchConfig,
} from "@/lib/embeddings/config";

import styles from "./search.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Búsqueda semántica",
};

export default function SearchPage() {
  const searchConfig = getSearchConfig();
  const model = getEmbeddingModelInfo();

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Migas de pan">
        <Link href="/">← Biblioteca</Link>
      </nav>

      <header className={styles.header}>
        <p className={styles.kicker}>Diagnóstico · Sprint 3</p>
        <h1 className={styles.title}>Búsqueda por similitud</h1>
        <p className={styles.lead}>
          Escribí una pregunta. La app genera su embedding local, lo compara
          con los embeddings de los fragmentos usando distancia coseno y
          devuelve los más cercanos. Todavía no hay una respuesta generativa:
          esto sirve para inspeccionar qué recupera la búsqueda.
        </p>
        <p className={styles.modelLine}>
          Modelo <code>{model.modelId}</code> · revisión{" "}
          <code title={model.modelRevision}>
            {model.modelRevision.slice(0, 12)}
            {model.modelRevision.length > 12 ? "…" : ""}
          </code>{" "}
          · {model.dimensions} dimensiones · búsqueda exacta
        </p>
        <p className={styles.note}>
          No se aplica un umbral de distancia. Los resultados se ordenan del
          más cercano al más lejano, hasta el topK elegido. El texto se procesa
          localmente y no se envía a un proveedor externo. Para obtener una
          respuesta redactada con citas, usá{" "}
          <Link href="/ask">Preguntar al documento</Link>.
        </p>
      </header>

      <SearchPanel
        defaultTopK={searchConfig.defaultTopK}
        maxTopK={searchConfig.maxTopK}
        queryMaxChars={searchConfig.queryMaxChars}
      />
    </div>
  );
}
