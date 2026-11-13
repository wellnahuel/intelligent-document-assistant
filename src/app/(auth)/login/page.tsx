import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/LoginForm";
import styles from "@/components/auth/auth.module.css";
import { getSessionUser } from "@/lib/dal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ingresar",
};

export default async function LoginPage() {
  if (await getSessionUser()) {
    redirect("/");
  }

  return (
    <section className={styles.card} aria-labelledby="login-title">
      <p className={styles.kicker}>Sprint 6 · Acceso</p>
      <h1 id="login-title" className={styles.title}>
        Ingresar
      </h1>
      <p className={styles.lead}>
        Tus documentos, fragmentos y embeddings están aislados por cuenta.
        Iniciá sesión para ver solo tu biblioteca.
      </p>

      <LoginForm />

      <p className={styles.footer}>
        ¿Todavía no tenés cuenta?{" "}
        <Link href="/register">Crear una cuenta</Link>
      </p>
      <p className={styles.privacy}>
        Los mensajes de error no indican si un email está registrado. Los
        intentos de ingreso tienen límites por email y por IP.
      </p>
    </section>
  );
}
