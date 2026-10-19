import { obterContexto } from "@/lib/core/deps";
import { NovoProdutoForm } from "./form";

export default async function NovoProduto() {
  const ctx = await obterContexto();
  ctx.exigir("estoque.gerir"); // o servidor confere o perfil, além do middleware
  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-titulo text-2xl font-bold">Novo produto</h1>
      <NovoProdutoForm />
    </section>
  );
}
