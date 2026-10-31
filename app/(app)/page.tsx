import Link from "next/link";
import { obterContexto } from "@/lib/core/deps";
import { formatarReais } from "@/lib/core/dinheiro";
import { linkWhatsapp } from "@/lib/core/whatsapp";
import { montarPainel } from "@/lib/moda/painel";

export default async function Inicio() {
  const ctx = await obterContexto();
  const p = await montarPainel(ctx);
  const d = p.dono;
  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-titulo text-2xl font-bold">Início</h1>
      {ctx.pode("venda.criar") && <Link href="/vender" className="botao !min-h-[4rem] text-lg">Nova venda</Link>}

      <div className="grid grid-cols-2 gap-3">
        <div className="cartao"><p className="text-xs text-suave">{d ? "Vendas hoje" : "Minhas vendas hoje"}</p><p className="font-valor text-lg">{formatarReais(p.totalHojeCentavos)}</p><p className="text-xs text-suave">{p.vendasHoje} {p.vendasHoje === 1 ? "venda" : "vendas"}</p></div>
        {d && <div className="cartao"><p className="text-xs text-suave">Ontem</p><p className="font-valor text-lg">{formatarReais(d.ontemCentavos)}</p></div>}
        {d && <div className="cartao"><p className="text-xs text-suave">Saldo do caixa hoje</p><p className="font-valor text-lg">{formatarReais(d.caixaSaldoCentavos)}</p></div>}
      </div>

      {d && d.receberAtrasadas > 0 && (
        <Link href="/contas?tipo=receber" className="cartao border-atraso/50 bg-atraso/10">
          <p className="font-medium text-atraso">{d.receberAtrasadas} {d.receberAtrasadas === 1 ? "parcela atrasada" : "parcelas atrasadas"} no crediário</p>
          <p className="text-sm text-suave">{formatarReais(d.receberAtrasadoCentavos)} para cobrar. Toque para ver.</p>
        </Link>
      )}
      {d && (d.pagarAtrasadas > 0 || d.pagarProximos7Centavos > 0) && (
        <Link href="/contas?tipo=pagar" className="cartao border-atencao/50 bg-atencao/10">
          <p className="font-medium text-atencao">{formatarReais(d.pagarProximos7Centavos)} a pagar nos próximos 7 dias{d.pagarAtrasadas > 0 ? ` (${d.pagarAtrasadas} atrasada${d.pagarAtrasadas > 1 ? "s" : ""})` : ""}</p>
          <p className="text-sm text-suave">Toque para ver as contas.</p>
        </Link>
      )}
      {p.abaixoDoMinimo > 0 && (
        <Link href="/estoque" className="cartao border-atencao/50 bg-atencao/10">
          <p className="font-medium text-atencao">{p.abaixoDoMinimo} {p.abaixoDoMinimo === 1 ? "peça abaixo" : "peças abaixo"} do mínimo</p>
          <p className="text-sm text-suave">Toque para ver o estoque.</p>
        </Link>
      )}
      {p.condicionaisAtrasados > 0 && (
        <Link href="/condicional" className="cartao border-atencao/50 bg-atencao/10">
          <p className="font-medium text-atencao">{p.condicionaisAtrasados} {p.condicionaisAtrasados === 1 ? "condicional" : "condicionais"} com prazo vencido</p>
          <p className="text-sm text-suave">Toque para cobrar a devolução.</p>
        </Link>
      )}
      {p.aniversariantes.length > 0 && (
        <div className="cartao">
          <h2 className="font-titulo text-lg font-bold">Aniversariantes da semana</h2>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {p.aniversariantes.map((a) => {
              const zap = linkWhatsapp(a.telefone, `Parabéns, ${a.nome.split(" ")[0]}! A ${ctx.nomeLoja} deseja um dia lindo. Passe aqui para ganhar um mimo!`);
              return (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <span>{a.hoje ? "Hoje: " : `${String(a.dia).padStart(2, "0")}/${String(a.mes).padStart(2, "0")}: `}{a.nome}</span>
                  {zap && <a href={zap} className="botao-sec" target="_blank" rel="noopener noreferrer">WhatsApp</a>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
