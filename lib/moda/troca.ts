/**
 * Troca, devolução e vale-troca.
 *
 * Uma só operação cobre os três casos: o cliente devolve peças de uma venda e, se quiser, leva outras.
 *  - levou mais do que devolveu -> paga a diferença (dinheiro, Pix, cartão ou vale-troca);
 *  - levou menos (ou nada)       -> a sobra vira vale-troca, ou volta em dinheiro (só o dono);
 *  - valor devolvido = valor LÍQUIDO que o cliente pagou (já com o desconto da venda), nunca o preço de tabela.
 * Tudo que muda estoque, caixa e crédito entra num lote atômico. Estoque e vale-troca usados na troca
 * passam pela reserva-e-conferência (reserva.ts), então não há gasto em dobro.
 */
import { ulid } from "ulid";
import { z } from "zod";
import type { Contexto } from "@/lib/core/contexto";
import { aplicarPontosBase, formatarReais, MAX_CENTAVOS } from "@/lib/core/dinheiro";
import { ErroApp } from "@/lib/core/erros";
import { comTrava } from "@/lib/core/mutex";
import { FORMAS } from "@/lib/core/schema";
import { agoraSP, diaSP, diasEntre } from "@/lib/core/tempo";
import { lerConfig, MAX_PARCELAS_CARTAO, taxaPontosBase } from "./config";
import { desfazerTodas, reservarCredito, reservarEstoque, type Reserva } from "./reserva";
import type { FormaPagamento } from "./tipos";

const id = z.string().min(1).max(40);
const peca = z.object({ variacaoId: id, quantidade: z.number().int().min(1).max(999) }).strict();

export const TrocaSchema = z
  .object({
    vendaId: id,
    /** Só necessário para vale-troca quando a venda original não tem cliente. */
    clienteId: id.optional(),
    devolvidos: z.array(peca).min(1).max(50),
    novos: z.array(peca).max(50).default([]),
    motivo: z.string().trim().min(2, "Conte o motivo em poucas palavras").max(200),
    /** O que fazer com a sobra a favor do cliente. */
    destino: z.enum(["vale", "dinheiro"]).optional(),
    /** Atalho da tela: paga TODA a diferença com uma só forma (o servidor calcula o valor exato). */
    pagarDiferencaCom: z
      .object({ forma: z.enum(FORMAS), parcelas: z.number().int().min(1).max(MAX_PARCELAS_CARTAO).default(1) })
      .strict()
      .optional(),
    /** Como o cliente paga a diferença, se levou mais do que devolveu. */
    pagamentos: z
      .array(
        z
          .object({
            forma: z.enum(FORMAS),
            valorCentavos: z.number().int().min(1).max(MAX_CENTAVOS),
            parcelas: z.number().int().min(1).max(MAX_PARCELAS_CARTAO).default(1),
          })
          .strict(),
      )
      .max(4)
      .default([]),
  })
  .strict();
export type EntradaTroca = z.input<typeof TrocaSchema>;

export interface ResultadoTroca {
  trocaId: string;
  tipo: "troca" | "credito" | "devolucao";
  devolvidoCentavos: number;
  levadoCentavos: number;
  /** Positivo: o cliente pagou. Negativo: sobrou a favor dele. */
  diferencaCentavos: number;
  valeCentavos: number;
  dinheiroCentavos: number;
}

/**
 * Parte do total LÍQUIDO da venda que cabe a cada linha, repartida de modo que a soma das linhas
 * seja EXATAMENTE o total (a diferença de arredondamento acompanha o acumulado, sem sobrar centavo).
 */
export function valorLiquidoPorLinha(
  linhas: ReadonlyArray<{ precoCentavos: number; quantidade: number }>,
  totalLiquidoCentavos: number,
): number[] {
  const subtotal = linhas.reduce((s, l) => s + l.precoCentavos * l.quantidade, 0);
  if (subtotal === 0) return linhas.map(() => 0);
  let acumulado = 0;
  let anterior = 0;
  return linhas.map((l) => {
    acumulado += l.precoCentavos * l.quantidade;
    const ate = Math.round((acumulado * totalLiquidoCentavos) / subtotal);
    const parte = ate - anterior;
    anterior = ate;
    return parte;
  });
}

