import { obterContexto } from "@/lib/core/deps";
import { formatarReais, formatarPercentual } from "@/lib/core/dinheiro";
import { diaSP } from "@/lib/core/tempo";
import { calcularComissoes } from "@/lib/moda/comissao";

const reais = (c: number) => formatarReais(c).replace(/ /g, " ");
const padrao = /^\d{4}-\d{2}-\d{2}$/;

export default async function Comissao({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  const ctx = await obterContexto();
  if (!ctx.pode("comissao.propria")) ctx.exigir("comissao.todas");
  const hoje = diaSP();
  const q = await searchParams;
  const de = q.de && padrao.test(q.de) ? q.de : `${hoje.slice(0, 8)}01`;
  const ate = q.ate && padrao.test(q.ate) ? q.ate : hoje;
  const rel = de <= ate ? await calcularComissoes(ctx, { de, ate }) : null;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-titulo text-2xl font-bold">{ctx.pode("comissao.todas") ? "Comissões" : "Minha comissão"}</h1>
      <form method="get" className="cartao grid grid-cols-2 gap-3">
        <div><label htmlFor="de" className="text-sm text-suave">De</label><input id="de" name="de" type="date" className="campo" defaultValue={de} /></div>
        <div><label htmlFor="ate" className="text-sm text-suave">Até</label><input id="ate" name="ate" type="date" className="campo" defaultValue={ate} /></div>
        <button type="submit" className="botao col-span-2">Ver período</button>
      </form>
      {!rel ? (
        <p role="alert" className="text-sm text-atraso">A data inicial precisa ser antes da final.</p>
      ) : (
        <>
          <div className="cartao"><p className="text-xs text-suave">Total no período</p><p className="font-valor text-2xl">{reais(rel.totalComissaoCentavos)}</p></div>
          {rel.vendedores.length === 0 && <p className="text-sm text-suave">Nenhuma venda no período.</p>}
          {rel.vendedores.map((v) => (
            <article key={v.vendedorId} className="cartao flex flex-col gap-1">
              <p className="font-medium">{v.nome} <span className="text-sm text-suave">({formatarPercentual(v.pontosBaseAtual)} hoje)</span></p>
              <p className="font-valor text-xl">{reais(v.comissaoCentavos)}</p>
              <p className="text-sm text-suave">{v.vendas} vendas · {reais(v.vendasCentavos)} vendidos (já com desconto)</p>
              {(v.devolvidoCentavos > 0 || v.levadoEmTrocaCentavos > 0) && (
                <p className="text-sm text-suave">Devolvido {reais(v.devolvidoCentavos)} · levado em troca {reais(v.levadoEmTrocaCentavos)}</p>
              )}
            </article>
          ))}
          <p className="text-xs text-suave">Conta pela data da venda, inclusive no crediário. O percentual de cada venda fica gravado na hora.</p>
        </>
      )}
    </section>
  );
}
