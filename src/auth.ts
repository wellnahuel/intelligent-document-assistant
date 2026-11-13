import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authorizeCredentials } from "@/lib/auth/credentials";

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
const ONE_DAY_SECONDS = 24 * 60 * 60;

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Auth.js uses JWT sessions only for the Credentials provider. The session
  // lives in the library's signed/encrypted, HttpOnly cookie; the app never
  // stores tokens in localStorage and never implements its own cookie format.
  session: {
    strategy: "jwt",
    maxAge: SEVEN_DAYS_SECONDS,
    updateAge: ONE_DAY_SECONDS,
  },
  pages: {
    signIn: "/login",
  },
  // Local development and self-hosted deployments terminate the request at
  // the Next.js server. Behind a reverse proxy, the proxy must control the
  // Host header. AUTH_SECRET is read by Auth.js from the server environment.
  trustHost: true,
  providers: [
    Credentials({
      name: "Email y contraseña",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials, request) {
        return authorizeCredentials(credentials, request.headers);
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
      }

      return session;
    },
  },
});
