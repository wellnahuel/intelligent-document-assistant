import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/auth/RegisterForm";
import styles from "@/components/auth/auth.module.css";
import { getSessionUser } from "@/lib/dal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crear cuenta",
};

export default async function RegisterPage() {
  if (await getSessionUser()) {
    redirect("/");
  }

  return (
    <section className={styles.card} aria-labelledby="register-title">
      <p className={styles.kicker}>Sprint 6 · Acceso</p>
      <h1 id="register-title" className={styles.title}>
        Crear cuenta
      </h1>
      <p className={styles.lead}>
        Cada cuenta tiene su propia biblioteca. La contraseña se guarda como un
        hash Argon2id y la sesión usa una cookie segura de Auth.js.
      </p>

      <RegisterForm />

      <p className={styles.footer}>
        ¿Ya tenés cuenta? <Link href="/login">Ingresar</Link>
      </p>
      <p className={styles.privacy}>
        Solo desarrollo local: no hay recuperación de contraseña ni verificación
        por email porque no hay proveedor de correo configurado.
      </p>
    </section>
  );
}
