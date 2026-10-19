import Link from "next/link";
import { obterContexto } from "@/lib/core/deps";
import { abaixoDoMinimo } from "@/lib/moda/estoque";

export default async function Inicio() {
  const ctx = await obterContexto();
  const alertas = ctx.pode("estoque.ver") ? await abaixoDoMinimo(ctx) : [];
  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-titulo text-2xl font-bold">Início</h1>
      {ctx.pode("venda.criar") && (
        <Link href="/vender" className="botao !min-h-[4rem] text-lg">Nova venda</Link>
      )}
      {alertas.length > 0 && (
        <Link href="/estoque" className="cartao border-atencao/50 bg-atencao/10">
          <p className="font-medium text-atencao">
            {alertas.length} {alertas.length === 1 ? "peça abaixo" : "peças abaixo"} do mínimo
          </p>
          <p className="text-sm text-suave">Toque para ver o estoque.</p>
        </Link>
      )}
    </section>
  );
}
