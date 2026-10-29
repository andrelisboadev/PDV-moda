import NextAuth from "next-auth";
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
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return false;
      if (!profile?.email || profile.email_verified !== true) return false;
      try {
        return (await resolverAcesso(profile.email)) !== null;
      } catch (e) {
        logErro("signIn", e);
        return false;
      }
    },
    async jwt({ token, profile }) {
      if (profile?.email) {
        const acesso = await resolverAcesso(profile.email);
        token.email = profile.email.toLowerCase();
        token.papel = acesso?.papel;
      }
      return token;
    },
  },
});
