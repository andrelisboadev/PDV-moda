"use client";

import { useState } from "react";
import { ajustarEstoqueAcao } from "../actions";

interface Opcao {
  id: string;
  rotulo: string;
  saldo: number;
}

const MOTIVOS = [
  { valor: "saldo_inicial", rotulo: "Saldo inicial" },
  { valor: "contagem", rotulo: "Contagem do estoque" },
  { valor: "perda", rotulo: "Perda" },
  { valor: "avaria", rotulo: "Peça danificada" },
  { valor: "outro", rotulo: "Outro" },
];

export function AjusteForm({ opcoes }: { opcoes: Opcao[] }) {
  const [saldos, setSaldos] = useState(() => new Map(opcoes.map((o) => [o.id, o.saldo])));
  const [variacaoId, setVariacaoId] = useState(opcoes[0]?.id ?? "");
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState("saldo_inicial");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const n = /^-?\d{1,6}$/.test(quantidade.trim()) ? Number(quantidade.trim()) : null;
  const pronto = variacaoId !== "" && n !== null && n !== 0 && !enviando;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!pronto || n === null) return;
    setEnviando(true);
    setErro(null);
    setAviso(null);
    const r = await ajustarEstoqueAcao({ variacaoId, quantidade: n, motivo });
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    setSaldos((m) => new Map(m).set(variacaoId, r.dados.saldo));
    setQuantidade("");
    setAviso(`Pronto. Saldo agora: ${r.dados.saldo}.`);
  }

  if (opcoes.length === 0) return <p className="text-suave">Cadastre um produto primeiro.</p>;

  return (
    <form onSubmit={salvar} className="cartao flex flex-col gap-3">
      <div>
        <label htmlFor="peca" className="text-sm text-suave">Peça</label>
        <select id="peca" className="campo" value={variacaoId} onChange={(e) => { setVariacaoId(e.target.value); setAviso(null); }}>
          {opcoes.map((o) => (
            <option key={o.id} value={o.id}>{o.rotulo} (saldo {saldos.get(o.id) ?? o.saldo})</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="qtd" className="text-sm text-suave">Quantidade (use − para tirar)</label>
        <input id="qtd" className="campo font-valor" inputMode="numeric" value={quantidade} onChange={(e) => setQuantidade(e.target.value.replace("−", "-"))} placeholder="Ex.: 10 ou -2" aria-invalid={quantidade !== "" && n === null} />
      </div>
      <div>
        <label htmlFor="motivo" className="text-sm text-suave">Motivo</label>
        <select id="motivo" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
          {MOTIVOS.map((m) => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
        </select>
      </div>
      {erro && <p role="alert" className="rounded-xl border border-atraso/40 bg-atraso/10 p-3 text-sm text-atraso">{erro}</p>}
      {aviso && <p role="status" className="rounded-xl border border-ok/40 bg-ok/10 p-3 text-sm text-ok">{aviso}</p>}
      <button type="submit" className="botao disabled:opacity-40" disabled={!pronto}>{enviando ? "Gravando…" : "Gravar ajuste"}</button>
    </form>
  );
}
