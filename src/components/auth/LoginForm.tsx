"use client";

import { useActionState } from "react";

import { loginAction } from "@/app/(auth)/actions";
import { initialAuthFormState } from "@/lib/auth/form-state";

import styles from "./auth.module.css";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialAuthFormState,
  );

  return (
    <form className={styles.form} action={formAction}>
      <div className={styles.field}>
        <label htmlFor="login-email" className={styles.label}>
          Email
        </label>
        <input
          id="login-email"
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
        <label htmlFor="login-password" className={styles.label}>
          Contraseña
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          className={styles.input}
          disabled={pending}
        />
      </div>

      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}

      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
