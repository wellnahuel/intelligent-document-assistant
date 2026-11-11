import type { DocumentStatusValue } from "@/lib/documents/types";

import styles from "./StatusBadge.module.css";

export type BadgeStatus = DocumentStatusValue | "PENDING";

const LABELS: Record<BadgeStatus, string> = {
  PROCESSED: "Procesado",
  FAILED: "Error",
  PENDING: "Pendiente",
};

const TONE_CLASS: Record<BadgeStatus, string> = {
  PROCESSED: styles.processed ?? "",
  FAILED: styles.failed ?? "",
  PENDING: styles.pending ?? "",
};

export function StatusBadge({ status }: { status: BadgeStatus }) {
  return (
    <span className={`${styles.badge} ${TONE_CLASS[status]}`}>
      <span className={styles.dot} aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
