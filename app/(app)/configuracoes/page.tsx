import { redirect } from "next/navigation";
import { executar } from "@/lib/core/acao";
import { obterContexto } from "@/lib/core/deps";
import { lerPercentual, pontosBaseParaCampo } from "@/lib/core/dinheiro";
import { lerConfig, MAX_PARCELAS_CARTAO, salvarConfig } from "@/lib/moda/config";

async function salvar(formData: FormData) {
  "use server";
  const campo = (nome: string) => lerPercentual(String(formData.get(nome) ?? "").trim() || "0");
  const creditos = Array.from({ length: MAX_PARCELAS_CARTAO }, (_, i) => campo(`credito${i + 1}`));
  const desconto = campo("desconto");
  const debito = campo("debito");
  const pix = campo("pix");
  const dinheiro = campo("dinheiro");
  if ([desconto, debito, pix, dinheiro, ...creditos].some((v) => v === null)) redirect("/configuracoes?erro=valores");

  const inteiro = (nome: string, min: number, max: number) => {
    const t = String(formData.get(nome) ?? "").trim();
    const n = /^\d{1,4}$/.test(t) ? Number(t) : NaN;
    return n >= min && n <= max ? n : null;
  };
  const maxParc = inteiro("crediarioMax", 1, 24);
  const primeiro = inteiro("crediarioPrimeiro", 0, 60);
  const prazoCond = inteiro("condicionalPrazo", 1, 60);
  const prazoTroca = inteiro("trocaPrazo", 0, 3650);
  if ([maxParc, primeiro, prazoCond, prazoTroca].some((v) => v === null)) redirect("/configuracoes?erro=valores");

  const r = await executar("config.salvar", (ctx) =>
    salvarConfig(ctx, {
      descontoMaxVendedorPb: desconto,
      estoqueNegativo: formData.get("estoqueNegativo") === "on",
      taxaDebitoPb: debito,
      taxaPixPb: pix,
      taxaDinheiroPb: dinheiro,
      taxaCreditoPb: creditos,
      crediarioMaxParcelas: maxParc,
      crediarioPrimeiroDias: primeiro,
      condicionalPrazoDias: prazoCond,
      trocaPrazoDias: prazoTroca,
    }),
  );
  redirect(r.ok ? "/configuracoes?ok=1" : "/configuracoes?erro=falha");
}

function Numero({ id, rotulo, valor, ajuda }: { id: string; rotulo: string; valor: number; ajuda?: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm text-suave">{rotulo}</label>
      <input id={id} name={id} className="campo font-valor" inputMode="numeric" defaultValue={valor} />
      {ajuda && <p className="text-xs text-suave">{ajuda}</p>}
    </div>
  );
}

function Percentual({ id, rotulo, valor }: { id: string; rotulo: string; valor: number }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm text-suave">{rotulo}</label>
      <div className="flex items-center gap-2">
        <input id={id} name={id} className="campo font-valor" inputMode="decimal" defaultValue={pontosBaseParaCampo(valor)} />
        <span aria-hidden="true" className="text-suave">%</span>
      </div>
    </div>
  );
}

export default async function Configuracoes({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const ctx = await obterContexto();
  ctx.exigir("config.editar"); // o servidor confere o perfil, além do middleware
  const cfg = await lerConfig(ctx, { fresco: true });
  const { ok, erro } = await searchParams;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-titulo text-2xl font-bold">Configurações</h1>
      {ok && <p role="status" className="rounded-xl border border-ok/40 bg-ok/10 p-3 text-sm text-ok">Configurações salvas.</p>}
      {erro && (
        <p role="alert" className="rounded-xl border border-atraso/40 bg-atraso/10 p-3 text-sm text-atraso">
          {erro === "valores" ? "Confira os valores: use números de 0 a 100, como 10 ou 3,49." : "Não foi possível salvar. Tente de novo."}
        </p>
      )}
      <form action={salvar} className="flex flex-col gap-4">
        <fieldset className="cartao flex flex-col gap-3">
          <legend className="font-titulo text-lg font-bold">Desconto e estoque</legend>
          <Percentual id="desconto" rotulo="Desconto máximo que a vendedora pode dar" valor={cfg.descontoMaxVendedorPb} />
          <label className="flex min-h-botao items-center gap-3">
            <input type="checkbox" name="estoqueNegativo" defaultChecked={cfg.estoqueNegativo} className="size-6" />
            <span>Permitir vender peça sem saldo no estoque</span>
          </label>
        </fieldset>
        <fieldset className="cartao flex flex-col gap-3">
          <legend className="font-titulo text-lg font-bold">Taxas da maquininha</legend>
          <p className="text-sm text-suave">Percentual que a maquininha cobra. Entra no caixa como despesa.</p>
          <div className="grid grid-cols-2 gap-3">
            <Percentual id="debito" rotulo="Débito" valor={cfg.taxaDebitoPb} />
            <Percentual id="pix" rotulo="Pix" valor={cfg.taxaPixPb} />
            <Percentual id="dinheiro" rotulo="Dinheiro" valor={cfg.taxaDinheiroPb} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: MAX_PARCELAS_CARTAO }, (_, i) => (
              <Percentual key={i} id={`credito${i + 1}`} rotulo={`Crédito ${i + 1}x`} valor={cfg.taxaCreditoPb[i + 1] ?? 0} />
            ))}
          </div>
        </fieldset>
        <fieldset className="cartao flex flex-col gap-3">
          <legend className="font-titulo text-lg font-bold">Crediário, condicional e troca</legend>
          <Numero id="crediarioMax" rotulo="Máximo de parcelas do crediário" valor={cfg.crediarioMaxParcelas} />
          <Numero id="crediarioPrimeiro" rotulo="Dias até a 1ª parcela vencer" valor={cfg.crediarioPrimeiroDias} />
          <Numero id="condicionalPrazo" rotulo="Prazo do condicional (dias)" valor={cfg.condicionalPrazoDias} />
          <Numero id="trocaPrazo" rotulo="Prazo de troca após a venda (dias)" valor={cfg.trocaPrazoDias} ajuda="0 = sem prazo. Passou do prazo, só a dona ou o dono troca." />
        </fieldset>
        <button type="submit" className="botao">Salvar</button>
      </form>
    </section>
  );
}
