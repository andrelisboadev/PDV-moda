import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { LIMITES, ipDe, limitar } from "@/lib/core/limite";
import { rotaSoDono, type Papel } from "@/lib/core/permissoes";

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
    // Precisa existir AQUI (e não só em auth.ts): o middleware usa só esta configuração,
    // e sem isso o perfil do token nunca chega à sessão que o `authorized` lê.
    async session({ session, token }) {
      if (session.user) session.user.papel = token.papel as Papel | undefined;
      return session;
    },
    async authorized({ auth, request }) {
      const caminho = request.nextUrl.pathname;

      // Limite de requisições ANTES de qualquer outra coisa, para segurar também quem não está logado.
      const ehAuth = caminho.startsWith("/api/auth");
      if (ehAuth || request.method === "POST") {
        const l = await limitar({
          chave: `ip:${ipDe(request.headers)}:${ehAuth ? "auth" : "envio"}`,
          ...(ehAuth ? LIMITES.login : LIMITES.envioPorIp),
        });
        if (!l.ok) {
          return new Response("Muitas tentativas. Aguarde um instante e tente de novo.", {
            status: 429,
            headers: { "Retry-After": String(l.esperarSeg) },
          });
        }
      }
      if (ehAuth) return true; // as rotas do Auth.js tratam a própria autenticação

      if (caminho === "/login") return true;
      if (!auth?.user) return false; // redireciona para /login
      if (rotaSoDono(caminho) && auth.user.papel !== "dono") {
        return Response.redirect(new URL("/", request.nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
