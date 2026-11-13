"use client";

import { useActionState } from "react";

import { registerAction } from "@/app/(auth)/actions";
import { initialAuthFormState } from "@/lib/auth/form-state";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/input";

import styles from "./auth.module.css";

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(
    registerAction,
    initialAuthFormState,
  );

  return (
    <form className={styles.form} action={formAction}>
      <div className={styles.field}>
        <label htmlFor="register-email" className={styles.label}>
          Email
        </label>
        <input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          className={styles.input}
          disabled={pending}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="register-password" className={styles.label}>
          Contraseña
        </label>
        <input
          id="register-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={128}
          className={styles.input}
          disabled={pending}
        />
        <span className={styles.hint}>
          Al menos {MIN_PASSWORD_LENGTH} caracteres. Se guarda solo un hash
          Argon2id, nunca la contraseña original.
        </span>
      </div>

      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}

      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? "Creando cuenta…" : "Crear cuenta"}
      </button>
    </form>
  );
}
