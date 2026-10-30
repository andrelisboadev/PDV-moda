/**
 * Conferência automática: confere os registros que devem sempre fechar. Só LÊ.
 * Nunca devolve nome, telefone nem valor de cliente: só o código da regra e o ID do registro.
 */
import type { NomeAba } from "@/lib/core/schema";
import type { RepoTenant } from "@/lib/core/sheets/repo";

export interface Divergencia {
  regra:
    | "venda_pagamentos"
    | "venda_itens"
    | "venda_estoque"
    | "vale_negativo"
    | "caixa_venda";
  id: string;
}

const FORMAS_SEM_CAIXA = new Set(["crediario", "credito_loja"]);

interface Dados {
  vendas: Array<{ id: string; totalCentavos: number; descontoCentavos: number; status: string }>;
  itens: Array<{ vendaId: string; variacaoId: string; quantidade: number; precoCentavos: number }>;
  pagamentos: Array<{ vendaId: string; forma: string; valorCentavos: number }>;
  movimentos: Array<{ variacaoId: string; tipo: string; quantidade: number; origemId?: string }>;
  creditos: Array<{ clienteId: string; valorCentavos: number }>;
  caixa: Array<{ tipo: string; categoria: string; valorCentavos: number; origemId?: string }>;
}

const somar = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

function agrupar<T>(xs: T[], chave: (x: T) => string | undefined): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = chave(x);
    if (!k) continue;
    (m.get(k) ?? m.set(k, []).get(k)!).push(x);
  }
  return m;
}

/** Função pura: recebe as linhas e devolve o que não fecha. */
export function conferir(d: Dados): Divergencia[] {
  const out: Divergencia[] = [];
  const itens = agrupar(d.itens, (x) => x.vendaId);
  const pags = agrupar(d.pagamentos, (x) => x.vendaId);
  const movs = agrupar(d.movimentos.filter((m) => m.tipo === "venda"), (x) => x.origemId);
  const caixa = agrupar(d.caixa.filter((c) => c.categoria === "venda" && c.tipo === "entrada"), (x) => x.origemId);

  for (const v of d.vendas.filter((x) => x.status === "concluida")) {
    const its = itens.get(v.id) ?? [];
    const ps = pags.get(v.id) ?? [];

    if (somar(ps, (p) => p.valorCentavos) !== v.totalCentavos) out.push({ regra: "venda_pagamentos", id: v.id });
    if (somar(its, (i) => i.quantidade * i.precoCentavos) - v.descontoCentavos !== v.totalCentavos) {
      out.push({ regra: "venda_itens", id: v.id });
    }

    const baixa = new Map<string, number>();
    for (const m of movs.get(v.id) ?? []) baixa.set(m.variacaoId, (baixa.get(m.variacaoId) ?? 0) - m.quantidade);
    const pedido = new Map<string, number>();
    for (const i of its) pedido.set(i.variacaoId, (pedido.get(i.variacaoId) ?? 0) + i.quantidade);
    const mesmo = baixa.size === pedido.size && [...pedido].every(([k, q]) => baixa.get(k) === q);
    if (!mesmo) out.push({ regra: "venda_estoque", id: v.id });

    const esperadoCaixa = somar(ps.filter((p) => !FORMAS_SEM_CAIXA.has(p.forma)), (p) => p.valorCentavos);
    if (somar(caixa.get(v.id) ?? [], (c) => c.valorCentavos) !== esperadoCaixa) out.push({ regra: "caixa_venda", id: v.id });
  }

  const saldos = new Map<string, number>();
  for (const c of d.creditos) saldos.set(c.clienteId, (saldos.get(c.clienteId) ?? 0) + c.valorCentavos);
  for (const [id, s] of saldos) if (s < 0) out.push({ regra: "vale_negativo", id });

  return out;
}

const ler = (repo: RepoTenant, aba: NomeAba) => repo.lerFresco(aba as never) as Promise<never[]>;

/** Lê as abas da loja (sem cache) e confere. */
export async function conferirLoja(repo: RepoTenant): Promise<Divergencia[]> {
  const [vendas, itens, pagamentos, movimentos, creditos, caixa] = await Promise.all([
    ler(repo, "Vendas"),
    ler(repo, "VendaItens"),
    ler(repo, "Pagamentos"),
    ler(repo, "Movimentos"),
    ler(repo, "CreditosLoja"),
    ler(repo, "Caixa"),
  ]);
  return conferir({ vendas, itens, pagamentos, movimentos, creditos, caixa } as unknown as Dados);
}
