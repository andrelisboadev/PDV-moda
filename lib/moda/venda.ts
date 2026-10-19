/**
 * Venda no PDV (dinheiro, Pix, débito, crédito, crediário e vale-troca).
 *
 * Fluxo: PREPARAR (só leitura e regras: preço, desconto, limite, pagamentos) -> RESERVAR o que
 * gasta saldo (peças e vale-troca, ver reserva.ts) -> FECHAR num lote atômico (uma requisição):
 * Vendas, VendaItens, Pagamentos, Caixa, Contas (parcelas do crediário) e Auditoria.
 * Se o fechamento falhar, as reservas são desfeitas com lançamentos de estorno.
 *
 * Preço, custo, limite de desconto, limite de crediário e saldos vêm SEMPRE do servidor.
 */
import { ulid } from "ulid";
import { z } from "zod";
import type { Contexto } from "@/lib/core/contexto";
import { aplicarPontosBase, dividirEmParcelas, formatarReais, MAX_CENTAVOS } from "@/lib/core/dinheiro";
import { ErroApp } from "@/lib/core/erros";
import { comTrava } from "@/lib/core/mutex";
import { FORMAS } from "@/lib/core/schema";
import { agoraSP, diaSP, somarDias, somarMeses } from "@/lib/core/tempo";
import { lerConfig, MAX_PARCELAS_CARTAO, MAX_PARCELAS_CREDIARIO, taxaPontosBase } from "./config";
import { desfazerTodas, reservarCredito, reservarEstoque, type Reserva } from "./reserva";
import type { FormaPagamento } from "./tipos";

const id = z.string().min(1).max(40);

export const VendaSchema = z
  .object({
    clienteId: id.optional(),
    itens: z
      .array(z.object({ variacaoId: id, quantidade: z.number().int().min(1).max(999) }).strict())
      .min(1)
      .max(100),
    desconto: z
      .discriminatedUnion("tipo", [
        z.object({ tipo: z.literal("percentual"), pontosBase: z.number().int().min(1).max(10_000) }).strict(),
        z.object({ tipo: z.literal("valor"), centavos: z.number().int().min(1).max(MAX_CENTAVOS) }).strict(),
      ])
      .optional(),
    pagamentos: z
      .array(
        z
          .object({
            forma: z.enum(FORMAS),
            valorCentavos: z.number().int().min(1).max(MAX_CENTAVOS),
            /** Cartão de crédito: 1..12. Crediário: número de parcelas da loja. */
            parcelas: z.number().int().min(1).max(MAX_PARCELAS_CREDIARIO).default(1),
          })
          .strict(),
      )
      .min(1)
      .max(6),
  })
  .strict();
export type EntradaVenda = z.input<typeof VendaSchema>;
type VendaValida = z.output<typeof VendaSchema>;

export interface ResultadoVenda {
  vendaId: string;
  subtotalCentavos: number;
  descontoCentavos: number;
  totalCentavos: number;
  taxasCentavos: number;
}

export interface OpcoesVenda {
  /** Trava em memória por loja. Desligar só nos testes que simulam várias instâncias. */
  trava?: boolean;
}

/** Linha de lote atômico (ver RepoTenant.acrescentarAtomico). */
export type BlocoAtomico = { aba: Parameters<Contexto["sistema"]["acrescentarAtomico"]>[0][number]["aba"]; itens: Array<{ dados: Record<string, unknown>; id?: string }> };

/** Ganchos usados por quem monta a venda a partir de outra coisa (condicional). */
export interface GanchosVenda {
  /** As peças já saíram do estoque (condicional): não reservar de novo. */
  baixaPrevia?: boolean;
  /** Linhas extras gravadas no MESMO lote atômico. */
  blocosExtras?: BlocoAtomico[];
  /** Roda depois das reservas e antes do fechamento (ex.: marcar itens do condicional). */
  antesDeFechar?: () => Promise<void>;
  /** Roda se o fechamento falhar (desfaz o que antesDeFechar fez). */
  aoFalhar?: () => Promise<void>;
}

