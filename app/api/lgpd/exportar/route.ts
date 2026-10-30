import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { obterContexto } from "@/lib/core/deps";
import { ErroApp, mensagemSegura } from "@/lib/core/erros";
import { LIMITES, ipDe, limitar } from "@/lib/core/limite";
import { logErro } from "@/lib/core/log";
import { exportarDadosCliente } from "@/lib/moda/lgpd";

export const dynamic = "force-dynamic";

/** Baixa os dados de um cliente (JSON). Só o dono; a loja vem da sessão, o cliente do parâmetro `id`. */
export async function GET(req: Request) {
  try {
    const ctx = await obterContexto();
    const l = await limitar({ chave: `lgpd:${ctx.usuario.id}:${ipDe(await headers())}`, ...LIMITES.lgpd });
    if (!l.ok) throw new ErroApp("limite", "Muitas tentativas. Aguarde um instante.");
    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!/^[0-9A-Za-z_-]{10,40}$/.test(id)) throw new ErroApp("invalido", "Cliente inválido.");
    const dados = await exportarDadosCliente(ctx, id);
    return new NextResponse(JSON.stringify(dados, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="dados-do-cliente.json"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    logErro("api/lgpd/exportar", e);
    const status =
      e instanceof ErroApp
        ? ({ nao_autenticado: 401, proibido: 403, limite: 429, invalido: 400 } as Record<string, number>)[e.codigo] ?? 500
        : 500;
    return NextResponse.json({ erro: mensagemSegura(e) }, { status });
  }
}
