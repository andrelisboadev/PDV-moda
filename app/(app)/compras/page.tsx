import Link from "next/link";
import { redirect } from "next/navigation";
import { Avisos } from "@/components/avisos";
import { executar } from "@/lib/core/acao";
import { obterContexto } from "@/lib/core/deps";
import { formatarReais } from "@/lib/core/dinheiro";
import { dataBr } from "@/lib/core/whatsapp";
import { criarFornecedor, listarCompras } from "@/lib/moda/compras";

const MSG = { compra: "Compra registrada. O estoque já foi atualizado.", fornecedor: "Fornecedor cadastrado.", dados: "Confira os dados do fornecedor." };

async function novoFornecedor(f: FormData) {
  "use server";
  const prazo = String(f.get("prazo") ?? "").trim();
  const r = await executar("fornecedor.criar", (ctx) =>
    criarFornecedor(ctx, {
      nome: String(f.get("nome") ?? ""),
      telefone: String(f.get("telefone") ?? "") || undefined,
      prazoPadraoDias: prazo ? Number(prazo) : 30,
    }),
  );
  redirect(r.ok ? "/compras?ok=fornecedor" : "/compras?erro=dados");
}

export default async function Compras({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const ctx = await obterContexto();
  ctx.exigir("compras.gerir");
  const { ok, erro } = await searchParams;
  const compras = await listarCompras(ctx);
  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-titulo text-2xl font-bold">Compras</h1>
      <Avisos ok={ok} erro={erro} mensagens={MSG} />
      <Link href="/compras/nova" className="botao">Registrar compra</Link>
      <ul className="flex flex-col gap-2">
        {compras.length === 0 && <li className="text-suave">Nenhuma compra registrada.</li>}
        {compras.map((c) => (
          <li key={c.id} className="cartao flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">{c.fornecedor}</p>
              <p className="text-sm text-suave">{dataBr(c.data)} · {c.pagamento === "avista" ? "à vista" : "a prazo"}</p>
            </div>
            <p className="font-valor">{formatarReais(c.totalCentavos)}</p>
          </li>
        ))}
      </ul>
      <form action={novoFornecedor} className="cartao flex flex-col gap-3">
        <h2 className="font-titulo text-lg font-bold">Novo fornecedor</h2>
        <label className="text-sm text-suave">Nome<input name="nome" className="campo" required maxLength={120} autoComplete="off" /></label>
        <label className="text-sm text-suave">Telefone<input name="telefone" className="campo" inputMode="tel" maxLength={30} autoComplete="off" /></label>
        <label className="text-sm text-suave">Prazo de pagamento (dias)<input name="prazo" className="campo" inputMode="numeric" defaultValue="30" maxLength={3} /></label>
        <button className="botao" type="submit">Cadastrar fornecedor</button>
      </form>
    </section>
  );
}