export async function registrarVenda(ctx: Contexto, entrada: unknown, opcoes: OpcoesVenda = {}): Promise<ResultadoVenda> {
  ctx.exigir("venda.criar");
  const e = VendaSchema.parse(entrada);
  const rodar = async () => fecharVenda(ctx, await prepararVenda(ctx, e));
  return opcoes.trava === false ? rodar() : comTrava(`estoque:${ctx.tenantId}`, rodar);
}

/* ------------------------------------ preparar ------------------------------------ */

interface LinhaVenda {
  variacaoId: string;
  quantidade: number;
  nome: string;
  tamanho: string;
  cor: string;
  precoCentavos: number;
  custoCentavos: number;
  rotulo: string;
}

export interface VendaPreparada {
  vendaId: string;
  e: VendaValida;
  cfg: Awaited<ReturnType<typeof lerConfig>>;
  linhas: LinhaVenda[];
  subtotal: number;
  descontoCentavos: number;
  total: number;
  pagamentos: Array<{ forma: FormaPagamento; valorCentavos: number; parcelas: number; taxaCentavos: number }>;
  taxasCentavos: number;
  cliente?: { id: string; nome: string };
  parcelasCrediario: Array<{ parcela: number; total: number; vencimento: string; valorCentavos: number }>;
  auditoriaExtra: string[];
}

