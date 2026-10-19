import "server-only";
import { ZodError } from "zod";
import type { Contexto } from "./contexto";
import { obterContexto } from "./deps";
import { mensagemSegura } from "./erros";
import { logErro } from "./log";

export type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string };

/**
 * Envoltório de toda Server Action: obtém o contexto da sessão (loja + perfil), roda a ação
 * e devolve erro genérico para a tela. Detalhe técnico vai só para o log, sem dados pessoais.
 */
export async function executar<T>(onde: string, fn: (ctx: Contexto) => Promise<T>): Promise<Resultado<T>> {
  try {
    return { ok: true, dados: await fn(await obterContexto()) };
  } catch (e) {
    logErro(onde, e);
    return { ok: false, erro: e instanceof ZodError ? "Confira os dados informados." : mensagemSegura(e) };
  }
}
