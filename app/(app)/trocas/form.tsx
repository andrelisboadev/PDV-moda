"use client";

import { useEffect, useState } from "react";
import { formatarReais } from "@/lib/core/dinheiro";
import type { ResultadoBusca } from "@/lib/moda/estoque";
import type { ResultadoTroca, VendaParaTroca } from "@/lib/moda/troca";
import { buscarPecasTroca, trocaAcao } from "./actions";

const reais = (c: number) => formatarReais(c).replace(/ /g, " ");
interface Levada { variacaoId: string; rotulo: string; quantidade: number }

export function FormTroca({ venda, ehDono }: { venda: VendaParaTroca; ehDono: boolean }) {
  const [qtd, setQtd] = useState<Record<string, number>>({});
  const [motivo, setMotivo] = useState("");
  const [tp, setTp] = useState("");
  const [busca, setBusca] = useState<ResultadoBusca | null>(null);
  const [levadas, setLevadas] = useState<Levada[]>([]);
  const [destino, setDestino] = useState<"vale" | "dinheiro">("vale");
  const [forma, setForma] = useState<"pix" | "dinheiro" | "debito" | "credito" | "credito_loja">("pix");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [feita, setFeita] = useState<ResultadoTroca | null>(null);

  useEffect(() => {
    if (tp.trim() === "") return void setBusca(null);
    const t = setTimeout(async () => {
      const r = await buscarPecasTroca(tp);
      if (r.ok) setBusca(r.dados);
    }, 250);
    return () => clearTimeout(t);
  }, [tp]);

  const devolvidos = venda.itens.filter((i) => (qtd[i.variacaoId] ?? 0) > 0);
  const aprox = devolvidos.reduce((s, i) => s + i.valorUnitarioLiquidoCentavos * (qtd[i.variacaoId] ?? 0), 0);

  async function enviar() {
    setEnviando(true);
    setErro(null);
    const r = await trocaAcao({
      vendaId: venda.vendaId,
      devolvidos: devolvidos.map((i) => ({ variacaoId: i.variacaoId, quantidade: qtd[i.variacaoId] })),
      novos: levadas.map((l) => ({ variacaoId: l.variacaoId, quantidade: l.quantidade })),
      motivo,
      destino,
      pagarDiferencaCom: { forma, parcelas: 1 },
    });
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    setFeita(r.dados);
  }

  if (feita) {
    return (
      <div role="status" className="cartao border-ok/50 bg-ok/10">
        <p className="font-titulo text-xl font-bold text-ok">Troca registrada</p>
        <p className="text-sm">Devolvido {reais(feita.devolvidoCentavos)} · levado {reais(feita.levadoCentavos)}</p>
        {feita.diferencaCentavos > 0 && <p className="font-valor text-lg">Cliente pagou {reais(feita.diferencaCentavos)}</p>}
        {feita.valeCentavos > 0 && <p className="font-valor text-lg">Vale-troca de {reais(feita.valeCentavos)}</p>}
        {feita.dinheiroCentavos > 0 && <p className="font-valor text-lg">Devolver em dinheiro {reais(feita.dinheiroCentavos)}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="cartao flex flex-col gap-2" aria-labelledby="t-dev">
        <h2 id="t-dev" className="font-titulo text-lg font-bold">O que volta</h2>
        {venda.itens.map((i) => {
          const resta = i.vendida - i.devolvida;
          return (
            <div key={i.variacaoId} className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 text-sm">{i.nome} {i.tamanho} {i.cor} <span className="text-suave">(restam {resta})</span></span>
              <select aria-label={`Quantas ${i.nome} ${i.tamanho} ${i.cor} voltam`} className="campo !w-20" disabled={resta === 0} value={qtd[i.variacaoId] ?? 0} onChange={(e) => setQtd((q) => ({ ...q, [i.variacaoId]: Number(e.target.value) }))}>
                {Array.from({ length: resta + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          );
        })}
        <label htmlFor="motivo" className="text-sm text-suave">Motivo</label>
        <input id="motivo" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: não serviu" maxLength={200} />
      </section>

      <section className="cartao flex flex-col gap-2" aria-labelledby="t-lev">
        <h2 id="t-lev" className="font-titulo text-lg font-bold">O que leva no lugar <span className="text-sm font-normal text-suave">(opcional)</span></h2>
        <input className="campo" type="search" placeholder="Nome, código ou SKU" aria-label="Buscar peça" value={tp} onChange={(e) => setTp(e.target.value)} />
        {busca?.produtos.map((p) => (
          <div key={p.id} className="rounded-xl border border-borda p-2">
            <p className="text-sm font-medium">{p.nome} <span className="font-valor text-suave">{reais(p.precoCentavos)}</span></p>
            <div className="mt-1 flex flex-wrap gap-2">
              {p.variacoes.map((v) => (
                <button key={v.id} type="button" className="chip disabled:opacity-40" disabled={v.saldo < 1} onClick={() => setLevadas((a) => a.some((x) => x.variacaoId === v.id) ? a.map((x) => x.variacaoId === v.id ? { ...x, quantidade: x.quantidade + 1 } : x) : [...a, { variacaoId: v.id, rotulo: `${p.nome} ${v.tamanho} ${v.cor}`.replace(/ Único/g, ""), quantidade: 1 }])}>
                  {[v.tamanho, v.cor].filter((x) => x !== "Único").join(" · ") || "Único"} ({v.saldo})
                </button>
              ))}
            </div>
          </div>
        ))}
        {levadas.map((l) => (
          <div key={l.variacaoId} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{l.rotulo} × {l.quantidade}</span>
            <button type="button" className="botao-sec" onClick={() => setLevadas((a) => a.filter((x) => x.variacaoId !== l.variacaoId))}>Tirar</button>
          </div>
        ))}
      </section>

      <section className="cartao flex flex-col gap-2" aria-labelledby="t-dif">
        <h2 id="t-dif" className="font-titulo text-lg font-bold">Acerto</h2>
        <p className="text-sm text-suave">O valor exato é calculado ao confirmar (devolução ≈ {reais(aprox)}, com o desconto da venda).</p>
        <label htmlFor="forma" className="text-sm text-suave">Se o cliente tiver que pagar a diferença</label>
        <select id="forma" className="campo" value={forma} onChange={(e) => setForma(e.target.value as typeof forma)}>
          <option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="debito">Débito</option><option value="credito">Crédito 1x</option>
          {venda.clienteId && <option value="credito_loja">Vale-troca</option>}
        </select>
        <label htmlFor="destino" className="text-sm text-suave">Se sobrar valor para o cliente</label>
        <select id="destino" className="campo" value={destino} onChange={(e) => setDestino(e.target.value as typeof destino)}>
          <option value="vale">Vale-troca</option>
          {ehDono && <option value="dinheiro">Devolver em dinheiro</option>}
        </select>
      </section>

      {erro && <p role="alert" className="rounded-xl border border-atraso/40 bg-atraso/10 p-3 text-sm text-atraso">{erro}</p>}
      <button type="button" className="botao disabled:opacity-40" disabled={devolvidos.length === 0 || motivo.trim().length < 2 || enviando} onClick={() => void enviar()}>
        {enviando ? "Gravando…" : "Confirmar troca"}
      </button>
    </div>
  );
}
