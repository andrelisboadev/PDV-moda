import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { rotaSoDono } from "@/lib/core/permissoes";

/**
 * Parte do Auth.js que roda também no middleware (sem acesso ao Sheets).
 * O middleware só barra o óbvio (sem sessão, ou vendedor em rota do dono);
 * quem decide de verdade é o servidor, em toda ação, lendo a aba Usuarios.
 */
export const authConfig = {
  providers: [Google],
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 }, // 12 horas
  useSecureCookies: process.env.NODE_ENV === "production",
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  callbacks: {
    authorized({ auth, request }) {
      const caminho = request.nextUrl.pathname;
      if (caminho === "/login") return true;
      if (!auth?.user) return false; // redireciona para /login
      if (rotaSoDono(caminho) && auth.user.papel !== "dono") {
        return Response.redirect(new URL("/", request.nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
