import { NextResponse } from "next/server";
import { obterContexto } from "@/lib/core/deps";
import { ErroApp, mensagemSegura } from "@/lib/core/erros";
import { logErro } from "@/lib/core/log";

/** Quem sou eu? Exemplo do padrão de rota: contexto da sessão, nunca tenant por parâmetro. */
export async function GET() {
  try {
    const ctx = await obterContexto();
    return NextResponse.json({ nome: ctx.usuario.nome, papel: ctx.usuario.papel });
  } catch (e) {
    logErro("api/eu", e);
    const status = e instanceof ErroApp ? (e.codigo === "nao_autenticado" ? 401 : e.codigo === "proibido" ? 403 : 500) : 500;
    return NextResponse.json({ erro: mensagemSegura(e) }, { status });
  }
}
