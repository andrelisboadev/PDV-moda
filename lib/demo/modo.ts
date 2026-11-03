/**
 * Modo demonstração (?demo=true): o app abre sem login Google e sem planilha, com uma loja fictícia.
 * O estado fica guardado no navegador (localStorage) e é espelhado no servidor só enquanto a pessoa usa.
 *
 * TRAVA DE SEGURANÇA: o modo só liga em um projeto SEM credenciais reais. Se existir planilha mestra ou conta
 * de serviço do Google configurada, ele fica desligado, mesmo com DEMO_ATIVO=1. Assim, uma variável copiada
 * por engano nunca abre um sistema de cliente sem login. Este arquivo roda também no middleware (edge).
 */
export type PapelDemo = "dono" | "vendedor";

export const COOKIE_SESSAO = "bm_demo_sid";
export const COOKIE_PAPEL = "bm_demo_papel";
export const CHAVE_LOCAL = "balcao-demo:v1";
export const TAMANHO_MAX_SNAPSHOT = 4_000_000;

export function demoAtivo(env: Record<string, string | undefined> = process.env): boolean {
  return env.DEMO_ATIVO === "1" && !env.MASTER_SHEET_ID && !env.GOOGLE_SERVICE_ACCOUNT_B64;
}

export const sessaoValida = (v: string | undefined): v is string => !!v && /^[0-9a-f-]{36}$/.test(v);
export const papelValido = (v: string | undefined): v is PapelDemo => v === "dono" || v === "vendedor";
