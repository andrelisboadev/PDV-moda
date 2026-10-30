import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Usa só a parte do Auth.js que roda no edge (sem Sheets).
export default NextAuth(authConfig).auth;

export const config = {
  // Tudo, menos arquivos estáticos, ícones e as rotas de cron (que têm o próprio segredo).
  // A rota do Auth.js ENTRA aqui só para receber o limite de requisições.
  matcher: ["/((?!api/cron|_next/static|_next/image|favicon.ico|icons).*)"],
};
