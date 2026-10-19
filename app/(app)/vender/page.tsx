import { obterContexto } from "@/lib/core/deps";
import { lerConfig } from "@/lib/moda/config";
import { Pdv } from "./pdv";

export default async function Vender() {
  const ctx = await obterContexto();
  ctx.exigir("venda.criar");
  const cfg = await lerConfig(ctx);
  // O dono não tem limite; o vendedor tem o da loja. O servidor confere de novo na hora de gravar.
  const limite = ctx.usuario.papel === "dono" ? 10_000 : cfg.descontoMaxVendedorPb;
  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-titulo text-2xl font-bold">Vender</h1>
      <Pdv limiteDescontoPb={limite} estoqueNegativo={cfg.estoqueNegativo} crediarioMaxParcelas={cfg.crediarioMaxParcelas} />
    </section>
  );
}
