import "server-only";
import { cookies } from "next/headers";
import { criarContexto, type Contexto } from "@/lib/core/contexto";
import { ErroApp } from "@/lib/core/erros";
import { COOKIE_PAPEL, COOKIE_SESSAO, papelValido, sessaoValida, type PapelDemo } from "./modo";
import { DEMO_EMAIL_DONO, DEMO_EMAIL_VENDEDOR, DEMO_MESTRA_ID } from "./semente";
import { obterSessao } from "./sessoes";

export async function lerCookiesDemo(): Promise<{ sid: string | undefined; papel: PapelDemo }> {
  const c = await cookies();
  const sid = c.get(COOKIE_SESSAO)?.value;
  const p = c.get(COOKIE_PAPEL)?.value;
  return { sid: sessaoValida(sid) ? sid : undefined, papel: papelValido(p) ? p : "dono" };
}

/** Contexto do modo demonstração: a pessoa é a "dona" ou a "vendedora" fictícia, na loja da sessão dela. */
export async function obterContextoDemo(): Promise<Contexto> {
  const { sid, papel } = await lerCookiesDemo();
  if (!sid) throw new ErroApp("nao_autenticado", "Abra a demonstração pelo link com ?demo=true.");
  const s = await obterSessao(sid);
  const deps = { driver: s.driver, cache: s.cache, masterId: DEMO_MESTRA_ID };
  return criarContexto(deps, papel === "dono" ? DEMO_EMAIL_DONO : DEMO_EMAIL_VENDEDOR);
}
