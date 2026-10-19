"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatarReais } from "@/lib/core/dinheiro";
import type { CondicionalVisto } from "@/lib/moda/condicional";
import { resolverCondicionalAcao } from "./actions";

type Escolha = "" | "devolveu" | "comprou";
const reais = (c: number) => formatarReais(c).replace(/ /g, " ");

export function Resolver({ condicional, maxParcelas }: { condicional: CondicionalVisto; maxParcelas: number }) {
  const router = useRouter();
  const pendentes = condicional.itens.filter((i) => i.resultado === "pendente");
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({});
  const [forma, setForma] = useState<"pix" | "dinheiro" | "debito" | "credito" | "crediario" | "credito_loja">("pix");
  const [parcelas, setParcelas] = useState(1);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const comprou = pendentes.filter((i) => escolhas[i.id] === "comprou");
  const total = comprou.reduce((s, i) => s + i.precoCentavos * i.quantidade, 0);
  const algum = pendentes.some((i) => escolhas[i.id]);

  async function enviar() {
    setEnviando(true);
    setErro(null);
    const r = await resolverCondicionalAcao({
      condicionalId: condicional.id,
      resolucoes: pendentes.filter((i) => escolhas[i.id]).map((i) => ({ itemId: i.id, resultado: escolhas[i.id] })),
      ...(comprou.length > 0 ? { pagamentos: [{ forma, valorCentavos: total, parcelas: forma === "credito" || forma === "crediario" ? parcelas : 1 }] } : {}),
    });
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    setEscolhas({});
    router.refresh();
  }

  if (pendentes.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {pendentes.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-borda pt-2">
            <span className="min-w-0 flex-1 text-sm">{i.descricao} × {i.quantidade} <span className="font-valor text-suave">{reais(i.precoCentavos)}</span></span>
            <div role="group" aria-label={`O que aconteceu com ${i.descricao}`} className="flex gap-1">
              <button type="button" className="chip" aria-pressed={escolhas[i.id] === "devolveu"} onClick={() => setEscolhas((e) => ({ ...e, [i.id]: e[i.id] === "devolveu" ? "" : "devolveu" }))}>Devolveu</button>
              <button type="button" className="chip" aria-pressed={escolhas[i.id] === "comprou"} onClick={() => setEscolhas((e) => ({ ...e, [i.id]: e[i.id] === "comprou" ? "" : "comprou" }))}>Ficou</button>
            </div>
          </li>
        ))}
      </ul>
      {comprou.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor={`f-${condicional.id}`} className="text-sm text-suave">Pagamento de {reais(total)}</label>
            <select id={`f-${condicional.id}`} className="campo" value={forma} onChange={(e) => { setForma(e.target.value as typeof forma); setParcelas(1); }}>
              <option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="debito">Débito</option>
              <option value="credito">Crédito</option><option value="crediario">Crediário</option><option value="credito_loja">Vale-troca</option>
            </select>
          </div>
          {(forma === "credito" || forma === "crediario") && (
            <select aria-label="Parcelas" className="campo" value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>
              {Array.from({ length: forma === "credito" ? 12 : maxParcelas }, (_, n) => n + 1).map((n) => <option key={n} value={n}>{n}x</option>)}
            </select>
          )}
        </div>
      )}
      {erro && <p role="alert" className="rounded-xl border border-atraso/40 bg-atraso/10 p-3 text-sm text-atraso">{erro}</p>}
      <button type="button" className="botao disabled:opacity-40" disabled={!algum || enviando} onClick={() => void enviar()}>
        {enviando ? "Gravando…" : "Confirmar"}
      </button>
    </div>
  );
}