export async function prepararVenda(ctx: Contexto, e: VendaValida): Promise<VendaPreparada> {
  const repo = ctx.sistema;

  /* ---- o que está sendo vendido, com preço e custo vindos SEMPRE do servidor ---- */
  const qtdPorVariacao = new Map<string, number>();
  for (const it of e.itens) qtdPorVariacao.set(it.variacaoId, (qtdPorVariacao.get(it.variacaoId) ?? 0) + it.quantidade);
  if ([...qtdPorVariacao.values()].some((q) => q > 9999)) throw new ErroApp("invalido", "Quantidade grande demais para uma peça.");

  const [produtos, variacoes, cfg] = await Promise.all([repo.ler("Produtos"), repo.ler("Variacoes"), lerConfig(ctx)]);
  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));
  const variacaoPorId = new Map(variacoes.map((v) => [v.id, v]));

  const linhas = [...qtdPorVariacao].map(([variacaoId, quantidade]): LinhaVenda => {
    const v = variacaoPorId.get(variacaoId);
    const p = v && produtoPorId.get(v.produtoId);
    if (!v || !p) throw new ErroApp("invalido", "Uma das peças não existe mais. Atualize a tela e tente de novo.");
    return {
      variacaoId,
      quantidade,
      nome: p.nome,
      tamanho: v.tamanho,
      cor: v.cor,
      precoCentavos: v.precoCentavos ?? p.precoCentavos,
      custoCentavos: p.custoCentavos,
      rotulo: `${p.nome} ${v.tamanho} ${v.cor}`.replace(/ Único/g, ""),
    };
  });

  /* ---- cliente ---- */
  let cliente: VendaPreparada["cliente"];
  let limiteCrediario = 0;
  if (e.clienteId) {
    const c = (await repo.ler("Clientes")).find((x) => x.id === e.clienteId);
    if (!c) throw new ErroApp("invalido", "Cliente não encontrado.");
    cliente = { id: c.id, nome: c.nome };
    limiteCrediario = c.limiteCrediarioCentavos;
  }

  /* ---- valores ---- */
  const subtotal = linhas.reduce((s, l) => s + l.precoCentavos * l.quantidade, 0);
  if (!Number.isSafeInteger(subtotal) || subtotal > MAX_CENTAVOS) throw new ErroApp("invalido", "Valor da venda grande demais.");

  const descontoCentavos = !e.desconto
    ? 0
    : e.desconto.tipo === "percentual"
      ? aplicarPontosBase(subtotal, e.desconto.pontosBase)
      : e.desconto.centavos;
  if (descontoCentavos >= subtotal) throw new ErroApp("invalido", "O desconto não pode ser igual ou maior que o total.");
  const total = subtotal - descontoCentavos;

  // Desconto acima do limite da loja: vendedor não passa (e fica registrado); dono passa (e fica registrado).
  const auditoriaExtra: string[] = [];
  if (descontoCentavos * 10_000 > cfg.descontoMaxVendedorPb * subtotal) {
    if (ctx.usuario.papel !== "dono") {
      await ctx.auditar("desconto_recusado", "Vendas");
      throw new ErroApp("proibido", "Desconto acima do limite da loja. Peça para a dona ou o dono fazer essa venda.");
    }
    auditoriaExtra.push("desconto_acima_do_limite");
  }

  /* ---- pagamentos ---- */
  const contar = (f: FormaPagamento) => e.pagamentos.filter((p) => p.forma === f).length;
  if (contar("crediario") > 1 || contar("credito_loja") > 1) {
    throw new ErroApp("invalido", "Use no máximo um crediário e um vale-troca por venda.");
  }
  for (const p of e.pagamentos) {
    if (p.forma === "credito") {
      if (p.parcelas > MAX_PARCELAS_CARTAO) throw new ErroApp("invalido", `O cartão parcela em até ${MAX_PARCELAS_CARTAO}x.`);
    } else if (p.forma === "crediario") {
      if (p.parcelas > cfg.crediarioMaxParcelas) throw new ErroApp("invalido", `O crediário da loja vai até ${cfg.crediarioMaxParcelas}x.`);
      if (p.valorCentavos < p.parcelas) throw new ErroApp("invalido", "Valor pequeno demais para tantas parcelas.");
    } else if (p.parcelas !== 1) {
      throw new ErroApp("invalido", "Só o cartão de crédito e o crediário podem ser parcelados.");
    }
    if ((p.forma === "crediario" || p.forma === "credito_loja") && !cliente) {
      throw new ErroApp("invalido", p.forma === "crediario" ? "O crediário precisa de um cliente cadastrado." : "O vale-troca precisa de um cliente cadastrado.");
    }
  }
  const somaPagamentos = e.pagamentos.reduce((s, p) => s + p.valorCentavos, 0);
  if (somaPagamentos !== total) {
    throw new ErroApp("invalido", `Os pagamentos somam ${formatarReais(somaPagamentos)} e a venda é de ${formatarReais(total)}.`);
  }
  const pagamentos = e.pagamentos.map((p) => ({
    ...p,
    forma: p.forma as FormaPagamento,
    taxaCentavos: aplicarPontosBase(p.valorCentavos, taxaPontosBase(cfg, p.forma, p.parcelas)),
  }));
  const taxasCentavos = pagamentos.reduce((s, p) => s + p.taxaCentavos, 0);

  /* ---- crediário: limite do cliente e datas das parcelas ---- */
  let parcelasCrediario: VendaPreparada["parcelasCrediario"] = [];
  const cred = pagamentos.find((p) => p.forma === "crediario");
  if (cred && cliente) {
    const abertas = (await repo.lerFresco("Contas"))
      .filter((c) => c.tipo === "receber" && c.status === "aberta" && c.parceiroId === cliente!.id)
      .reduce((s, c) => s + c.valorCentavos, 0);
    if (abertas + cred.valorCentavos > limiteCrediario) {
      if (ctx.usuario.papel !== "dono") {
        await ctx.auditar("crediario_recusado", "Vendas");
        throw new ErroApp(
          "proibido",
          limiteCrediario === 0
            ? "Este cliente não tem limite de crediário. Peça para a dona ou o dono liberar."
            : `Passa do limite de crediário deste cliente (${formatarReais(limiteCrediario)}, já em aberto ${formatarReais(abertas)}).`,
        );
      }
      auditoriaExtra.push("crediario_acima_do_limite");
    }
    const primeiro = somarDias(diaSP(), cfg.crediarioPrimeiroDias);
    const valores = dividirEmParcelas(cred.valorCentavos, cred.parcelas);
    parcelasCrediario = valores.map((valorCentavos, i) => ({
      parcela: i + 1,
      total: valores.length,
      vencimento: somarMeses(primeiro, i), // sempre a partir da 1ª data, para o dia 31 não "escorregar"
      valorCentavos,
    }));
  }

  return { vendaId: ulid(), e, cfg, linhas, subtotal, descontoCentavos, total, pagamentos, taxasCentavos, cliente, parcelasCrediario, auditoriaExtra };
}

/* ------------------------------------- fechar ------------------------------------- */

