import { obterContexto } from "@/lib/core/deps";
import { formatarPercentual, formatarReais } from "@/lib/core/dinheiro";
import { mesAtual, resumoMensal } from "@/lib/moda/resumo";

const ROTULO: Record<string, string> = {
  venda: "Vendas", taxa_maquininha: "Taxas da maquininha", compra: "Compras de mercadoria", pagamento_conta: "Contas pagas",
  recebimento_crediario: "Crediário recebido", troca_diferenca: "Diferença de trocas", devolucao: "Devoluções em dinheiro",
};
const nome = (c: string) => ROTULO[c] ?? c;

export default async function Resumo({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const ctx = await obterContexto();
  ctx.exigir("caixa.ver");
  const { mes: m } = await searchParams;
  const mes = m && /^\d{4}-\d{2}$/.test(m) ? m : mesAtual();
  const r = await resumoMensal(ctx, mes);
  const linha = (rot: string, v: number, forte = false) => (
    <li className={`flex justify-between ${forte ? "border-t border-borda pt-1 font-semibold" : ""}`}><span>{rot}</span><span className="font-valor">{formatarReais(v)}</span></li>
  );
  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-titulo text-2xl font-bold">Resumo do mês</h1>
      <form className="flex items-end gap-2" role="search">
        <label className="text-sm text-suave">Mês<input type="month" name="mes" defaultValue={mes} className="campo" /></label>
        <button className="botao-sec" type="submit">Ver</button>
      </form>
      <div className="grid grid-cols-2 gap-3">
        <div className="cartao"><p className="text-xs text-suave">Faturamento</p><p className="font-valor text-lg">{formatarReais(r.faturamentoCentavos)}</p></div>
        <div className="cartao"><p className="text-xs text-suave">Lucro bruto</p><p className="font-valor text-lg">{formatarReais(r.lucroBrutoCentavos)}</p><p className="text-xs text-suave">margem {formatarPercentual(r.margemPontosBase)}</p></div>
        <div className="cartao"><p className="text-xs text-suave">Vendas</p><p className="font-valor text-lg">{r.vendas}</p></div>
        <div className="cartao"><p className="text-xs text-suave">Ticket médio</p><p className="font-valor text-lg">{formatarReais(r.ticketMedioCentavos)}</p></div>
      </div>
      <div className="cartao">
        <h2 className="font-titulo text-lg font-bold">Como chegou no lucro</h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {linha("Vendido", r.faturamentoCentavos)}
          {linha("Custo das peças vendidas", -r.custoCentavos)}
          {linha("Taxas da maquininha", -r.taxasCentavos)}
          {linha("Lucro bruto", r.lucroBrutoCentavos, true)}
        </ul>
        <p className="mt-2 text-xs text-suave">Não desconta aluguel, salários nem outras despesas. Trocas e devoluções do mês: {r.trocas} ({formatarReais(r.trocasValorCentavos)}), mostradas à parte.</p>
      </div>
      <div className="cartao">
        <h2 className="font-titulo text-lg font-bold">Dinheiro do mês (caixa)</h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {Object.entries(r.entradasPorCategoria).map(([c, v]) => linha(`Entrou: ${nome(c)}`, v))}
          {Object.entries(r.saidasPorCategoria).map(([c, v]) => linha(`Saiu: ${nome(c)}`, -v))}
        </ul>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="cartao"><p className="text-xs text-suave">A receber (em aberto)</p><p className="font-valor text-lg">{formatarReais(r.aReceberCentavos)}</p></div>
        <div className="cartao"><p className="text-xs text-suave">A pagar (em aberto)</p><p className="font-valor text-lg">{formatarReais(r.aPagarCentavos)}</p></div>
      </div>
      <div className="cartao">
        <h2 className="font-titulo text-lg font-bold">Mais vendidos</h2>
        <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-sm">
          {r.maisVendidos.length === 0 && <li className="list-none text-suave">Sem vendas no mês.</li>}
          {r.maisVendidos.map((p) => <li key={p.nome}>{p.nome}: {p.quantidade} un. ({formatarReais(p.totalCentavos)})</li>)}
        </ol>
      </div>
      <div className="cartao">
        <h2 className="font-titulo text-lg font-bold">Por vendedor</h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {r.porVendedor.map((v) => <li key={v.nome} className="flex justify-between"><span>{v.nome} ({v.vendas})</span><span className="font-valor">{formatarReais(v.totalCentavos)}</span></li>)}
        </ul>
      </div>
    </section>
  );
}