/** Valor líquido de `k` unidades de uma linha de `qtd` peças que valem `valorLinha` (exato para k = qtd). */
export const valorDeUnidades = (valorLinha: number, qtd: number, k: number): number => Math.round((valorLinha * k) / qtd);

const juntar = (itens: ReadonlyArray<{ variacaoId: string; quantidade: number }>) => {
  const m = new Map<string, number>();
  for (const i of itens) m.set(i.variacaoId, (m.get(i.variacaoId) ?? 0) + i.quantidade);
  return m;
};
const dinheiroReal = (f: FormaPagamento) => f !== "crediario" && f !== "credito_loja";

export async function registrarTroca(ctx: Contexto, entrada: unknown): Promise<ResultadoTroca> {
  ctx.exigir("troca.registrar");
  const e = TrocaSchema.parse(entrada);
  return comTrava(`estoque:${ctx.tenantId}`, () => executarTroca(ctx, e));
}

async function executarTroca(ctx: Contexto, e: z.output<typeof TrocaSchema>): Promise<ResultadoTroca> {
  const repo = ctx.sistema;
  const [vendas, itensDaVenda, trocas, trocaItens, pagamentosDaVenda, cfg] = await Promise.all([
    repo.lerFresco("Vendas"),
    repo.lerFresco("VendaItens"),
    repo.lerFresco("Trocas"),
    repo.lerFresco("TrocaItens"),
    repo.lerFresco("Pagamentos"),
    lerConfig(ctx, { fresco: true }),
  ]);
  const venda = vendas.find((v) => v.id === e.vendaId);
  if (!venda || venda.status !== "concluida") throw new ErroApp("invalido", "Venda não encontrada.");
  const auditoriaExtra: string[] = [];

  /* ---- prazo ---- */
  if (cfg.trocaPrazoDias > 0 && diasEntre(venda.data.slice(0, 10), diaSP()) > cfg.trocaPrazoDias) {
    if (ctx.usuario.papel !== "dono") {
      await ctx.auditar("troca_recusada_prazo", "Vendas", venda.id);
      throw new ErroApp("proibido", `Passou do prazo de troca (${cfg.trocaPrazoDias} dias). Peça para a dona ou o dono.`);
    }
    auditoriaExtra.push("troca_fora_do_prazo");
  }

  /* ---- o que foi vendido, quanto cada peça valeu de fato e o que já voltou ---- */
  const linhasVenda = itensDaVenda.filter((i) => i.vendaId === venda.id);
  const liquidoLinha = valorLiquidoPorLinha(linhasVenda, venda.totalCentavos);
  const trocasDaVenda = new Set(trocas.filter((t) => t.vendaId === venda.id).map((t) => t.id));
  const jaDevolvido = new Map<string, number>();
  for (const t of trocaItens) {
    if (t.sentido === "devolvido" && trocasDaVenda.has(t.trocaId)) {
      jaDevolvido.set(t.variacaoId, (jaDevolvido.get(t.variacaoId) ?? 0) + t.quantidade);
    }
  }

  const devolver = juntar(e.devolvidos);
  const linhasDevolvidas: Array<{ variacaoId: string; quantidade: number; valorCentavos: number }> = [];
  for (const [variacaoId, quantidade] of devolver) {
    const i = linhasVenda.findIndex((l) => l.variacaoId === variacaoId);
    const linha = linhasVenda[i];
    if (!linha) throw new ErroApp("invalido", "Uma das peças não faz parte desta venda.");
    const antes = jaDevolvido.get(variacaoId) ?? 0;
    if (antes + quantidade > linha.quantidade) {
      throw new ErroApp("invalido", `${linha.nomeNoMomento} ${linha.tamanho} ${linha.cor}: só ${linha.quantidade - antes} ainda pode(m) ser devolvida(s) desta venda.`);
    }
    const valorLinha = liquidoLinha[i] ?? 0;
    linhasDevolvidas.push({
      variacaoId,
      quantidade,
      valorCentavos: valorDeUnidades(valorLinha, linha.quantidade, antes + quantidade) - valorDeUnidades(valorLinha, linha.quantidade, antes),
    });
  }
  const devolvidoCentavos = linhasDevolvidas.reduce((s, l) => s + l.valorCentavos, 0);

  /* ---- o que o cliente leva no lugar (preço de hoje, do servidor; sem desconto em troca) ---- */
  const levar = juntar(e.novos);
  const [produtos, variacoes] = await Promise.all([repo.ler("Produtos"), repo.ler("Variacoes")]);
  const linhasLevadas = [...levar].map(([variacaoId, quantidade]) => {
    const v = variacoes.find((x) => x.id === variacaoId);
    const p = v && produtos.find((x) => x.id === v.produtoId);
    if (!v || !p) throw new ErroApp("invalido", "Uma das peças não existe mais. Atualize a tela e tente de novo.");
    const preco = v.precoCentavos ?? p.precoCentavos;
    return { variacaoId, quantidade, valorCentavos: preco * quantidade, rotulo: `${p.nome} ${v.tamanho} ${v.cor}`.replace(/ Único/g, "") };
  });
  const levadoCentavos = linhasLevadas.reduce((s, l) => s + l.valorCentavos, 0);

  /* ---- a diferença e o que fazer com ela ---- */
  const diferenca = levadoCentavos - devolvidoCentavos;
  const clienteId = venda.clienteId ?? e.clienteId;
  if (clienteId && !(await repo.ler("Clientes")).some((c) => c.id === clienteId)) throw new ErroApp("invalido", "Cliente não encontrado.");

  let valeCentavos = 0;
  let dinheiroCentavos = 0;
  let destino: "nenhum" | "vale" | "dinheiro" = "nenhum";
  const pagamentosBrutos =
    e.pagarDiferencaCom && diferenca > 0
      ? [{ forma: e.pagarDiferencaCom.forma, parcelas: e.pagarDiferencaCom.parcelas, valorCentavos: diferenca }]
      : e.pagamentos;
  const pagamentos = pagamentosBrutos.map((p) => ({
    ...p,
    forma: p.forma as FormaPagamento,
    taxaCentavos: aplicarPontosBase(p.valorCentavos, taxaPontosBase(cfg, p.forma, p.parcelas)),
  }));

  if (diferenca > 0) {
    if (e.destino) throw new ErroApp("invalido", "Não sobrou valor a favor do cliente.");
    const soma = pagamentos.reduce((s, p) => s + p.valorCentavos, 0);
    if (soma !== diferenca) throw new ErroApp("invalido", `A diferença a pagar é ${formatarReais(diferenca)} e os pagamentos somam ${formatarReais(soma)}.`);
    for (const p of pagamentos) {
      if (p.forma === "crediario") throw new ErroApp("invalido", "Crediário só em venda nova.");
      if (p.forma === "credito_loja" && !clienteId) throw new ErroApp("invalido", "O vale-troca precisa de um cliente cadastrado.");
      if (p.forma !== "credito" && p.parcelas !== 1) throw new ErroApp("invalido", "Só o cartão de crédito pode ser parcelado.");
    }
    if (pagamentos.filter((p) => p.forma === "credito_loja").length > 1) throw new ErroApp("invalido", "Use no máximo um vale-troca.");
  } else {
    if (pagamentos.length > 0) throw new ErroApp("invalido", "Não há nada a pagar nesta troca.");
    const sobra = -diferenca;
    if (sobra > 0) {
      if (!e.destino) throw new ErroApp("invalido", "Escolha o que fazer com a sobra: vale-troca ou dinheiro.");
      destino = e.destino;
      if (destino === "vale") {
        if (!clienteId) throw new ErroApp("invalido", "Para dar vale-troca, informe o cliente.");
        valeCentavos = sobra;
      } else {
        ctx.exigir("troca.estorno");
        // Só devolve em dinheiro o que entrou em dinheiro de verdade (não crediário, não vale-troca), descontando devoluções anteriores.
        const pago = pagamentosDaVenda.filter((p) => p.vendaId === venda.id && dinheiroReal(p.forma)).reduce((s, p) => s + p.valorCentavos, 0);
        const jaVoltou = trocas
          .filter((t) => t.vendaId === venda.id && t.destino === "dinheiro")
          .reduce((s, t) => s + (t.valorCentavos - t.novoTotalCentavos), 0);
        if (sobra > pago - jaVoltou) {
          throw new ErroApp("invalido", `Só dá para devolver em dinheiro até ${formatarReais(Math.max(pago - jaVoltou, 0))} desta venda. Use vale-troca para o resto.`);
        }
        dinheiroCentavos = sobra;
      }
    } else if (e.destino) {
      throw new ErroApp("invalido", "Não sobrou valor a favor do cliente.");
    }
  }
  const tipo: ResultadoTroca["tipo"] = linhasLevadas.length > 0 ? "troca" : destino === "vale" ? "credito" : "devolucao";

  /* ---- reservar o que gasta saldo ---- */
  const trocaId = ulid();
  const reservas: Reserva[] = [];
  try {
    reservas.push(
      await reservarEstoque(ctx, {
        origemId: trocaId,
        tipo: "troca",
        controla: !cfg.estoqueNegativo,
        itens: linhasLevadas.map((l) => ({ variacaoId: l.variacaoId, quantidade: l.quantidade, rotulo: l.rotulo })),
      }),
    );
    const vale = pagamentos.find((p) => p.forma === "credito_loja");
    if (vale && clienteId) reservas.push(await reservarCredito(ctx, { clienteId, valorCentavos: vale.valorCentavos, origemId: trocaId }));
  } catch (err) {
    await desfazerTodas(reservas);
    throw err;
  }

  /* ---- fechar num lote atômico ---- */
  const agora = agoraSP();
  const curto = trocaId.slice(-6);
  try {
    await repo.acrescentarAtomico(
      [
        {
          aba: "Trocas",
          itens: [
            {
              id: trocaId,
              dados: {
                vendaId: venda.id,
                clienteId,
                vendedorId: ctx.usuario.id,
                comissaoPontosBase: ctx.usuario.comissaoPontosBase,
                tipo,
                motivo: e.motivo,
                valorCentavos: devolvidoCentavos,
                novoTotalCentavos: levadoCentavos,
                destino,
              },
            },
          ],
        },
        {
          aba: "TrocaItens",
          itens: [
            ...linhasDevolvidas.map((l) => ({ dados: { trocaId, variacaoId: l.variacaoId, sentido: "devolvido", quantidade: l.quantidade, valorCentavos: l.valorCentavos } })),
            ...linhasLevadas.map((l) => ({ dados: { trocaId, variacaoId: l.variacaoId, sentido: "levado", quantidade: l.quantidade, valorCentavos: l.valorCentavos } })),
          ],
        },
        // As peças devolvidas voltam para o estoque.
        {
          aba: "Movimentos",
          itens: linhasDevolvidas.map((l) => ({ dados: { variacaoId: l.variacaoId, tipo: "troca", quantidade: l.quantidade, origemId: trocaId } })),
        },
        {
          aba: "Caixa",
          itens: [
            ...pagamentos.filter((p) => dinheiroReal(p.forma)).map((p) => ({
              dados: { data: agora, tipo: "entrada", descricao: `Diferença da troca ${curto}`, categoria: "troca_diferenca", valorCentavos: p.valorCentavos, forma: p.forma, origemId: trocaId },
            })),
            ...pagamentos.filter((p) => p.taxaCentavos > 0).map((p) => ({
              dados: { data: agora, tipo: "saida", descricao: `Taxa da maquininha (${p.forma})`, categoria: "taxa_maquininha", valorCentavos: p.taxaCentavos, forma: p.forma, origemId: trocaId },
            })),
            ...(dinheiroCentavos > 0
              ? [{ dados: { data: agora, tipo: "saida", descricao: `Devolução em dinheiro ${curto}`, categoria: "devolucao", valorCentavos: dinheiroCentavos, forma: "dinheiro", origemId: trocaId } }]
              : []),
          ],
        },
        {
          aba: "CreditosLoja",
          itens: valeCentavos > 0 && clienteId ? [{ dados: { clienteId, valorCentavos: valeCentavos, origemId: trocaId, motivo: "emissao" } }] : [],
        },
        {
          aba: "Auditoria",
          itens: [`troca_${tipo}`, ...(dinheiroCentavos > 0 ? ["devolucao_em_dinheiro"] : []), ...auditoriaExtra].map((acao) => ({
            dados: { quando: agora, usuario: ctx.usuario.id, acao, entidade: "Trocas", entidadeId: trocaId },
          })),
        },
      ],
      ctx.usuario.id,
    );
  } catch (err) {
    await desfazerTodas(reservas);
    throw err;
  }

  return { trocaId, tipo, devolvidoCentavos, levadoCentavos, diferencaCentavos: diferenca, valeCentavos, dinheiroCentavos };
}