export async function fecharVenda(ctx: Contexto, p: VendaPreparada, ganchos: GanchosVenda = {}): Promise<ResultadoVenda> {
  const repo = ctx.sistema;
  const { vendaId } = p;
  const reservas: Reserva[] = [];

  try {
    if (!ganchos.baixaPrevia) {
      reservas.push(
        await reservarEstoque(ctx, {
          origemId: vendaId,
          tipo: "venda",
          acaoRecusa: "venda_recusada_estoque",
          controla: !p.cfg.estoqueNegativo,
          itens: p.linhas.map((l) => ({ variacaoId: l.variacaoId, quantidade: l.quantidade, rotulo: l.rotulo })),
        }),
      );
    }
    const vale = p.pagamentos.find((x) => x.forma === "credito_loja");
    if (vale && p.cliente) {
      reservas.push(await reservarCredito(ctx, { clienteId: p.cliente.id, valorCentavos: vale.valorCentavos, origemId: vendaId }));
    }
    await ganchos.antesDeFechar?.();
  } catch (err) {
    await desfazerTodas(reservas);
    throw err;
  }

  const agora = agoraSP();
  const curto = vendaId.slice(-6);
  const dinheiroReal = (f: FormaPagamento) => f !== "crediario" && f !== "credito_loja"; // só o que entra no caixa
  try {
    await repo.acrescentarAtomico(
      [
        {
          aba: "Vendas",
          itens: [
            {
              id: vendaId,
              dados: {
                data: agora,
                clienteId: p.cliente?.id,
                vendedorId: ctx.usuario.id,
                descontoCentavos: p.descontoCentavos,
                totalCentavos: p.total,
                comissaoPontosBase: ctx.usuario.comissaoPontosBase,
                status: "concluida",
              },
            },
          ],
        },
        {
          aba: "VendaItens",
          itens: p.linhas.map((l) => ({
            dados: {
              vendaId,
              variacaoId: l.variacaoId,
              nomeNoMomento: l.nome,
              tamanho: l.tamanho,
              cor: l.cor,
              quantidade: l.quantidade,
              precoCentavos: l.precoCentavos,
              custoCentavos: l.custoCentavos,
            },
          })),
        },
        {
          aba: "Pagamentos",
          itens: p.pagamentos.map((x) => ({
            dados: { vendaId, forma: x.forma, valorCentavos: x.valorCentavos, parcelas: x.parcelas, taxaCentavos: x.taxaCentavos },
          })),
        },
        {
          aba: "Caixa",
          itens: [
            ...p.pagamentos.filter((x) => dinheiroReal(x.forma)).map((x) => ({
              dados: { data: agora, tipo: "entrada", descricao: `Venda ${curto}`, categoria: "venda", valorCentavos: x.valorCentavos, forma: x.forma, origemId: vendaId },
            })),
            // Taxa da maquininha entra como despesa.
            ...p.pagamentos.filter((x) => x.taxaCentavos > 0).map((x) => ({
              dados: { data: agora, tipo: "saida", descricao: `Taxa da maquininha (${x.forma})`, categoria: "taxa_maquininha", valorCentavos: x.taxaCentavos, forma: x.forma, origemId: vendaId },
            })),
          ],
        },
        {
          aba: "Contas",
          itens: p.parcelasCrediario.map((c) => ({
            dados: {
              tipo: "receber",
              descricao: `Crediário da venda ${curto}`,
              parceiroNome: p.cliente?.nome,
              parceiroId: p.cliente?.id,
              refId: vendaId,
              parcela: c.parcela,
              totalParcelas: c.total,
              vencimento: c.vencimento,
              valorCentavos: c.valorCentavos,
              status: "aberta",
            },
          })),
        },
        ...(ganchos.blocosExtras ?? []),
        {
          aba: "Auditoria",
          itens: ["venda_concluida", ...p.auditoriaExtra].map((acao) => ({
            dados: { quando: agora, usuario: ctx.usuario.id, acao, entidade: "Vendas", entidadeId: vendaId },
          })),
        },
      ],
      ctx.usuario.id,
    );
  } catch (err) {
    await desfazerTodas(reservas); // o lote é atômico: se falhou, nada foi gravado além das reservas
    await ganchos.aoFalhar?.();
    throw err;
  }

  return { vendaId, subtotalCentavos: p.subtotal, descontoCentavos: p.descontoCentavos, totalCentavos: p.total, taxasCentavos: p.taxasCentavos };
}
