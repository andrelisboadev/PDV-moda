import { obterContexto } from "@/lib/core/deps";
import { linkWhatsapp, mensagemCondicional, dataBr } from "@/lib/core/whatsapp";
import { lerConfig } from "@/lib/moda/config";
import { listarCondicionais } from "@/lib/moda/condicional";
import { NovoCondicional } from "./novo";
import { Resolver } from "./resolver";

const ROTULO = { aberto: "Em aberto", vencido: "Vencido", finalizado: "Finalizado" } as const;

export default async function Condicional() {
  const ctx = await obterContexto();
  ctx.exigir("condicional.gerir");
  const [lista, cfg] = await Promise.all([listarCondicionais(ctx, { apenasAbertos: true }), lerConfig(ctx)]);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-titulo text-2xl font-bold">Condicional</h1>
      <NovoCondicional />
      <h2 className="font-titulo text-lg font-bold">Com a cliente agora</h2>
      {lista.length === 0 && <p className="text-sm text-suave">Nenhuma peça fora da loja.</p>}
      {lista.map((c) => {
        const wa = linkWhatsapp(c.clienteTelefone, mensagemCondicional({ cliente: c.clienteNome, loja: ctx.nomeLoja, devolverAte: c.devolverAte }));
        return (
          <article key={c.id} className="cartao flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{c.clienteNome}</p>
                <p className="text-sm text-suave">Devolver até {dataBr(c.devolverAte)}</p>
              </div>
              <span className={`chip ${c.status === "vencido" ? "!border-atraso !text-atraso" : ""}`}>{ROTULO[c.status]}</span>
            </div>
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="botao-sec">Lembrar no WhatsApp</a>}
            <Resolver condicional={c} maxParcelas={cfg.crediarioMaxParcelas} />
          </article>
        );
      })}
    </section>
  );
}
