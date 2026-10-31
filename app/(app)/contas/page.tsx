import Link from "next/link";
import { redirect } from "next/navigation";
import { Avisos } from "@/components/avisos";
import { executar } from "@/lib/core/acao";
import { obterContexto } from "@/lib/core/deps";
import { formatarReais } from "@/lib/core/dinheiro";
import { dataBr, linkWhatsapp, mensagemCobranca } from "@/lib/core/whatsapp";
import { darBaixa, listarContas } from "@/lib/moda/contas";

const MSG = { baixa: "Baixa registrada e lançada no caixa.", falha: "Não foi possível dar baixa. Confira se a parcela já não foi paga." };
const SITUACAO = { atrasada: ["Atrasada", "text-atraso"], hoje: ["Vence hoje", "text-atencao"], a_vencer: ["A vencer", "text-suave"], paga: ["Paga", "text-ok"] } as const;

async function baixar(f: FormData) {
  "use server";
  const tipo = f.get("tipo") === "pagar" ? "pagar" : "receber";
  const r = await executar("conta.baixa", (ctx) => darBaixa(ctx, { contaId: String(f.get("id") ?? ""), forma: String(f.get("forma") ?? "dinheiro") }));
  redirect(`/contas?tipo=${tipo}&${r.ok ? "ok=baixa" : "erro=falha"}`);
}

export default async function Contas({ searchParams }: { searchParams: Promise<{ tipo?: string; ok?: string; erro?: string }> }) {
  const ctx = await obterContexto();
  ctx.exigir("contas.ver");
  const { tipo: t, ok, erro } = await searchParams;
  const tipo = t === "pagar" ? "pagar" : "receber";
  const { contas, resumo } = await listarContas(ctx, { tipo });
  const clientes = tipo === "receber" ? await ctx.sistema.ler("Clientes") : [];
  const fone = new Map(clientes.map((c) => [c.id, c.telefone]));

  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-titulo text-2xl font-bold">Contas</h1>
      <Avisos ok={ok} erro={erro} mensagens={MSG} />
      <div className="flex gap-2">
        <Link href="/contas?tipo=receber" className={tipo === "receber" ? "botao" : "botao-sec"}>A receber</Link>
        <Link href="/contas?tipo=pagar" className={tipo === "pagar" ? "botao" : "botao-sec"}>A pagar</Link>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="cartao"><p className="text-xs text-suave">Em aberto</p><p className="font-valor text-lg">{formatarReais(resumo.abertasCentavos)}</p></div>
        <div className="cartao"><p className="text-xs text-suave">Atrasado</p><p className="font-valor text-lg text-atraso">{formatarReais(resumo.atrasadasCentavos)}</p></div>
        <div className="cartao"><p className="text-xs text-suave">Próx. 7 dias</p><p className="font-valor text-lg">{formatarReais(resumo.proximos7DiasCentavos)}</p></div>
      </div>
      <ul className="flex flex-col gap-3">
        {contas.length === 0 && <li className="text-suave">Nada em aberto.</li>}
        {contas.map((c) => {
          const [rotulo, cor] = SITUACAO[c.situacao];
          const zap =
            tipo === "receber" && c.situacao !== "a_vencer" && c.parceiroId
              ? linkWhatsapp(fone.get(c.parceiroId), mensagemCobranca({ cliente: c.parceiroNome.split(" ")[0] ?? "", loja: ctx.nomeLoja, valor: formatarReais(c.valorCentavos), vencimento: dataBr(c.vencimento) }))
              : null;
          return (
            <li key={c.id} className="cartao flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{c.parceiroNome || c.descricao}</p>
                  <p className="text-sm text-suave">Parcela {c.parcela}/{c.totalParcelas} · vence {dataBr(c.vencimento)}</p>
                </div>
                <div className="text-right">
                  <p className="font-valor">{formatarReais(c.valorCentavos)}</p>
                  <p className={`text-sm font-medium ${cor}`}>{rotulo}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <form action={baixar} className="flex items-end gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="tipo" value={tipo} />
                  <label className="text-sm text-suave">{tipo === "receber" ? "Recebido em" : "Pago em"}
                    <select name="forma" className="campo" defaultValue="dinheiro">
                      <option value="dinheiro">Dinheiro</option><option value="pix">Pix</option><option value="debito">Débito</option><option value="credito">Crédito</option>
                    </select>
                  </label>
                  <button className="botao" type="submit">{tipo === "receber" ? "Dar baixa" : "Marcar paga"}</button>
                </form>
                {zap && <a href={zap} className="botao-sec" target="_blank" rel="noopener noreferrer">Cobrar no WhatsApp</a>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
