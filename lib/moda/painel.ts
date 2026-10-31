/**
 * Painel do Início. O dono vê vendas, caixa e contas; o vendedor vê só as próprias vendas do dia.
 * Todos veem aniversariantes e condicionais atrasados (para ligar e vender).
 */
import type { Contexto } from "@/lib/core/contexto";
import { diaSP, somarDias } from "@/lib/core/tempo";
import { abaixoDoMinimo } from "./estoque";
import { listarContas } from "./contas";

export interface Aniversariante {
  id: string;
  nome: string;
  telefone: string | null;
  dia: number;
  mes: number;
  hoje: boolean;
}

export interface Painel {
  vendasHoje: number;
  totalHojeCentavos: number;
  /** Só dono. */
  dono?: {
    ontemCentavos: number;
    caixaSaldoCentavos: number;
    receberAtrasadoCentavos: number;
    receberAtrasadas: number;
    pagarProximos7Centavos: number;
    pagarAtrasadas: number;
  };
  abaixoDoMinimo: number;
  condicionaisAtrasados: number;
  aniversariantes: Aniversariante[];
}

/** Aniversariantes de hoje até daqui a `dias` dias (vira o mês e o ano). Função pura. */
export function aniversariantes(
  clientes: ReadonlyArray<{ id: string; nome: string; telefone?: string; aniversarioDia?: number; aniversarioMes?: number }>,
  hoje: string,
  dias = 7,
): Aniversariante[] {
  const alvo = new Map<string, number>(); // MM-DD -> dias até a data
  for (let i = 0; i <= dias; i++) alvo.set(somarDias(hoje, i).slice(5), i);
  return clientes
    .flatMap((c) => {
      if (!c.aniversarioDia || !c.aniversarioMes) return [];
      const chave = `${String(c.aniversarioMes).padStart(2, "0")}-${String(c.aniversarioDia).padStart(2, "0")}`;
      return alvo.has(chave)
        ? [{ id: c.id, nome: c.nome, telefone: c.telefone ?? null, dia: c.aniversarioDia, mes: c.aniversarioMes, hoje: alvo.get(chave) === 0, em: alvo.get(chave)! }]
        : [];
    })
    .filter((a) => a.nome !== "Cliente removido")
    .sort((a, b) => a.em - b.em)
    .map((a) => ({ id: a.id, nome: a.nome, telefone: a.telefone, dia: a.dia, mes: a.mes, hoje: a.hoje }));
}

export async function montarPainel(ctx: Contexto, hoje: string = diaSP()): Promise<Painel> {
  const repo = ctx.sistema;
  const ehDono = ctx.pode("caixa.ver");
  const [vendas, condicionais, clientes] = await Promise.all([repo.ler("Vendas"), repo.ler("Condicionais"), repo.ler("Clientes")]);
  const ontem = somarDias(hoje, -1);
  const minhas = (v: { vendedorId: string }) => ehDono || v.vendedorId === ctx.usuario.id;
  const doDia = vendas.filter((v) => v.status === "concluida" && v.data.startsWith(hoje) && minhas(v));
  const painel: Painel = {
    vendasHoje: doDia.length,
    totalHojeCentavos: doDia.reduce((s, v) => s + v.totalCentavos, 0),
    abaixoDoMinimo: ctx.pode("estoque.ver") ? (await abaixoDoMinimo(ctx)).length : 0,
    condicionaisAtrasados: condicionais.filter((c) => c.status === "aberto" && c.devolverAte.slice(0, 10) < hoje).length,
    aniversariantes: aniversariantes(clientes, hoje),
  };
  if (ehDono) {
    const caixa = (await ctx.ler("Caixa")).filter((c) => c.data.startsWith(hoje));
    const [rec, pag] = await Promise.all([listarContas(ctx, { tipo: "receber", hoje }), listarContas(ctx, { tipo: "pagar", hoje })]);
    painel.dono = {
      ontemCentavos: vendas.filter((v) => v.status === "concluida" && v.data.startsWith(ontem)).reduce((s, v) => s + v.totalCentavos, 0),
      caixaSaldoCentavos: caixa.reduce((s, c) => s + (c.tipo === "entrada" ? c.valorCentavos : -c.valorCentavos), 0),
      receberAtrasadoCentavos: rec.resumo.atrasadasCentavos,
      receberAtrasadas: rec.resumo.quantidadeAtrasadas,
      pagarProximos7Centavos: pag.resumo.proximos7DiasCentavos + pag.resumo.atrasadasCentavos,
      pagarAtrasadas: pag.resumo.quantidadeAtrasadas,
    };
  }
  return painel;
}
