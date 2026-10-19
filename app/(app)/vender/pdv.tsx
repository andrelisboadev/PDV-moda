"use client";

import { useEffect, useRef, useState } from "react";
import { aplicarPontosBase, formatarReais, lerPercentual, lerReais } from "@/lib/core/dinheiro";
import type { ProdutoCatalogo, ResultadoBusca, VariacaoCatalogo } from "@/lib/moda/estoque";
import type { ClienteResumo, SaldoCliente } from "@/lib/moda/clientes";
import { ROTULO_FORMA, type FormaPagamento } from "@/lib/moda/tipos";
import { buscarClientesAcao, buscarPecas, cadastrarClienteAcao, finalizarVenda, saldoClienteAcao } from "./actions";

const FORMAS_TELA: FormaPagamento[] = ["dinheiro", "pix", "debito", "credito", "crediario", "credito_loja"];

interface ItemCarrinho {
  variacaoId: string;
  rotulo: string;
  precoCentavos: number;
  quantidade: number;
  saldo: number;
}

interface LinhaPagamento {
  chave: number;
  forma: FormaPagamento;
  valorTexto: string;
  parcelas: number;
}

const novoPagamento = (chave: number): LinhaPagamento => ({ chave, forma: "pix", valorTexto: "", parcelas: 1 });
const reais = (c: number) => formatarReais(c).replace(/ /g, " ");

function rotuloDa(p: ProdutoCatalogo, v: VariacaoCatalogo) {
  const partes = [p.nome, v.tamanho !== "Único" ? v.tamanho : "", v.cor !== "Único" ? v.cor : ""].filter(Boolean);
  return partes.join(" · ");
}

