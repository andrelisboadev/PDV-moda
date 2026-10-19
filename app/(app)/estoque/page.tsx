import Link from "next/link";
import { obterContexto } from "@/lib/core/deps";
import { formatarReais } from "@/lib/core/dinheiro";
import { abaixoDoMinimo, buscarCatalogo } from "@/lib/moda/estoque";
import { MatrizEstoque } from "./matriz";

const reais = (c: number) => formatarReais(c).replace(/ /g, " ");

export default async function Estoque({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await obterContexto();
  ctx.exigir("estoque.ver");
  const { q = "" } = await searchParams;
  const [busca, alertas] = await Promise.all([buscarCatalogo(ctx, q, 50), abaixoDoMinimo(ctx)]);
  const dono = ctx.pode("estoque.gerir");
  const verCusto = ctx.pode("estoque.custo.ver");

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-titulo text-2xl font-bold">Estoque</h1>
        {dono && (
          <div className="flex gap-2">
            <Link href="/estoque/ajustar" className="botao-sec">Ajustar</Link>
            <Link href="/estoque/novo" className="botao">Novo produto</Link>
          </div>
        )}
      </div>

      {alertas.length > 0 && (
        <div className="cartao border-atencao/50 bg-atencao/10" role="status">
          <p className="font-medium text-atencao">{alertas.length} {alertas.length === 1 ? "peça abaixo" : "peças abaixo"} do mínimo</p>
          <ul className="mt-1 text-sm">
            {alertas.slice(0, 8).map((a) => (
              <li key={a.variacaoId}>
                {a.produto} {a.tamanho !== "Único" ? `· ${a.tamanho}` : ""} {a.cor !== "Único" ? `· ${a.cor}` : ""} — <span className="font-valor">{a.saldo}</span> (mínimo {a.minimo})
              </li>
            ))}
          </ul>
        </div>
      )}

      <form role="search" className="flex gap-2">
        <label htmlFor="q" className="sr-only">Buscar produto</label>
        <input id="q" name="q" className="campo" type="search" defaultValue={q} placeholder="Buscar produto, cor, tamanho ou código" />
        <button type="submit" className="botao-sec">Buscar</button>
      </form>

      {busca.produtos.length === 0 ? (
        <p className="text-suave">Nenhum produto encontrado.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {busca.produtos.map((p) => {
            const total = p.variacoes.reduce((s, v) => s + v.saldo, 0);
            return (
              <li key={p.id} className="cartao">
                <details>
                  <summary className="flex min-h-botao cursor-pointer items-center justify-between gap-3">
                    <span>
                      <span className="block font-medium">{p.nome}</span>
                      <span className="block text-sm text-suave">
                        {p.categoria}{p.marca ? ` · ${p.marca}` : ""} · <span className="font-valor">{reais(p.precoCentavos)}</span>
                        {verCusto && p.custoCentavos !== null && <> · custo <span className="font-valor">{reais(p.custoCentavos)}</span></>}
                      </span>
                    </span>
                    <span className="font-valor text-lg">{total}</span>
                  </summary>
                  <div className="mt-3">
                    {p.variacoes.length === 0 ? <p className="text-sm text-suave">Sem variações.</p> : <MatrizEstoque produto={p} />}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      {busca.total > busca.produtos.length && (
        <p className="text-sm text-suave">Mostrando {busca.produtos.length} de {busca.total}. Use a busca para afinar.</p>
      )}
    </section>
  );
}
