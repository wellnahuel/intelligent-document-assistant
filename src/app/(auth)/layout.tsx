import type { ReactNode } from "react";

import styles from "@/components/auth/auth.module.css";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className={styles.shell}>{children}</div>;
}
