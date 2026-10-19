"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ClienteResumo } from "@/lib/moda/clientes";
import type { ResultadoBusca } from "@/lib/moda/estoque";
import { buscarClientesCond, buscarPecasCond, saidaCondicional } from "./actions";

interface Peca { variacaoId: string; rotulo: string; quantidade: number }

export function NovoCondicional() {
  const router = useRouter();
  const [cliente, setCliente] = useState<ClienteResumo | null>(null);
  const [tc, setTc] = useState("");
  const [clientes, setClientes] = useState<ClienteResumo[]>([]);
  const [tp, setTp] = useState("");
  const [busca, setBusca] = useState<ResultadoBusca | null>(null);
  const [pecas, setPecas] = useState<Peca[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (cliente || tc.trim().length < 2) return void setClientes([]);
    const t = setTimeout(async () => {
      const r = await buscarClientesCond(tc);
      if (r.ok) setClientes(r.dados);
    }, 250);
    return () => clearTimeout(t);
  }, [tc, cliente]);
  useEffect(() => {
    if (tp.trim() === "") return void setBusca(null);
    const t = setTimeout(async () => {
      const r = await buscarPecasCond(tp);
      if (r.ok) setBusca(r.dados);
    }, 250);
    return () => clearTimeout(t);
  }, [tp]);

  const adicionar = (variacaoId: string, rotulo: string) =>
    setPecas((a) => (a.some((x) => x.variacaoId === variacaoId) ? a.map((x) => (x.variacaoId === variacaoId ? { ...x, quantidade: x.quantidade + 1 } : x)) : [...a, { variacaoId, rotulo, quantidade: 1 }]));

  async function enviar() {
    if (!cliente || pecas.length === 0) return;
    setEnviando(true);
    setErro(null);
    const r = await saidaCondicional({ clienteId: cliente.id, itens: pecas.map((p) => ({ variacaoId: p.variacaoId, quantidade: p.quantidade })) });
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    setCliente(null); setPecas([]); setTp(""); setTc("");
    router.refresh();
  }

  return (
    <section className="cartao flex flex-col gap-3" aria-labelledby="t-novo">
      <h2 id="t-novo" className="font-titulo text-lg font-bold">Nova saída para experimentar</h2>
      {cliente ? (
        <div className="flex items-center justify-between"><p className="font-medium">{cliente.nome}</p><button type="button" className="botao-sec" onClick={() => setCliente(null)}>Trocar</button></div>
      ) : (
        <>
          <input className="campo" type="search" placeholder="Cliente: nome ou telefone" aria-label="Buscar cliente" value={tc} onChange={(e) => setTc(e.target.value)} />
          {clientes.map((c) => <button key={c.id} type="button" className="botao-sec !justify-start" onClick={() => setCliente(c)}>{c.nome}</button>)}
          <p className="text-xs text-suave">Cliente novo? Cadastre na tela Vender e volte aqui.</p>
        </>
      )}
      <input className="campo" type="search" placeholder="Peça: nome, código ou SKU" aria-label="Buscar peça" value={tp} onChange={(e) => setTp(e.target.value)} />
      <ul className="flex flex-col gap-2">
        {busca?.produtos.map((p) => (
          <li key={p.id} className="rounded-xl border border-borda p-2">
            <p className="text-sm font-medium">{p.nome}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {p.variacoes.map((v) => (
                <button key={v.id} type="button" className="chip disabled:opacity-40" disabled={v.saldo < 1} onClick={() => adicionar(v.id, `${p.nome} ${v.tamanho} ${v.cor}`.replace(/ Único/g, ""))}>
                  {[v.tamanho, v.cor].filter((x) => x !== "Único").join(" · ") || "Único"} ({v.saldo})
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {pecas.length > 0 && (
        <ul className="flex flex-col gap-1">
          {pecas.map((p) => (
            <li key={p.variacaoId} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{p.rotulo} × {p.quantidade}</span>
              <button type="button" className="botao-sec" aria-label={`Tirar ${p.rotulo}`} onClick={() => setPecas((a) => a.filter((x) => x.variacaoId !== p.variacaoId))}>Tirar</button>
            </li>
          ))}
        </ul>
      )}
      {erro && <p role="alert" className="rounded-xl border border-atraso/40 bg-atraso/10 p-3 text-sm text-atraso">{erro}</p>}
      <button type="button" className="botao disabled:opacity-40" disabled={!cliente || pecas.length === 0 || enviando} onClick={() => void enviar()}>
        {enviando ? "Gravando…" : "Registrar saída"}
      </button>
    </section>
  );
}