export function Pdv({ limiteDescontoPb, estoqueNegativo, crediarioMaxParcelas }: { limiteDescontoPb: number; estoqueNegativo: boolean; crediarioMaxParcelas: number }) {
  const [termo, setTermo] = useState("");
  const [resultado, setResultado] = useState<ResultadoBusca | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [modoDesconto, setModoDesconto] = useState<"percentual" | "valor">("percentual");
  const [descontoTexto, setDescontoTexto] = useState("");
  const [pagamentos, setPagamentos] = useState<LinhaPagamento[]>([novoPagamento(1)]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [concluida, setConcluida] = useState<{ total: number } | null>(null);
  const [cliente, setCliente] = useState<ClienteResumo | null>(null);
  const [saldo, setSaldo] = useState<SaldoCliente | null>(null);
  const [termoCliente, setTermoCliente] = useState("");
  const [achados, setAchados] = useState<ClienteResumo[]>([]);
  const [novo, setNovo] = useState<{ nome: string; telefone: string; ok: boolean } | null>(null);
  const pedido = useRef(0);
  const proximaChave = useRef(2);
  const campoBusca = useRef<HTMLInputElement>(null);

  /* ------------------------------- carrinho ------------------------------- */
  function adicionar(p: ProdutoCatalogo, v: VariacaoCatalogo) {
    setErro(null);
    setConcluida(null);
    setCarrinho((atual) => {
      const i = atual.findIndex((x) => x.variacaoId === v.id);
      if (i >= 0) {
        if (!estoqueNegativo && atual[i]!.quantidade >= v.saldo) return atual;
        return atual.map((x, j) => (j === i ? { ...x, quantidade: x.quantidade + 1 } : x));
      }
      if (!estoqueNegativo && v.saldo < 1) return atual;
      return [...atual, { variacaoId: v.id, rotulo: rotuloDa(p, v), precoCentavos: v.precoCentavos, quantidade: 1, saldo: v.saldo }];
    });
  }

  function mudarQuantidade(variacaoId: string, delta: number) {
    setCarrinho((atual) =>
      atual
        .map((x) => {
          if (x.variacaoId !== variacaoId) return x;
          const q = x.quantidade + delta;
          return !estoqueNegativo && q > x.saldo ? x : { ...x, quantidade: q };
        })
        .filter((x) => x.quantidade > 0),
    );
  }

  /* -------------------------------- busca -------------------------------- */
  async function buscar(t: string, aoEncontrarExato = false) {
    const n = ++pedido.current;
    setBuscando(true);
    const r = await buscarPecas(t);
    if (n !== pedido.current) return; // chegou uma busca mais nova
    setBuscando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setResultado(r.dados);
    if (aoEncontrarExato && r.dados.variacaoExataId) {
      const p = r.dados.produtos[0];
      const v = p?.variacoes.find((x) => x.id === r.dados.variacaoExataId);
      if (p && v) {
        adicionar(p, v);
        setTermo("");
        setResultado(null);
      }
    }
  }

  useEffect(() => {
    const espera = setTimeout(() => {
      if (termo.trim() === "") {
        pedido.current++;
        setResultado(null);
        setBuscando(false);
      } else {
        void buscar(termo);
      }
    }, 250);
    return () => clearTimeout(espera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo]);

  /* ------------------------------- cliente ------------------------------- */
  useEffect(() => {
    const t = termoCliente.trim();
    if (cliente || t.length < 2) {
      setAchados([]);
      return;
    }
    let vivo = true;
    const espera = setTimeout(async () => {
      const r = await buscarClientesAcao(t);
      if (vivo && r.ok) setAchados(r.dados);
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
  }, [termoCliente, cliente]);

  async function escolherCliente(c: ClienteResumo | null) {
    setCliente(c);
    setSaldo(null);
    setTermoCliente("");
    setAchados([]);
    setErro(null);
    if (!c) {
      // sem cliente não há crediário nem vale-troca
      setPagamentos((a) => a.map((x) => (x.forma === "crediario" || x.forma === "credito_loja" ? { ...x, forma: "pix", parcelas: 1 } : x)));
      return;
    }
    const r = await saldoClienteAcao(c.id);
    if (r.ok) setSaldo(r.dados);
  }

  async function cadastrar() {
    if (!novo) return;
    const r = await cadastrarClienteAcao({ nome: novo.nome, telefone: novo.telefone || undefined, consentimento: novo.ok });
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setNovo(null);
    await escolherCliente({ id: r.dados.clienteId, nome: novo.nome.trim(), telefone: novo.telefone || null, limiteCrediarioCentavos: 0 });
  }

  /* ------------------------------- valores ------------------------------- */
  const subtotal = carrinho.reduce((s, i) => s + i.precoCentavos * i.quantidade, 0);
  const campoDesconto = descontoTexto.trim();
  const pontosBaseDesconto = modoDesconto === "percentual" && campoDesconto !== "" ? lerPercentual(campoDesconto) : null;
  const descontoLido =
    campoDesconto === ""
      ? 0
      : modoDesconto === "percentual"
        ? pontosBaseDesconto === null
          ? null
          : aplicarPontosBase(subtotal, pontosBaseDesconto)
        : lerReais(campoDesconto);
  const descontoInvalido = descontoLido === null;
  const desconto = descontoLido ?? 0;
  const total = Math.max(0, subtotal - desconto);
  const acimaDoLimite = desconto * 10_000 > limiteDescontoPb * subtotal;

  // A primeira linha de pagamento é sempre "o que falta"; as outras são digitadas.
  const outros = pagamentos.slice(1).reduce((s, p) => s + (lerReais(p.valorTexto) ?? 0), 0);
  const valores = pagamentos.map((p, i) => (i === 0 ? total - outros : (lerReais(p.valorTexto) ?? 0)));
  const pagamentoOk = total > 0 && valores.every((v) => v > 0);
  const podeFinalizar =
    carrinho.length > 0 && !descontoInvalido && desconto < subtotal && !acimaDoLimite && pagamentoOk && !enviando;

  async function concluir() {
    if (!podeFinalizar) return;
    setEnviando(true);
    setErro(null);
    const r = await finalizarVenda({
      ...(cliente ? { clienteId: cliente.id } : {}),
      itens: carrinho.map((i) => ({ variacaoId: i.variacaoId, quantidade: i.quantidade })),
      ...(desconto > 0
        ? { desconto: modoDesconto === "percentual" ? { tipo: "percentual", pontosBase: pontosBaseDesconto } : { tipo: "valor", centavos: desconto } }
        : {}),
      pagamentos: pagamentos.map((p, i) => ({ forma: p.forma, valorCentavos: valores[i], parcelas: p.forma === "credito" || p.forma === "crediario" ? p.parcelas : 1 })),
    });
    setEnviando(false);
    if (!r.ok) {
      setErro(r.erro); // a venda continua na tela
      return;
    }
    setConcluida({ total: r.dados.totalCentavos });
    setCarrinho([]);
    setDescontoTexto("");
    setPagamentos([novoPagamento(1)]);
    void escolherCliente(null);
    setTermo("");
    setResultado(null);
  }

  /* --------------------------------- tela --------------------------------- */
  return (
    <div className="flex flex-col gap-4">
      {concluida && (
        <div role="status" className="cartao border-ok/50 bg-ok/10">
          <p className="font-titulo text-xl font-bold text-ok">Venda concluída</p>
          <p className="font-valor text-2xl">{reais(concluida.total)}</p>
          <button type="button" className="botao mt-3 w-full" onClick={() => { setConcluida(null); campoBusca.current?.focus(); }}>
            Nova venda
          </button>
        </div>
      )}

      <section aria-labelledby="t-busca" className="cartao flex flex-col gap-3">
        <h2 id="t-busca" className="font-titulo text-lg font-bold">Peça</h2>
        <label htmlFor="busca" className="sr-only">Buscar por nome, código ou SKU</label>
        <input
          id="busca"
          ref={campoBusca}
          className="campo"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoFocus
          placeholder="Nome, código de barras ou SKU"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            // O leitor USB digita o código e aperta Enter: a peça entra direto na venda.
            if (e.key === "Enter") {
              e.preventDefault();
              if (termo.trim()) void buscar(termo.trim(), true);
            }
          }}
        />
        {buscando && <p className="text-sm text-suave" aria-live="polite">Buscando…</p>}
        {resultado && resultado.produtos.length === 0 && !buscando && <p className="text-sm text-suave">Nenhuma peça encontrada.</p>}
        <ul className="flex flex-col gap-3">
          {resultado?.produtos.map((p) => (
            <li key={p.id} className="rounded-xl border border-borda p-3">
              <p className="font-medium">{p.nome}</p>
              <p className="font-valor text-sm text-suave">{reais(p.precoCentavos)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {p.variacoes.map((v) => {
                  const semSaldo = !estoqueNegativo && v.saldo < 1;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      className="chip flex-col !px-3 !py-1 leading-tight disabled:opacity-40"
                      disabled={semSaldo}
                      onClick={() => adicionar(p, v)}
                      aria-label={`${rotuloDa(p, v)}, ${v.saldo} em estoque`}
                    >
                      <span>{[v.tamanho !== "Único" ? v.tamanho : "", v.cor !== "Único" ? v.cor : ""].filter(Boolean).join(" · ") || "Único"}</span>
                      <span className={`font-valor text-xs ${v.saldo <= 0 ? "text-atraso" : v.saldo <= v.minimo ? "text-atencao" : "text-suave"}`}>
                        {v.saldo}
                      </span>
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="t-cli" className="cartao flex flex-col gap-3">
        <h2 id="t-cli" className="font-titulo text-lg font-bold">Cliente <span className="text-sm font-normal text-suave">(opcional)</span></h2>
        {cliente ? (
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-medium">{cliente.nome}</p>
              {saldo && (
                <p className="font-valor text-xs text-suave">
                  Vale-troca {reais(saldo.creditoCentavos)} · crediário em aberto {reais(saldo.crediarioAbertoCentavos)} de {reais(saldo.limiteCrediarioCentavos)}
                </p>
              )}
            </div>
            <button type="button" className="botao-sec" onClick={() => void escolherCliente(null)}>Trocar</button>
          </div>
        ) : novo ? (
          <div className="flex flex-col gap-2">
            <input className="campo" placeholder="Nome" aria-label="Nome do cliente" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
            <input className="campo" inputMode="tel" placeholder="Telefone com DDD" aria-label="Telefone do cliente" value={novo.telefone} onChange={(e) => setNovo({ ...novo, telefone: e.target.value })} />
            <label className="flex min-h-botao items-center gap-3 text-sm">
              <input type="checkbox" className="size-6" checked={novo.ok} onChange={(e) => setNovo({ ...novo, ok: e.target.checked })} />
              <span>O cliente autorizou guardar nome e telefone para atendimento e cobrança.</span>
            </label>
            <div className="flex gap-2">
              <button type="button" className="botao flex-1 disabled:opacity-40" disabled={novo.nome.trim().length < 2 || !novo.ok} onClick={() => void cadastrar()}>Cadastrar</button>
              <button type="button" className="botao-sec" onClick={() => setNovo(null)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <>
            <label htmlFor="cliente" className="sr-only">Buscar cliente por nome ou telefone</label>
            <input id="cliente" className="campo" type="search" autoComplete="off" placeholder="Nome ou telefone" value={termoCliente} onChange={(e) => setTermoCliente(e.target.value)} />
            <ul className="flex flex-col gap-2">
              {achados.map((c) => (
                <li key={c.id}>
                  <button type="button" className="botao-sec w-full !justify-start" onClick={() => void escolherCliente(c)}>{c.nome}</button>
                </li>
              ))}
            </ul>
            <button type="button" className="botao-sec" onClick={() => setNovo({ nome: termoCliente, telefone: "", ok: false })}>Cadastrar cliente novo</button>
          </>
        )}
      </section>

      <section aria-labelledby="t-venda" className="cartao flex flex-col gap-3">
        <h2 id="t-venda" className="font-titulo text-lg font-bold">Venda</h2>
        {carrinho.length === 0 ? (
          <p className="text-sm text-suave">Nenhuma peça ainda. Busque ou passe o leitor.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {carrinho.map((i) => (
              <li key={i.variacaoId} className="flex items-center gap-2 border-b border-borda pb-2 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.rotulo}</p>
                  <p className="font-valor text-xs text-suave">{reais(i.precoCentavos)}</p>
                </div>
                <button type="button" className="botao-sec !px-0 w-12" aria-label={`Tirar uma ${i.rotulo}`} onClick={() => mudarQuantidade(i.variacaoId, -1)}>−</button>
                <span className="w-6 text-center font-valor" aria-live="polite">{i.quantidade}</span>
                <button type="button" className="botao-sec !px-0 w-12" aria-label={`Colocar mais uma ${i.rotulo}`} onClick={() => mudarQuantidade(i.variacaoId, 1)}>+</button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="desconto" className="text-sm text-suave">Desconto</label>
            <input
              id="desconto"
              className="campo font-valor"
              inputMode="decimal"
              placeholder={modoDesconto === "percentual" ? "Ex.: 10" : "Ex.: 5,00"}
              value={descontoTexto}
              onChange={(e) => setDescontoTexto(e.target.value)}
              aria-invalid={descontoInvalido || acimaDoLimite}
            />
          </div>
          <div role="group" aria-label="Tipo de desconto" className="flex gap-1">
            <button type="button" className="chip" aria-pressed={modoDesconto === "percentual"} onClick={() => setModoDesconto("percentual")}>%</button>
            <button type="button" className="chip" aria-pressed={modoDesconto === "valor"} onClick={() => setModoDesconto("valor")}>R$</button>
          </div>
        </div>
        {descontoInvalido && <p className="text-sm text-atraso">Desconto inválido.</p>}
        {acimaDoLimite && !descontoInvalido && (
          <p className="text-sm text-atencao">Desconto acima do limite da loja. Peça para a dona ou o dono fazer essa venda.</p>
        )}
      </section>

      <section aria-labelledby="t-pag" className="cartao flex flex-col gap-3">
        <h2 id="t-pag" className="font-titulo text-lg font-bold">Pagamento</h2>
        {pagamentos.map((p, i) => (
          <div key={p.chave} className="flex flex-col gap-2 rounded-xl border border-borda p-3">
            <div role="group" aria-label="Forma de pagamento" className="flex flex-wrap gap-2">
              {FORMAS_TELA.filter((f) => cliente || (f !== "crediario" && f !== "credito_loja")).map((f) => (
                <button
                  key={f}
                  type="button"
                  className="chip"
                  aria-pressed={p.forma === f}
                  onClick={() => setPagamentos((a) => a.map((x) => (x.chave === p.chave ? { ...x, forma: f, parcelas: 1 } : x)))}
                >
                  {ROTULO_FORMA[f]}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label htmlFor={`valor-${p.chave}`} className="text-sm text-suave">{i === 0 ? "Valor (o que falta)" : "Valor"}</label>
                {i === 0 ? (
                  <output id={`valor-${p.chave}`} className="campo flex items-center font-valor">{reais(Math.max(0, valores[0] ?? 0))}</output>
                ) : (
                  <input
                    id={`valor-${p.chave}`}
                    className="campo font-valor"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={p.valorTexto}
                    onChange={(e) => setPagamentos((a) => a.map((x) => (x.chave === p.chave ? { ...x, valorTexto: e.target.value } : x)))}
                  />
                )}
              </div>
              {(p.forma === "credito" || p.forma === "crediario") && (
                <div>
                  <label htmlFor={`parc-${p.chave}`} className="text-sm text-suave">Parcelas</label>
                  <select
                    id={`parc-${p.chave}`}
                    className="campo"
                    value={p.parcelas}
                    onChange={(e) => setPagamentos((a) => a.map((x) => (x.chave === p.chave ? { ...x, parcelas: Number(e.target.value) } : x)))}
                  >
                    {Array.from({ length: p.forma === "credito" ? 12 : crediarioMaxParcelas }, (_, n) => n + 1).map((n) => (
                      <option key={n} value={n}>{n}x</option>
                    ))}
                  </select>
                </div>
              )}
              {i > 0 && (
                <button type="button" className="botao-sec" aria-label="Tirar esta forma de pagamento" onClick={() => setPagamentos((a) => a.filter((x) => x.chave !== p.chave))}>
                  Tirar
                </button>
              )}
            </div>
          </div>
        ))}
        {pagamentos.length < 6 && (
          <button type="button" className="botao-sec" onClick={() => setPagamentos((a) => [...a, novoPagamento(proximaChave.current++)])}>
            Dividir em outra forma
          </button>
        )}
        {total > 0 && !pagamentoOk && <p className="text-sm text-atencao">Confira os valores: o que falta pagar ficou zerado ou negativo.</p>}
      </section>

      {erro && (
        <p role="alert" className="rounded-xl border border-atraso/40 bg-atraso/10 p-3 text-sm text-atraso">{erro}</p>
      )}

      <div className="cartao sticky bottom-20 z-[5] flex items-center justify-between gap-3 shadow-lg md:bottom-4">
        <div>
          <p className="text-xs text-suave">
            {desconto > 0 ? `Subtotal ${reais(subtotal)} · desconto ${reais(desconto)}` : "Total"}
          </p>
          <p className="font-valor text-2xl font-medium" aria-live="polite">{reais(total)}</p>
        </div>
        <button type="button" className="botao disabled:opacity-40" disabled={!podeFinalizar} onClick={() => void concluir()}>
          {enviando ? "Gravando…" : "Finalizar venda"}
        </button>
      </div>
    </div>
  );
}
