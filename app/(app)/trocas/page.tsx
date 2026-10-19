import { obterContexto } from "@/lib/core/deps";
import { formatarReais } from "@/lib/core/dinheiro";
import { dataBr } from "@/lib/core/whatsapp";
import { vendaParaTroca } from "@/lib/moda/troca";
import { FormTroca } from "./form";

export default async function Trocas({ searchParams }: { searchParams: Promise<{ codigo?: string }> }) {
  const ctx = await obterContexto();
  ctx.exigir("troca.registrar");
  const { codigo = "" } = await searchParams;
  const venda = codigo ? await vendaParaTroca(ctx, codigo.slice(0, 40)) : null;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-titulo text-2xl font-bold">Troca ou devolução</h1>
      <form className="cartao flex flex-col gap-2" method="get">
        <label htmlFor="codigo" className="text-sm text-suave">Código da venda (6 letras, está no caixa e no comprovante)</label>
        <input id="codigo" name="codigo" className="campo font-valor uppercase" defaultValue={codigo} autoComplete="off" maxLength={26} />
        <button type="submit" className="botao">Buscar venda</button>
      </form>
      {codigo && !venda && <p role="alert" className="rounded-xl border border-atencao/40 bg-atencao/10 p-3 text-sm">Venda não encontrada. Confira o código.</p>}
      {venda && (
        <>
          <p className="text-sm text-suave">Venda de {dataBr(venda.data)} · total {formatarReais(venda.totalCentavos).replace(/ /g, " ")}</p>
          <FormTroca venda={venda} ehDono={ctx.pode("troca.estorno")} />
        </>
      )}
    </section>
  );
}
