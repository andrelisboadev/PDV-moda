import NextAuth from "next-auth";
import type { NextFetchEvent, NextRequest } from "next/server";
import { authConfig } from "./auth.config";
import { demoAtivo } from "./lib/demo/modo";
import { middlewareDemo } from "./lib/demo/middleware";

// Usa só a parte do Auth.js que roda no edge (sem Sheets).
const authMiddleware = NextAuth(authConfig).auth as unknown as (req: NextRequest, ev: NextFetchEvent) => Promise<Response | undefined>;

export default function middleware(req: NextRequest, ev: NextFetchEvent) {
  // Só liga em projeto de demonstração, sem credenciais reais (ver lib/demo/modo.ts).
  if (demoAtivo()) return middlewareDemo(req);
  return authMiddleware(req, ev);
}

export const config = {
  // Tudo, menos arquivos estáticos, ícones e as rotas de cron (que têm o próprio segredo).
  // A rota do Auth.js ENTRA aqui só para receber o limite de requisições.
  matcher: ["/((?!api/cron|_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js|offline.html).*)"],
};
