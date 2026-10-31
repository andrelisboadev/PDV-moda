import { redirect } from "next/navigation";
import { Avisos } from "@/components/avisos";
import { executar } from "@/lib/core/acao";
import { obterContexto } from "@/lib/core/deps";
import { lerReais } from "@/lib/core/dinheiro";
import { registrarCompra } from "@/lib/moda/compras";
import { montarCatalogo } from "@/lib/moda/estoque";

const MSG = { dados: "Confira os dados: informe a quantidade de pelo menos uma peça, o custo e o fornecedor.", custo: "Custo inválido. Use o formato 25,00." };

async function salvar(f: FormData) {
  "use server";
  const produtoId = String(f.get("produtoId") ?? "");
  const volta = `/compras/nova?produtoId=${encodeURIComponent(produtoId)}`;
  const custo = lerReais(String(f.get("custo") ?? ""));
  if (custo === null) redirect(`${volta}&erro=custo`);
  const itens = [...f.entries()]
    .filter(([k, v]) => k.startsWith("q_") && /^\d{1,6}$/.test(String(v)) && Number(v) > 0)
    .map(([k, v]) => ({ variacaoId: k.slice(2), quantidade: Number(v), custoCentavos: custo }));
  const prazo = f.get("pagamento") === "prazo";
  const primeiro = String(f.get("primeiro") ?? "").trim();
  const r = await executar("compra.registrar", (ctx) =>
    registrarCompra(ctx, {
      fornecedorId: String(f.get("fornecedorId") ?? ""),
      pagamento: prazo ? "prazo" : "avista",
      forma: String(f.get("forma") ?? "dinheiro"),
      parcelas: Number(f.get("parcelas") ?? 1) || 1,
      ...(primeiro && /^\d{1,3}$/.test(primeiro) ? { primeiroVencimentoDias: Number(primeiro) } : {}),
      atualizarCusto: f.get("atualizarCusto") === "on",
      itens,
    }),
  );
  redirect(r.ok ? "/compras?ok=compra" : `${volta}&erro=dados`);
}

export default async function NovaCompra({ searchParams }: { searchParams: Promise<{ produtoId?: string; erro?: string }> }) {
  const ctx = await obterContexto();
  ctx.exigir("compras.gerir");
  const { produtoId, erro } = await searchParams;
  const [catalogo, fornecedores] = await Promise.all([montarCatalogo(ctx, { fresco: true }), ctx.sistema.lerFresco("Fornecedores")]);
  const produto = catalogo.find((p) => p.id === produtoId);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-titulo text-2xl font-bold">Registrar compra</h1>
      <Avisos erro={erro} mensagens={MSG} />
      {fornecedores.length === 0 && <p className="cartao">Cadastre um fornecedor antes, na tela Compras.</p>}
      <form className="cartao flex flex-col gap-2" role="search">
        <label className="text-sm text-suave" htmlFor="produtoId">Produto</label>
        <div className="flex gap-2">
          <select id="produtoId" name="produtoId" className="campo" defaultValue={produtoId ?? ""}>
            <option value="" disabled>Escolha o produto</option>
            {catalogo.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <button className="botao-sec" type="submit">Abrir grade</button>
        </div>
      </form>
      {produto && fornecedores.length > 0 && (
        <form action={salvar} className="flex flex-col gap-4">
          <input type="hidden" name="produtoId" value={produto.id} />
          <div className="cartao flex flex-col gap-3">
            <h2 className="font-titulo text-lg font-bold">{produto.nome}: quantidade comprada</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {produto.variacoes.map((v) => (
                <label key={v.id} className="text-sm text-suave">
                  {[v.tamanho, v.cor].filter((x) => x !== "Único").join(" · ") || "Peça"} (hoje: {v.saldo})
                  <input name={`q_${v.id}`} className="campo font-valor" inputMode="numeric" maxLength={6} placeholder="0" />
                </label>
              ))}
            </div>
            <label className="text-sm text-suave">Custo de cada peça (R$)
              <input name="custo" className="campo font-valor" inputMode="decimal" required placeholder="25,00" />
            </label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="atualizarCusto" /> Atualizar o custo do produto para este valor</label>
          </div>
          <div className="cartao flex flex-col gap-3">
            <label className="text-sm text-suave">Fornecedor
              <select name="fornecedorId" className="campo" required>
                {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </label>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm text-suave">Pagamento</legend>
              <label className="flex items-center gap-2"><input type="radio" name="pagamento" value="avista" defaultChecked /> À vista</label>
              <label className="text-sm text-suave">Saiu do caixa em
                <select name="forma" className="campo" defaultValue="dinheiro">
                  <option value="dinheiro">Dinheiro</option><option value="pix">Pix</option><option value="debito">Débito</option><option value="credito">Crédito</option>
                </select>
              </label>
              <label className="flex items-center gap-2"><input type="radio" name="pagamento" value="prazo" /> A prazo (vira conta a pagar)</label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm text-suave">Parcelas<input name="parcelas" className="campo" inputMode="numeric" defaultValue="1" maxLength={2} /></label>
                <label className="text-sm text-suave">Dias até a 1ª<input name="primeiro" className="campo" inputMode="numeric" placeholder="prazo do fornecedor" maxLength={3} /></label>
              </div>
            </fieldset>
          </div>
          <button className="botao" type="submit">Registrar compra e dar entrada no estoque</button>
        </form>
      )}
    </section>
  );
}
