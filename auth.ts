import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { loginDeTesteAtivo, segredoDeTesteConfere } from "@/lib/core/e2e";
import { authConfig } from "./auth.config";
import { resolverAcesso } from "@/lib/core/deps";
import { logErro } from "@/lib/core/log";

/**
 * Login só com Google. Nenhuma senha é guardada.
 * Só entra quem está ATIVO na aba Usuarios da planilha da sua loja.
 * No token vai apenas o e-mail e o papel (para o middleware); a loja NÃO vai no token:
 * ela é sempre redescoberta no servidor a cada requisição.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    // Só existe fora da Vercel e com segredo de teste (ver lib/core/e2e.ts). Mesmo assim o e-mail
    // precisa estar ativo na planilha: o login de teste não cria acesso, só pula o Google.
    ...(loginDeTesteAtivo()
      ? [
          Credentials({
            id: "e2e",
            credentials: { email: {}, segredo: {} },
            async authorize(c) {
              if (!segredoDeTesteConfere(c?.segredo)) return null;
              const email = String(c?.email ?? "").trim().toLowerCase();
              return email && (await resolverAcesso(email)) ? { id: email, email } : null;
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile }) {
      if (account?.provider === "e2e") return loginDeTesteAtivo();
      if (account?.provider !== "google") return false;
      if (!profile?.email || profile.email_verified !== true) return false;
      try {
        return (await resolverAcesso(profile.email)) !== null;
      } catch (e) {
        logErro("signIn", e);
        return false;
      }
    },
    async jwt({ token, profile, user, account }) {
      const email = profile?.email ?? (account?.provider === "e2e" ? user?.email : undefined);
      if (email) {
        const acesso = await resolverAcesso(email);
        token.email = email.toLowerCase();
        token.papel = acesso?.papel;
      }
      return token;
    },
  },
});
