import { resumoCaixaDoDia } from "@/lib/core/caixa";
import { obterContexto } from "@/lib/core/deps";
import { formatarReais } from "@/lib/core/dinheiro";
import { ROTULO_FORMA, type FormaPagamento } from "@/lib/moda/tipos";

const reais = (c: number) => formatarReais(c).replace(/ /g, " ");
const rotulo = (f: string) => ROTULO_FORMA[f as FormaPagamento] ?? f;

export default async function Caixa() {
  const ctx = await obterContexto();
  ctx.exigir("caixa.ver");
  const r = await resumoCaixaDoDia(ctx);
  const formas = [...new Set([...Object.keys(r.entradasPorForma), ...Object.keys(r.saidasPorForma)])];

  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-titulo text-2xl font-bold">Caixa de hoje</h1>
      <p className="text-sm text-suave">{r.vendas} {r.vendas === 1 ? "venda" : "vendas"} no dia</p>
      <div className="grid grid-cols-3 gap-3">
        <div className="cartao"><p className="text-xs text-suave">Entradas</p><p className="font-valor text-lg">{reais(r.totalEntradasCentavos)}</p></div>
        <div className="cartao"><p className="text-xs text-suave">Saídas</p><p className="font-valor text-lg">{reais(r.totalSaidasCentavos)}</p></div>
        <div className="cartao"><p className="text-xs text-suave">Saldo</p><p className="font-valor text-lg">{reais(r.saldoCentavos)}</p></div>
      </div>
      <div className="cartao overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Entradas e saídas por forma de pagamento</caption>
          <thead>
            <tr className="text-left text-suave">
              <th scope="col" className="p-2">Forma</th>
              <th scope="col" className="p-2 text-right">Entradas</th>
              <th scope="col" className="p-2 text-right">Saídas</th>
            </tr>
          </thead>
          <tbody>
            {formas.length === 0 && (
              <tr><td colSpan={3} className="p-2 text-suave">Nenhum lançamento hoje.</td></tr>
            )}
            {formas.map((f) => (
              <tr key={f} className="border-t border-borda">
                <th scope="row" className="p-2 text-left font-medium">{rotulo(f)}</th>
                <td className="p-2 text-right font-valor">{reais(r.entradasPorForma[f] ?? 0)}</td>
                <td className="p-2 text-right font-valor">{reais(r.saidasPorForma[f] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-suave">Taxas da maquininha aparecem como saída. Abertura e fechamento do dia chegam na Fase 4.</p>
    </section>
  );
}
