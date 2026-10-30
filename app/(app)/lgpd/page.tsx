import { redirect } from "next/navigation";
import { executar } from "@/lib/core/acao";
import { obterContexto } from "@/lib/core/deps";
import { buscarClientes } from "@/lib/moda/clientes";
import { anonimizarCliente, NOME_ANONIMO } from "@/lib/moda/lgpd";

async function anonimizar(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (formData.get("confirmo") !== "on" || !/^[0-9A-Za-z_-]{10,40}$/.test(id)) redirect("/lgpd?erro=confirme");
  const r = await executar("lgpd.anonimizar", (ctx) => anonimizarCliente(ctx, id));
  redirect(r.ok ? "/lgpd?ok=1" : "/lgpd?erro=falha");
}

export default async function Lgpd({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string; erro?: string }> }) {
  const ctx = await obterContexto();
  ctx.exigir("lgpd.gerir");
  const { q = "", ok, erro } = await searchParams;
  const clientes = q.trim() ? (await buscarClientes(ctx, q, 10)).filter((c) => c.nome !== NOME_ANONIMO) : [];

  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-titulo text-2xl font-bold">Dados dos clientes (LGPD)</h1>
      <p className="text-sm text-suave">
        Se um cliente pedir uma cópia dos dados dele, ou pedir para apagar, faça por aqui. Ao apagar, o nome, o telefone, o bairro e o
        aniversário somem; as vendas continuam no caixa, mas sem identificar a pessoa. Isso não pode ser desfeito.
      </p>
      {ok && <p role="status" className="rounded-xl border border-ok/40 bg-ok/10 p-3 text-sm text-ok">Dados do cliente apagados.</p>}
      {erro && (
        <p role="alert" className="rounded-xl border border-atraso/40 bg-atraso/10 p-3 text-sm text-atraso">
          {erro === "confirme" ? "Marque a caixa para confirmar." : "Não foi possível concluir. Tente de novo."}
        </p>
      )}
      <form className="flex gap-2" role="search">
        <input name="q" defaultValue={q} className="campo" placeholder="Nome ou telefone do cliente" aria-label="Buscar cliente" />
        <button type="submit" className="min-h-botao rounded-xl bg-primaria px-4 font-medium text-white">Buscar</button>
      </form>
      <ul className="flex flex-col gap-3">
        {clientes.map((c) => (
          <li key={c.id} className="flex flex-col gap-3 rounded-2xl border border-borda bg-superficie p-4">
            <p className="font-semibold">{c.nome}</p>
            <div className="flex flex-wrap items-center gap-3">
              <a href={`/api/lgpd/exportar?id=${encodeURIComponent(c.id)}`} className="min-h-botao rounded-xl border border-borda px-4 py-3 text-sm font-medium">
                Baixar os dados
              </a>
              <form action={anonimizar} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="id" value={c.id} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="confirmo" /> Confirmo que quero apagar
                </label>
                <button type="submit" className="min-h-botao rounded-xl bg-atraso px-4 text-sm font-medium text-white">Apagar dados</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
