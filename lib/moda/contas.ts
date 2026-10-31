/**
 * Contas a pagar (compras a prazo) e a receber (parcelas do crediário). Só o dono ("contas.ver").
 * Dar baixa marca a parcela como paga e lança o dinheiro no caixa; se o caixa falhar, a baixa é desfeita.
 */
import { z } from "zod";
import type { Contexto } from "@/lib/core/contexto";
import { ErroApp } from "@/lib/core/erros";
import { agoraSP, diaSP, somarDias } from "@/lib/core/tempo";
import { FormaCompraSchema } from "./compras";

export interface ContaVista {
  id: string;
  tipo: "pagar" | "receber";
  descricao: string;
  parceiroNome: string;
  parceiroId: string | null;
  parcela: number;
  totalParcelas: number;
  vencimento: string;
  valorCentavos: number;
  status: "aberta" | "paga";
  situacao: "paga" | "atrasada" | "hoje" | "a_vencer";
}

export interface ResumoContas {
  abertasCentavos: number;
  atrasadasCentavos: number;
  proximos7DiasCentavos: number;
  quantidadeAtrasadas: number;
}

export function situacaoDe(c: { status: string; vencimento: string }, hoje: string): ContaVista["situacao"] {
  if (c.status === "paga") return "paga";
  const v = c.vencimento.slice(0, 10);
  return v < hoje ? "atrasada" : v === hoje ? "hoje" : "a_vencer";
}

export async function listarContas(
  ctx: Contexto,
  o: { tipo: "pagar" | "receber"; incluirPagas?: boolean; hoje?: string },
): Promise<{ contas: ContaVista[]; resumo: ResumoContas }> {
  ctx.exigir("contas.ver");
  const hoje = o.hoje ?? diaSP();
  const todas = (await ctx.sistema.lerFresco("Contas")).filter((c) => c.tipo === o.tipo);
  const contas = todas
    .map<ContaVista>((c) => ({
      id: c.id,
      tipo: c.tipo,
      descricao: c.descricao,
      parceiroNome: c.parceiroNome ?? "",
      parceiroId: c.parceiroId ?? null,
      parcela: c.parcela,
      totalParcelas: c.totalParcelas,
      vencimento: c.vencimento.slice(0, 10),
      valorCentavos: c.valorCentavos,
      status: c.status,
      situacao: situacaoDe(c, hoje),
    }))
    .filter((c) => o.incluirPagas || c.status === "aberta")
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const abertas = contas.filter((c) => c.status === "aberta");
  const soma = (xs: ContaVista[]) => xs.reduce((s, c) => s + c.valorCentavos, 0);
  const limite = somarDias(hoje, 7);
  const atrasadas = abertas.filter((c) => c.situacao === "atrasada");
  return {
    contas,
    resumo: {
      abertasCentavos: soma(abertas),
      atrasadasCentavos: soma(atrasadas),
      quantidadeAtrasadas: atrasadas.length,
      proximos7DiasCentavos: soma(abertas.filter((c) => c.situacao !== "atrasada" && c.vencimento <= limite)),
    },
  };
}

export const BaixaSchema = z.object({ contaId: z.string().min(10).max(40), forma: FormaCompraSchema }).strict();

export async function darBaixa(ctx: Contexto, entrada: unknown): Promise<void> {
  ctx.exigir("contas.ver");
  const e = BaixaSchema.parse(entrada);
  const repo = ctx.sistema;

  const conta = await repo.atualizar("Contas", e.contaId, (atual) => {
    if (atual.status === "paga") throw new ErroApp("conflito", "Esta parcela já foi paga.");
    return { status: "paga" as const, pagoEm: agoraSP() };
  });
  try {
    await repo.acrescentar(
      "Caixa",
      {
        data: agoraSP(),
        tipo: conta.tipo === "receber" ? "entrada" : "saida",
        descricao: (conta.tipo === "receber" ? `Recebimento: ${conta.descricao}` : `Pagamento: ${conta.descricao}`).slice(0, 200),
        categoria: conta.tipo === "receber" ? "recebimento_crediario" : "pagamento_conta",
        valorCentavos: conta.valorCentavos,
        forma: e.forma,
        origemId: conta.id,
      },
      ctx.usuario.id,
    );
  } catch (err) {
    // sem o lançamento no caixa a baixa não vale: reabre a parcela
    await repo.atualizar("Contas", e.contaId, () => ({ status: "aberta" as const, pagoEm: undefined })).catch(() => undefined);
    throw err;
  }
  await ctx.auditar(`baixa_${conta.tipo}`, "Contas", conta.id);
}
