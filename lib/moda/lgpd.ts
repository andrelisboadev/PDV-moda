/**
 * LGPD: o titular pode pedir uma cópia dos dados dele e a eliminação.
 *  - Exportar: tudo que a loja guarda sobre o cliente, num JSON legível.
 *  - Anonimizar: apaga nome, telefone, bairro e aniversário. Vendas, parcelas e vales continuam
 *    (obrigação fiscal e contábil), mas sem identificar a pessoa.
 * Só o dono. Toda chamada deixa rastro em Auditoria com o ID do cliente, nunca com os dados.
 */
import type { Contexto } from "@/lib/core/contexto";
import { ErroApp } from "@/lib/core/erros";
import { agoraSP } from "@/lib/core/tempo";

export const NOME_ANONIMO = "Cliente removido";

export interface ExportacaoCliente {
  geradoEm: string;
  cliente: Record<string, unknown>;
  vendas: Array<Record<string, unknown>>;
  parcelas: Array<Record<string, unknown>>;
  vales: Array<Record<string, unknown>>;
  condicionais: Array<Record<string, unknown>>;
  trocas: Array<Record<string, unknown>>;
}

async function acharCliente(ctx: Contexto, clienteId: string) {
  const c = (await ctx.sistema.lerFresco("Clientes")).find((x) => x.id === clienteId);
  if (!c) throw new ErroApp("invalido", "Cliente não encontrado.");
  return c;
}

export async function exportarDadosCliente(ctx: Contexto, clienteId: string): Promise<ExportacaoCliente> {
  ctx.exigir("lgpd.gerir");
  const c = await acharCliente(ctx, clienteId);
  const repo = ctx.sistema;
  const [vendas, itens, pags, contas, creditos, conds, trocas] = await Promise.all([
    repo.lerFresco("Vendas"),
    repo.lerFresco("VendaItens"),
    repo.lerFresco("Pagamentos"),
    repo.lerFresco("Contas"),
    repo.lerFresco("CreditosLoja"),
    repo.lerFresco("Condicionais"),
    repo.lerFresco("Trocas"),
  ]);
  const minhas = vendas.filter((v) => v.clienteId === clienteId);
  await ctx.auditar("lgpd_exportar", "Clientes", clienteId);
  return {
    geradoEm: agoraSP(),
    cliente: {
      nome: c.nome,
      telefone: c.telefone ?? null,
      bairro: c.bairro ?? null,
      aniversarioDia: c.aniversarioDia ?? null,
      aniversarioMes: c.aniversarioMes ?? null,
      consentimentoEm: c.consentimentoEm,
      cadastradoEm: c.criadoEm,
    },
    vendas: minhas.map((v) => ({
      data: v.data,
      total: v.totalCentavos,
      desconto: v.descontoCentavos,
      status: v.status,
      itens: itens
        .filter((i) => i.vendaId === v.id)
        .map((i) => ({ produto: i.nomeNoMomento, tamanho: i.tamanho, cor: i.cor, quantidade: i.quantidade, preco: i.precoCentavos })),
      pagamentos: pags.filter((p) => p.vendaId === v.id).map((p) => ({ forma: p.forma, valor: p.valorCentavos, parcelas: p.parcelas })),
    })),
    parcelas: contas
      .filter((x) => x.parceiroId === clienteId)
      .map((x) => ({ descricao: x.descricao, parcela: x.parcela, de: x.totalParcelas, vencimento: x.vencimento, valor: x.valorCentavos, status: x.status, pagoEm: x.pagoEm ?? null })),
    vales: creditos.filter((x) => x.clienteId === clienteId).map((x) => ({ motivo: x.motivo, valor: x.valorCentavos, quando: x.criadoEm })),
    condicionais: conds.filter((x) => x.clienteId === clienteId).map((x) => ({ saidaEm: x.saidaEm, devolverAte: x.devolverAte, status: x.status })),
    trocas: trocas.filter((x) => x.clienteId === clienteId).map((x) => ({ tipo: x.tipo, motivo: x.motivo, valor: x.valorCentavos, quando: x.criadoEm })),
  };
}

export async function anonimizarCliente(ctx: Contexto, clienteId: string): Promise<void> {
  ctx.exigir("lgpd.gerir");
  await acharCliente(ctx, clienteId);
  const repo = ctx.sistema;
  await repo.atualizar("Clientes", clienteId, () => ({
    nome: NOME_ANONIMO,
    telefone: undefined,
    bairro: undefined,
    aniversarioDia: undefined,
    aniversarioMes: undefined,
    limiteCrediarioCentavos: 0,
  }));
  // O nome também foi copiado para as parcelas do crediário.
  const contas = (await repo.lerFresco("Contas")).filter((x) => x.parceiroId === clienteId && x.parceiroNome !== NOME_ANONIMO);
  for (const x of contas) await repo.atualizar("Contas", x.id, () => ({ parceiroNome: NOME_ANONIMO }));
  await ctx.auditar("lgpd_anonimizar", "Clientes", clienteId);
}
