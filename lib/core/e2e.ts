import { timingSafeEqual } from "node:crypto";

/**
 * Login de teste para o Playwright. Fica DESLIGADO por padrão e só liga se TODAS as condições valerem:
 *  - E2E_LOGIN_SECRET definido com 24+ caracteres;
 *  - fora da Vercel (nenhuma variável VERCEL), ou seja, só na máquina de quem desenvolve ou na CI.
 * Na Vercel (produção ou preview) nunca liga, mesmo que alguém copie a variável por engano.
 */
export function loginDeTesteAtivo(env: Record<string, string | undefined> = process.env): boolean {
  return (env.E2E_LOGIN_SECRET?.length ?? 0) >= 24 && !env.VERCEL && !env.VERCEL_ENV;
}

export function segredoDeTesteConfere(recebido: unknown, env: Record<string, string | undefined> = process.env): boolean {
  if (!loginDeTesteAtivo(env) || typeof recebido !== "string") return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(env.E2E_LOGIN_SECRET ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}
