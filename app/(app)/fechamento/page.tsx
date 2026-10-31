import { redirect } from "next/navigation";
import { Avisos } from "@/components/avisos";
import { executar } from "@/lib/core/acao";
import { obterContexto } from "@/lib/core/deps";
import { formatarReais, lerReais } from "@/lib/core/dinheiro";
import { diaSP } from "@/lib/core/tempo";
import { ROTULO_FORMA, type FormaPagamento } from "@/lib/moda/tipos";
import { fecharDia, fechamentoDoDia } from "@/lib/moda/fechamento";

const MSG = { valor: "Valor inválido. Use o formato 150,00.", falha: "Não foi possível fechar. Tente de novo." };

async function fechar(f: FormData) {
  "use server";
  const dia = String(f.get("dia") ?? "");
  const contado = lerReais(String(f.get("contado") ?? ""));
  const troco = String(f.get("troco") ?? "").trim() ? lerReais(String(f.get("troco"))) : 0;
  if (contado === null || troco === null) redirect(`/fechamento?dia=${dia}&erro=valor`);
  const r = await executar("caixa.fechar", (ctx) => fecharDia(ctx, { dia, contadoCentavos: contado, trocoInicialCentavos: troco }));
  redirect(r.ok ? `/fechamento?dia=${dia}&dif=${r.dados.diferencaCentavos}` : `/fechamento?dia=${dia}&erro=falha`);
}

export default async function Fechamento({ searchParams }: { searchParams: Promise<{ dia?: string; dif?: string; erro?: string }> }) {
  const ctx = await obterContexto();
  ctx.exigir("caixa.ver");
  const { dia: d, dif, erro } = await searchParams;
  const dia = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : diaSP();
  const f = await fechamentoDoDia(ctx, dia);
  const diferenca = dif !== undefined && /^-?\d{1,12}$/.test(dif) ? Number(dif) : null;
  const formas = Object.entries(f.caixa.entradasPorForma);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-titulo text-2xl font-bold">Fechamento do dia</h1>
      <form className="flex items-end gap-2" role="search">
        <label className="text-sm text-suave">Dia<input type="date" name="dia" defaultValue={dia} className="campo" /></label>
        <button className="botao-sec" type="submit">Ver</button>
      </form>
      <Avisos erro={erro} mensagens={MSG} />
      {diferenca !== null && (
        <p role="status" className={`rounded-xl border p-3 text-sm ${diferenca === 0 ? "border-ok/40 bg-ok/10 text-ok" : "border-atencao/50 bg-atencao/10 text-atencao"}`}>
          {diferenca === 0 ? "Caixa conferido: a gaveta bate com o sistema." : diferenca > 0 ? `Sobrou ${formatarReais(diferenca)} na gaveta.` : `Faltou ${formatarReais(-diferenca)} na gaveta.`} Fechamento registrado.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="cartao"><p className="text-xs text-suave">Vendas</p><p className="font-valor text-lg">{f.vendas}</p></div>
        <div className="cartao"><p className="text-xs text-suave">Faturamento</p><p className="font-valor text-lg">{formatarReais(f.faturamentoCentavos)}</p></div>
        <div className="cartao"><p className="text-xs text-suave">Ticket médio</p><p className="font-valor text-lg">{formatarReais(f.ticketMedioCentavos)}</p></div>
        <div className="cartao"><p className="text-xs text-suave">No crediário</p><p className="font-valor text-lg">{formatarReais(f.crediarioCentavos)}</p></div>
      </div>
      <div className="cartao">
        <h2 className="font-titulo text-lg font-bold">Entrou no caixa</h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {formas.length === 0 && <li className="text-suave">Nada hoje.</li>}
          {formas.map(([forma, v]) => (
            <li key={forma} className="flex justify-between"><span>{ROTULO_FORMA[forma as FormaPagamento] ?? forma}</span><span className="font-valor">{formatarReais(v)}</span></li>
          ))}
          <li className="flex justify-between border-t border-borda pt-1"><span>Saiu (taxas, compras, devoluções)</span><span className="font-valor">{formatarReais(f.caixa.totalSaidasCentavos)}</span></li>
        </ul>
      </div>
      {f.porVendedor.length > 0 && (
        <div className="cartao">
          <h2 className="font-titulo text-lg font-bold">Por vendedor</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {f.porVendedor.map((v) => (
              <li key={v.vendedorId} className="flex justify-between"><span>{v.nome} ({v.vendas})</span><span className="font-valor">{formatarReais(v.totalCentavos)}</span></li>
            ))}
          </ul>
        </div>
      )}
      <form action={fechar} className="cartao flex flex-col gap-3">
        <h2 className="font-titulo text-lg font-bold">Conferir a gaveta</h2>
        <p className="text-sm text-suave">Dinheiro que deve ter vindo das vendas hoje: <span className="font-valor">{formatarReais(f.dinheiroEsperadoCentavos)}</span> (some o troco que já estava lá).</p>
        <input type="hidden" name="dia" value={dia} />
        <label className="text-sm text-suave">Troco que já estava na gaveta (R$)<input name="troco" className="campo font-valor" inputMode="decimal" placeholder="0,00" /></label>
        <label className="text-sm text-suave">Dinheiro contado agora (R$)<input name="contado" className="campo font-valor" inputMode="decimal" required /></label>
        <button className="botao" type="submit">Fechar o dia</button>
      </form>
    </section>
  );
}
