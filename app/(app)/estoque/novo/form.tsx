"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { lerReais } from "@/lib/core/dinheiro";
import { criarProduto } from "../actions";

const GRUPOS_TAMANHO: Array<{ nome: string; valores: string[] }> = [
  { nome: "Letras", valores: ["PP", "P", "M", "G", "GG", "XG"] },
  { nome: "Numeração", valores: ["34", "36", "38", "40", "42", "44", "46"] },
  { nome: "Calçado", valores: ["33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44"] },
  { nome: "Infantil", valores: ["2", "4", "6", "8", "10", "12", "14", "16"] },
];
const CORES_COMUNS = ["Preto", "Branco", "Azul", "Vermelho", "Rosa", "Verde", "Amarelo", "Bege", "Cinza", "Marrom"];

function Escolha({
  titulo, selecionados, sugestoes, aoMudar, rotuloNovo,
}: { titulo: string; selecionados: string[]; sugestoes: string[]; aoMudar: (l: string[]) => void; rotuloNovo: string }) {
  const [novo, setNovo] = useState("");
  const alternar = (v: string) => aoMudar(selecionados.includes(v) ? selecionados.filter((x) => x !== v) : [...selecionados, v]);
  const incluir = () => {
    const v = novo.trim();
    if (v && !selecionados.some((x) => x.toLowerCase() === v.toLowerCase())) aoMudar([...selecionados, v]);
    setNovo("");
  };
  const todos = [...new Set([...sugestoes, ...selecionados])];
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-medium">{titulo}</legend>
      <div className="flex flex-wrap gap-2">
        {todos.map((v) => (
          <button key={v} type="button" className="chip" aria-pressed={selecionados.includes(v)} onClick={() => alternar(v)}>{v}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <label htmlFor={`novo-${titulo}`} className="sr-only">{rotuloNovo}</label>
        <input
          id={`novo-${titulo}`} className="campo" value={novo} placeholder={rotuloNovo} maxLength={40}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); incluir(); } }}
        />
        <button type="button" className="botao-sec" onClick={incluir}>Incluir</button>
      </div>
    </fieldset>
  );
}

export function NovoProdutoForm() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [marca, setMarca] = useState("");
  const [custo, setCusto] = useState("");
  const [preco, setPreco] = useState("");
  const [semGrade, setSemGrade] = useState(false);
  const [grupo, setGrupo] = useState(0);
  const [tamanhos, setTamanhos] = useState<string[]>([]);
  const [cores, setCores] = useState<string[]>([]);
  const [minimo, setMinimo] = useState("1");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const combinacoes = semGrade ? 1 : tamanhos.length * cores.length;
  const custoC = lerReais(custo);
  const precoC = lerReais(preco);
  const minimoN = /^\d{1,4}$/.test(minimo) ? Number(minimo) : null;
  const pronto =
    nome.trim().length >= 2 && categoria.trim().length >= 2 && custoC !== null && precoC !== null && precoC > 0 &&
    minimoN !== null && combinacoes > 0 && combinacoes <= 200 && !enviando;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!pronto || custoC === null || precoC === null || minimoN === null) return;
    setEnviando(true);
    setErro(null);
    const r = await criarProduto({
      nome, categoria, marca, custoCentavos: custoC, precoCentavos: precoC, minimo: minimoN,
      tamanhos: semGrade ? ["Único"] : tamanhos,
      cores: semGrade ? ["Único"] : cores,
    });
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    router.push("/estoque");
    router.refresh();
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4">
      <div className="cartao flex flex-col gap-3">
        <div>
          <label htmlFor="nome" className="text-sm text-suave">Nome do produto</label>
          <input id="nome" className="campo" value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Camiseta básica" required />
        </div>
        <div>
          <label htmlFor="categoria" className="text-sm text-suave">Categoria</label>
          <input id="categoria" className="campo" value={categoria} maxLength={80} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex.: Feminina, Calçados, Bijuteria" required />
        </div>
        <div>
          <label htmlFor="marca" className="text-sm text-suave">Marca (opcional)</label>
          <input id="marca" className="campo" value={marca} maxLength={80} onChange={(e) => setMarca(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="custo" className="text-sm text-suave">Custo (R$)</label>
            <input id="custo" className="campo font-valor" inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} placeholder="25,00" required aria-invalid={custo !== "" && custoC === null} />
          </div>
          <div>
            <label htmlFor="preco" className="text-sm text-suave">Preço de venda (R$)</label>
            <input id="preco" className="campo font-valor" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="59,90" required aria-invalid={preco !== "" && precoC === null} />
          </div>
        </div>
      </div>

      <div className="cartao flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">Peça sem tamanho e cor (ex.: bijuteria)</span>
          <button type="button" className="chip" aria-pressed={semGrade} onClick={() => setSemGrade((s) => !s)}>{semGrade ? "Sim" : "Não"}</button>
        </div>
        {!semGrade && (
          <>
            <div role="group" aria-label="Tipo de tamanho" className="flex flex-wrap gap-2">
              {GRUPOS_TAMANHO.map((g, i) => (
                <button key={g.nome} type="button" className="chip" aria-pressed={grupo === i} onClick={() => setGrupo(i)}>{g.nome}</button>
              ))}
            </div>
            <Escolha titulo="Tamanhos" selecionados={tamanhos} sugestoes={GRUPOS_TAMANHO[grupo]!.valores} aoMudar={setTamanhos} rotuloNovo="Outro tamanho" />
            <Escolha titulo="Cores" selecionados={cores} sugestoes={CORES_COMUNS} aoMudar={setCores} rotuloNovo="Outra cor" />
          </>
        )}
        <div>
          <label htmlFor="minimo" className="text-sm text-suave">Avisar quando restar menos que (por tamanho e cor)</label>
          <input id="minimo" className="campo font-valor" inputMode="numeric" value={minimo} onChange={(e) => setMinimo(e.target.value)} aria-invalid={minimoN === null} />
        </div>
        <p className="text-sm text-suave" aria-live="polite">
          {combinacoes > 200
            ? "Muitas combinações (máximo 200). Divida em dois produtos."
            : `${combinacoes} ${combinacoes === 1 ? "variação será criada" : "variações serão criadas"}, cada uma com código de barras próprio.`}
        </p>
      </div>

      {erro && <p role="alert" className="rounded-xl border border-atraso/40 bg-atraso/10 p-3 text-sm text-atraso">{erro}</p>}
      <button type="submit" className="botao disabled:opacity-40" disabled={!pronto}>{enviando ? "Gravando…" : "Cadastrar produto"}</button>
    </form>
  );
}
