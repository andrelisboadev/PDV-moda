import { BotaoImprimir } from "@/components/imprimir";
import { obterContexto } from "@/lib/core/deps";
import { formatarReais } from "@/lib/core/dinheiro";
import { montarCatalogo } from "@/lib/moda/estoque";
import { modulosEan13, montarEtiquetas } from "@/lib/moda/etiquetas";

function Barras({ codigo }: { codigo: string }) {
  const m = modulosEan13(codigo);
  if (!m) return <p className="text-xs">{codigo}</p>;
  const largura = m.length + 18; // margem de silêncio
  const barras: React.ReactNode[] = [];
  for (let i = 0; i < m.length; ) {
    if (m[i] === "1") {
      let n = 1;
      while (m[i + n] === "1") n++;
      barras.push(<rect key={i} x={i + 9} y={0} width={n} height={40} />);
      i += n;
    } else i++;
  }
  return (
    <svg viewBox={`0 0 ${largura} 50`} className="h-10 w-full" role="img" aria-label={`Código de barras ${codigo}`} fill="black">
      {barras}
      <text x={largura / 2} y={49} fontSize="9" textAnchor="middle" fontFamily="monospace">{codigo}</text>
    </svg>
  );
}

export default async function Etiquetas({ searchParams }: { searchParams: Promise<{ produtoId?: string; copias?: string }> }) {
  const ctx = await obterContexto();
  ctx.exigir("estoque.ver");
  const { produtoId, copias } = await searchParams;
  const catalogo = await montarCatalogo(ctx);
  const n = Math.min(50, Math.max(1, Number(copias) || 1));
  const etiquetas = produtoId ? await montarEtiquetas(ctx, { produtoId, copias: n }).catch(() => []) : [];

  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-titulo text-2xl font-bold print:hidden">Etiquetas</h1>
      <form className="cartao flex flex-col gap-3 print:hidden" role="search">
        <label className="text-sm text-suave">Produto
          <select name="produtoId" className="campo" defaultValue={produtoId ?? ""}>
            <option value="" disabled>Escolha</option>
            {catalogo.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
        <label className="text-sm text-suave">Cópias de cada tamanho/cor<input name="copias" className="campo" inputMode="numeric" defaultValue={n} maxLength={2} /></label>
        <button className="botao-sec" type="submit">Montar etiquetas</button>
      </form>
      {etiquetas.length > 0 && (
        <>
          <BotaoImprimir rotulo={`Imprimir ${etiquetas.length} etiquetas`} />
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 print:grid-cols-4 print:gap-1">
            {etiquetas.map((e, i) => (
              <li key={i} className="break-inside-avoid rounded-lg border border-borda bg-white p-2 text-black">
                <p className="truncate text-xs font-semibold">{e.produto}</p>
                <p className="text-xs">{[e.tamanho, e.cor].filter((x) => x !== "Único").join(" · ")}</p>
                <p className="font-valor text-lg font-bold">{formatarReais(e.precoCentavos)}</p>
                <Barras codigo={e.codigoBarras} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
