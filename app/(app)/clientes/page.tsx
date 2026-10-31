import { redirect } from "next/navigation";
import { Avisos } from "@/components/avisos";
import { executar } from "@/lib/core/acao";
import { obterContexto } from "@/lib/core/deps";
import { formatarReais, lerReais } from "@/lib/core/dinheiro";
import { linkWhatsapp } from "@/lib/core/whatsapp";
import { buscarClientes, criarCliente, definirLimiteCrediario, saldoCliente } from "@/lib/moda/clientes";

const MSG = {
  criado: "Cliente cadastrado.",
  limite: "Limite atualizado.",
  dados: "Confira os dados. O nome é obrigatório e é preciso marcar a autorização do cliente.",
  valor: "Valor inválido. Use o formato 500,00.",
};

async function cadastrar(f: FormData) {
  "use server";
  const texto = (n: string) => String(f.get(n) ?? "").trim();
  const num = (n: string) => (texto(n) ? Number(texto(n)) : undefined);
  const limite = texto("limite") ? lerReais(texto("limite")) : 0;
  if (limite === null) redirect("/clientes?erro=valor");
  const r = await executar("cliente.criar", (ctx) =>
    criarCliente(ctx, {
      nome: texto("nome"),
      telefone: texto("telefone") || undefined,
      bairro: texto("bairro") || undefined,
      aniversarioDia: num("dia"),
      aniversarioMes: num("mes"),
      consentimento: f.get("consentimento") === "on",
      ...(limite ? { limiteCrediarioCentavos: limite } : {}),
    }),
  );
  redirect(r.ok ? "/clientes?ok=criado" : "/clientes?erro=dados");
}

async function mudarLimite(f: FormData) {
  "use server";
  const valor = lerReais(String(f.get("limite") ?? ""));
  if (valor === null) redirect("/clientes?erro=valor");
  const r = await executar("cliente.limite", (ctx) => definirLimiteCrediario(ctx, String(f.get("id") ?? ""), valor));
  redirect(r.ok ? "/clientes?ok=limite" : "/clientes?erro=dados");
}

export default async function Clientes({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string; erro?: string }> }) {
  const ctx = await obterContexto();
  ctx.exigir("cliente.gerir");
  const { q = "", ok, erro } = await searchParams;
  const lista = await buscarClientes(ctx, q, 20);
  const saldos = await Promise.all(lista.map((c) => saldoCliente(ctx, c.id)));
  const dono = ctx.pode("crediario.limite");

  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-titulo text-2xl font-bold">Clientes</h1>
      <Avisos ok={ok} erro={erro} mensagens={MSG} />
      <form role="search" className="flex gap-2">
        <input name="q" defaultValue={q} className="campo" placeholder="Nome ou telefone" aria-label="Buscar cliente" />
        <button className="botao" type="submit">Buscar</button>
      </form>
      <ul className="flex flex-col gap-3">
        {lista.length === 0 && <li className="text-suave">Nenhum cliente encontrado.</li>}
        {lista.map((c, i) => {
          const s = saldos[i]!;
          const zap = linkWhatsapp(c.telefone, `Olá, ${c.nome.split(" ")[0]}! Tudo bem?`);
          return (
            <li key={c.id} className="cartao flex flex-col gap-2">
              <p className="font-semibold">{c.nome}</p>
              <p className="text-sm text-suave">{c.telefone ?? "Sem telefone"}</p>
              <p className="text-sm">
                Crediário em aberto: <span className="font-valor">{formatarReais(s.crediarioAbertoCentavos)}</span> de{" "}
                <span className="font-valor">{formatarReais(s.limiteCrediarioCentavos)}</span> · Vale-troca:{" "}
                <span className="font-valor">{formatarReais(s.creditoCentavos)}</span>
              </p>
              <div className="flex flex-wrap items-end gap-3">
                {zap && <a href={zap} className="botao-sec" target="_blank" rel="noopener noreferrer">WhatsApp</a>}
                {dono && (
                  <form action={mudarLimite} className="flex items-end gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <label className="text-sm text-suave">
                      Limite (R$)
                      <input name="limite" className="campo font-valor" inputMode="decimal" defaultValue={(s.limiteCrediarioCentavos / 100).toFixed(2).replace(".", ",")} />
                    </label>
                    <button className="botao-sec" type="submit">Salvar limite</button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <form action={cadastrar} className="cartao flex flex-col gap-3">
        <h2 className="font-titulo text-lg font-bold">Novo cliente</h2>
        <label className="text-sm text-suave">Nome<input name="nome" className="campo" required maxLength={120} autoComplete="off" /></label>
        <label className="text-sm text-suave">Telefone (WhatsApp)<input name="telefone" className="campo" inputMode="tel" maxLength={30} autoComplete="off" /></label>
        <label className="text-sm text-suave">Bairro<input name="bairro" className="campo" maxLength={80} autoComplete="off" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-suave">Aniversário: dia<input name="dia" className="campo" inputMode="numeric" maxLength={2} /></label>
          <label className="text-sm text-suave">mês<input name="mes" className="campo" inputMode="numeric" maxLength={2} /></label>
        </div>
        {dono && <label className="text-sm text-suave">Limite de crediário (R$)<input name="limite" className="campo font-valor" inputMode="decimal" placeholder="0,00" /></label>}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="consentimento" className="mt-1" />
          <span>O cliente autorizou guardar nome, telefone e aniversário para atendimento e avisos da loja.</span>
        </label>
        <button className="botao" type="submit">Cadastrar</button>
      </form>
    </section>
  );
}
