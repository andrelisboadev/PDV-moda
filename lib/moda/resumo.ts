/**
 * Resumo do mês: faturamento, custo das peças, taxas, lucro bruto, despesas por categoria,
 * vendedores e peças mais vendidas. Só o dono ("caixa.ver"). Trocas e devoluções aparecem à parte
 * e NÃO são descontadas do lucro (a conta mostra o que foi vendido no mês).
 */
import type { Contexto } from "@/lib/core/contexto";
import { diaSP } from "@/lib/core/tempo";

export interface ResumoMes {
  mes: string;
  vendas: number;
  faturamentoCentavos: number;
  ticketMedioCentavos: number;
  custoCentavos: number;
  taxasCentavos: number;
  lucroBrutoCentavos: number;
  margemPontosBase: number;
  entradasPorCategoria: Record<string, number>;
  saidasPorCategoria: Record<string, number>;
  trocas: number;
  trocasValorCentavos: number;
  aReceberCentavos: number;
  aPagarCentavos: number;
  porVendedor: Array<{ nome: string; vendas: number; totalCentavos: number }>;
  maisVendidos: Array<{ nome: string; quantidade: number; totalCentavos: number }>;
}

const MES = /^\d{4}-\d{2}$/;
export const mesAtual = (hoje: string = diaSP()) => hoje.slice(0, 7);

export async function resumoMensal(ctx: Contexto, mes: string = mesAtual()): Promise<ResumoMes> {
  ctx.exigir("caixa.ver");
  if (!MES.test(mes)) throw new Error("mês inválido");
  const r = ctx.sistema;
  const [vendasTodas, itens, pagamentos, caixa, trocas, contas, usuarios] = await Promise.all([
    r.lerFresco("Vendas"),
    r.lerFresco("VendaItens"),
    r.lerFresco("Pagamentos"),
    r.lerFresco("Caixa"),
    r.lerFresco("Trocas"),
    r.lerFresco("Contas"),
    r.lerFresco("Usuarios"),
  ]);
  const vendas = vendasTodas.filter((v) => v.data.startsWith(mes) && v.status === "concluida");
  const ids = new Set(vendas.map((v) => v.id));
  const faturamento = vendas.reduce((s, v) => s + v.totalCentavos, 0);
  const meusItens = itens.filter((i) => ids.has(i.vendaId));
  const custo = meusItens.reduce((s, i) => s + i.custoCentavos * i.quantidade, 0);
  const taxas = pagamentos.filter((p) => ids.has(p.vendaId)).reduce((s, p) => s + p.taxaCentavos, 0);
  const lucro = faturamento - custo - taxas;

  const entradas: Record<string, number> = {};
  const saidas: Record<string, number> = {};
  for (const c of caixa) {
    if (!c.data.startsWith(mes)) continue;
    const alvo = c.tipo === "entrada" ? entradas : saidas;
    alvo[c.categoria] = (alvo[c.categoria] ?? 0) + c.valorCentavos;
  }

  const nomes = new Map(usuarios.map((u) => [u.id, u.nome]));
  const pv = new Map<string, { vendas: number; total: number }>();
  for (const v of vendas) {
    const a = pv.get(v.vendedorId) ?? { vendas: 0, total: 0 };
    a.vendas += 1;
    a.total += v.totalCentavos;
    pv.set(v.vendedorId, a);
  }
  const pecas = new Map<string, { quantidade: number; total: number }>();
  for (const i of meusItens) {
    const a = pecas.get(i.nomeNoMomento) ?? { quantidade: 0, total: 0 };
    a.quantidade += i.quantidade;
    a.total += i.quantidade * i.precoCentavos;
    pecas.set(i.nomeNoMomento, a);
  }
  const tr = trocas.filter((t) => t.criadoEm.startsWith(mes));
  const abertas = contas.filter((c) => c.status === "aberta");
  const soma = (tipo: string) => abertas.filter((c) => c.tipo === tipo).reduce((s, c) => s + c.valorCentavos, 0);

  return {
    mes,
    vendas: vendas.length,
    faturamentoCentavos: faturamento,
    ticketMedioCentavos: vendas.length ? Math.round(faturamento / vendas.length) : 0,
    custoCentavos: custo,
    taxasCentavos: taxas,
    lucroBrutoCentavos: lucro,
    margemPontosBase: faturamento > 0 ? Math.round((lucro * 10_000) / faturamento) : 0,
    entradasPorCategoria: entradas,
    saidasPorCategoria: saidas,
    trocas: tr.length,
    trocasValorCentavos: tr.reduce((s, t) => s + t.valorCentavos, 0),
    aReceberCentavos: soma("receber"),
    aPagarCentavos: soma("pagar"),
    porVendedor: [...pv]
      .map(([id, a]) => ({ nome: nomes.get(id) ?? "—", vendas: a.vendas, totalCentavos: a.total }))
      .sort((a, b) => b.totalCentavos - a.totalCentavos),
    maisVendidos: [...pecas]
      .map(([nome, a]) => ({ nome, quantidade: a.quantidade, totalCentavos: a.total }))
      .sort((a, b) => b.quantidade - a.quantidade || b.totalCentavos - a.totalCentavos)
      .slice(0, 5),
  };
}
