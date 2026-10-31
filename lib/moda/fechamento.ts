/**
 * Fechamento do dia: o que vendeu, o que entrou e saiu do caixa e quanto de dinheiro (papel) deve haver na gaveta.
 * Fechar grava só um registro na Auditoria com a diferença; não altera o caixa. Só o dono ("caixa.ver").
 */
import { z } from "zod";
import { resumoCaixaDoDia, type ResumoCaixa } from "@/lib/core/caixa";
import type { Contexto } from "@/lib/core/contexto";
import { MAX_CENTAVOS } from "@/lib/core/dinheiro";
import { diaSP } from "@/lib/core/tempo";

export interface Fechamento {
  caixa: ResumoCaixa;
  vendas: number;
  faturamentoCentavos: number;
  ticketMedioCentavos: number;
  crediarioCentavos: number;
  valeUsadoCentavos: number;
  porVendedor: Array<{ vendedorId: string; nome: string; vendas: number; totalCentavos: number }>;
  /** Dinheiro que deveria estar na gaveta (entradas − saídas em dinheiro do dia). */
  dinheiroEsperadoCentavos: number;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export async function fechamentoDoDia(ctx: Contexto, dia: string = diaSP()): Promise<Fechamento> {
  ctx.exigir("caixa.ver");
  if (!DIA.test(dia)) throw new Error("dia inválido");
  const caixa = await resumoCaixaDoDia(ctx, dia);
  const [vendasTodas, pagamentos, usuarios] = await Promise.all([
    ctx.sistema.lerFresco("Vendas"),
    ctx.sistema.lerFresco("Pagamentos"),
    ctx.sistema.lerFresco("Usuarios"),
  ]);
  const vendas = vendasTodas.filter((v) => v.data.startsWith(dia) && v.status === "concluida");
  const ids = new Set(vendas.map((v) => v.id));
  const doDia = pagamentos.filter((p) => ids.has(p.vendaId));
  const faturamento = vendas.reduce((s, v) => s + v.totalCentavos, 0);
  const nomes = new Map(usuarios.map((u) => [u.id, u.nome]));
  const por = new Map<string, { vendas: number; total: number }>();
  for (const v of vendas) {
    const a = por.get(v.vendedorId) ?? { vendas: 0, total: 0 };
    a.vendas += 1;
    a.total += v.totalCentavos;
    por.set(v.vendedorId, a);
  }
  return {
    caixa,
    vendas: vendas.length,
    faturamentoCentavos: faturamento,
    ticketMedioCentavos: vendas.length ? Math.round(faturamento / vendas.length) : 0,
    crediarioCentavos: doDia.filter((p) => p.forma === "crediario").reduce((s, p) => s + p.valorCentavos, 0),
    valeUsadoCentavos: doDia.filter((p) => p.forma === "credito_loja").reduce((s, p) => s + p.valorCentavos, 0),
    porVendedor: [...por]
      .map(([vendedorId, a]) => ({ vendedorId, nome: nomes.get(vendedorId) ?? "—", vendas: a.vendas, totalCentavos: a.total }))
      .sort((a, b) => b.totalCentavos - a.totalCentavos),
    dinheiroEsperadoCentavos: (caixa.entradasPorForma.dinheiro ?? 0) - (caixa.saidasPorForma.dinheiro ?? 0),
  };
}

export const FecharDiaSchema = z
  .object({
    dia: z.string().regex(DIA),
    /** Troco que já estava na gaveta de manhã. */
    trocoInicialCentavos: z.number().int().min(0).max(MAX_CENTAVOS).default(0),
    /** Dinheiro contado na gaveta ao fechar. */
    contadoCentavos: z.number().int().min(0).max(MAX_CENTAVOS),
  })
  .strict();

export async function fecharDia(ctx: Contexto, entrada: unknown): Promise<{ diferencaCentavos: number }> {
  ctx.exigir("caixa.ver");
  const e = FecharDiaSchema.parse(entrada);
  const f = await fechamentoDoDia(ctx, e.dia);
  const diferenca = e.contadoCentavos - (f.dinheiroEsperadoCentavos + e.trocoInicialCentavos);
  await ctx.auditar(`fechamento_dia:dif=${diferenca}`, "Caixa", e.dia);
  return { diferencaCentavos: diferenca };
}
