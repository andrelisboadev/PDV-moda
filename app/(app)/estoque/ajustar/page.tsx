import { obterContexto } from "@/lib/core/deps";
import { montarCatalogo } from "@/lib/moda/estoque";
import { AjusteForm } from "./form";

export default async function AjustarEstoque() {
  const ctx = await obterContexto();
  ctx.exigir("estoque.gerir");
  const catalogo = await montarCatalogo(ctx, { fresco: true });
  const opcoes = catalogo.flatMap((p) =>
    p.variacoes.map((v) => ({
      id: v.id,
      rotulo: [p.nome, v.tamanho !== "Único" ? v.tamanho : "", v.cor !== "Único" ? v.cor : ""].filter(Boolean).join(" · "),
      saldo: v.saldo,
    })),
  );
  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-titulo text-2xl font-bold">Ajustar estoque</h1>
      <p className="text-suave">Use para o saldo inicial, contagem, perda ou avaria. Tudo fica registrado.</p>
      <AjusteForm opcoes={opcoes} />
    </section>
  );
}
