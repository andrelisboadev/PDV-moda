import "server-only";
import { ZodError } from "zod";
import type { Contexto } from "./contexto";
import { obterContexto } from "./deps";
import { ErroApp, mensagemSegura } from "./erros";
import { LIMITES, limitar } from "./limite";
import { logErro } from "./log";

export type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string };

/**
 * Envoltório de toda Server Action: obtém o contexto da sessão (loja + perfil), roda a ação
 * e devolve erro genérico para a tela. Detalhe técnico vai só para o log, sem dados pessoais.
 */
export async function executar<T>(onde: string, fn: (ctx: Contexto) => Promise<T>): Promise<Resultado<T>> {
  try {
    const ctx = await obterContexto();
    const l = await limitar({ chave: `u:${ctx.usuario.id}`, ...LIMITES.acaoPorUsuario });
    if (!l.ok) throw new ErroApp("limite", `Muitas ações em pouco tempo. Aguarde ${l.esperarSeg} segundos e tente de novo.`);
    return { ok: true, dados: await fn(ctx) };
  } catch (e) {
    logErro(onde, e);
    return { ok: false, erro: e instanceof ZodError ? "Confira os dados informados." : mensagemSegura(e) };
  }
}