/* ----------------------------- consulta (tela de trocas) ----------------------------- */

export interface VendaParaTroca {
  vendaId: string;
  data: string;
  clienteId: string | null;
  totalCentavos: number;
  itens: Array<{ variacaoId: string; nome: string; tamanho: string; cor: string; vendida: number; devolvida: number; valorUnitarioLiquidoCentavos: number }>;
}

/** Venda com o que ainda pode ser devolvido. Busca pelo código curto (últimos 6 caracteres) ou pelo ID. */
export async function vendaParaTroca(ctx: Contexto, codigo: string): Promise<VendaParaTroca | null> {
  ctx.exigir("troca.registrar");
  const cod = codigo.trim().toUpperCase();
  if (cod.length < 4) return null;
  const [vendas, itens, trocas, trocaItens] = await Promise.all([
    ctx.sistema.lerFresco("Vendas"),
    ctx.sistema.lerFresco("VendaItens"),
    ctx.sistema.lerFresco("Trocas"),
    ctx.sistema.lerFresco("TrocaItens"),
  ]);
  const achadas = vendas.filter((v) => v.status === "concluida" && (v.id.toUpperCase() === cod || v.id.toUpperCase().endsWith(cod)));
  if (achadas.length !== 1) return null; // nenhuma, ou código curto ambíguo
  const v = achadas[0]!;
  const linhas = itens.filter((i) => i.vendaId === v.id);
  const liquido = valorLiquidoPorLinha(linhas, v.totalCentavos);
  const doTroca = new Set(trocas.filter((t) => t.vendaId === v.id).map((t) => t.id));
  return {
    vendaId: v.id,
    data: v.data,
    clienteId: v.clienteId ?? null,
    totalCentavos: v.totalCentavos,
    itens: linhas.map((l, i) => ({
      variacaoId: l.variacaoId,
      nome: l.nomeNoMomento,
      tamanho: l.tamanho,
      cor: l.cor,
      vendida: l.quantidade,
      devolvida: trocaItens.filter((t) => t.sentido === "devolvido" && doTroca.has(t.trocaId) && t.variacaoId === l.variacaoId).reduce((s, t) => s + t.quantidade, 0),
      valorUnitarioLiquidoCentavos: Math.round((liquido[i] ?? 0) / l.quantidade),
    })),
  };
}
