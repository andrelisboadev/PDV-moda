import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Usa só a parte do Auth.js que roda no edge (sem Sheets).
export default NextAuth(authConfig).auth;

export const config = {
  // Tudo, menos arquivos estáticos, rota do Auth.js e ícones.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|icons).*)"],
};
