/**
 * Configuração da loja, guardada na aba Config (chave/valor). Percentuais em pontos-base.
 * O vendedor não lê a aba Config pelo acesso genérico, mas as regras de venda precisam dela,
 * por isso a leitura aqui usa `ctx.sistema` (e só devolve o que a venda precisa).
 *
 * Padrões de segurança quando a chave não existe: vendedor não dá desconto, estoque não fica
 * negativo e as taxas são zero. O dono configura em Configurações.
 */
import { z } from "zod";
import type { Contexto } from "@/lib/core/contexto";
import type { FormaPagamento } from "./tipos";

export const CHAVES = {
  descontoMaxVendedor: "desconto.max.vendedor",
  estoqueNegativo: "estoque.negativo",
  taxaDebito: "taxa.debito",
  taxaPix: "taxa.pix",
  taxaDinheiro: "taxa.dinheiro",
  taxaCredito: (parcelas: number) => `taxa.credito.${parcelas}`,
  crediarioMaxParcelas: "crediario.max.parcelas",
  crediarioPrimeiroDias: "crediario.primeiro.dias",
  condicionalPrazoDias: "condicional.prazo.dias",
  trocaPrazoDias: "troca.prazo.dias",
} as const;

export const MAX_PARCELAS_CREDIARIO = 24;

export const MAX_PARCELAS_CARTAO = 12;

export interface ConfigLoja {
  descontoMaxVendedorPb: number;
  estoqueNegativo: boolean;
  taxaDebitoPb: number;
  taxaPixPb: number;
  taxaDinheiroPb: number;
  /** Índice 1..12. Posição 0 não é usada. */
  taxaCreditoPb: number[];
  /** Máximo de parcelas do crediário (1..24). */
  crediarioMaxParcelas: number;
  /** Dias até o vencimento da 1ª parcela do crediário (0..60). */
  crediarioPrimeiroDias: number;
  /** Prazo para devolver as peças do condicional (1..60 dias). */
  condicionalPrazoDias: number;
  /** Prazo de troca/devolução após a venda, em dias. 0 = sem prazo. */
  trocaPrazoDias: number;
}

export const CONFIG_PADRAO: ConfigLoja = {
  descontoMaxVendedorPb: 0,
  estoqueNegativo: false,
  taxaDebitoPb: 0,
  taxaPixPb: 0,
  taxaDinheiroPb: 0,
  taxaCreditoPb: Array<number>(MAX_PARCELAS_CARTAO + 1).fill(0),
  crediarioMaxParcelas: 6,
  crediarioPrimeiroDias: 30,
  condicionalPrazoDias: 3,
  trocaPrazoDias: 0,
};

function pb(valor: string | undefined, padrao: number): number {
  if (valor === undefined || !/^\d{1,5}$/.test(valor)) return padrao;
  const n = Number(valor);
  return n >= 0 && n <= 10_000 ? n : padrao;
}

function inteiroEntre(valor: string | undefined, padrao: number, min: number, max: number): number {
  if (valor === undefined || !/^\d{1,4}$/.test(valor)) return padrao;
  const n = Number(valor);
  return n >= min && n <= max ? n : padrao;
}

export function interpretarConfig(linhas: ReadonlyArray<{ chave: string; valor: string }>): ConfigLoja {
  const mapa = new Map<string, string>();
  for (const l of linhas) mapa.set(l.chave, l.valor); // a última linha da chave vence
  return {
    descontoMaxVendedorPb: pb(mapa.get(CHAVES.descontoMaxVendedor), CONFIG_PADRAO.descontoMaxVendedorPb),
    estoqueNegativo: mapa.get(CHAVES.estoqueNegativo) === "sim",
    taxaDebitoPb: pb(mapa.get(CHAVES.taxaDebito), 0),
    taxaPixPb: pb(mapa.get(CHAVES.taxaPix), 0),
    taxaDinheiroPb: pb(mapa.get(CHAVES.taxaDinheiro), 0),
    taxaCreditoPb: Array.from({ length: MAX_PARCELAS_CARTAO + 1 }, (_, n) =>
      n === 0 ? 0 : pb(mapa.get(CHAVES.taxaCredito(n)), 0),
    ),
    crediarioMaxParcelas: inteiroEntre(mapa.get(CHAVES.crediarioMaxParcelas), CONFIG_PADRAO.crediarioMaxParcelas, 1, MAX_PARCELAS_CREDIARIO),
    crediarioPrimeiroDias: inteiroEntre(mapa.get(CHAVES.crediarioPrimeiroDias), CONFIG_PADRAO.crediarioPrimeiroDias, 0, 60),
    condicionalPrazoDias: inteiroEntre(mapa.get(CHAVES.condicionalPrazoDias), CONFIG_PADRAO.condicionalPrazoDias, 1, 60),
    trocaPrazoDias: inteiroEntre(mapa.get(CHAVES.trocaPrazoDias), CONFIG_PADRAO.trocaPrazoDias, 0, 3650),
  };
}

export async function lerConfig(ctx: Contexto, opts: { fresco?: boolean } = {}): Promise<ConfigLoja> {
  const linhas = opts.fresco ? await ctx.sistema.lerFresco("Config") : await ctx.sistema.ler("Config");
  return interpretarConfig(linhas);
}

/** Taxa da maquininha (pontos-base) para uma forma de pagamento. */
export function taxaPontosBase(cfg: ConfigLoja, forma: FormaPagamento, parcelas: number): number {
  switch (forma) {
    case "debito":
      return cfg.taxaDebitoPb;
    case "credito":
      return cfg.taxaCreditoPb[parcelas] ?? 0;
    case "pix":
      return cfg.taxaPixPb;
    case "dinheiro":
      return cfg.taxaDinheiroPb;
    default:
      return 0; // crediário e crédito de loja não passam pela maquininha
  }
}

const pontos = z.number().int().min(0).max(10_000);

export const ConfigEntradaSchema = z
  .object({
    descontoMaxVendedorPb: pontos,
    estoqueNegativo: z.boolean(),
    taxaDebitoPb: pontos,
    taxaPixPb: pontos,
    taxaDinheiroPb: pontos,
    taxaCreditoPb: z.array(pontos).length(MAX_PARCELAS_CARTAO), // 1x..12x
    crediarioMaxParcelas: z.number().int().min(1).max(MAX_PARCELAS_CREDIARIO),
    crediarioPrimeiroDias: z.number().int().min(0).max(60),
    condicionalPrazoDias: z.number().int().min(1).max(60),
    trocaPrazoDias: z.number().int().min(0).max(3650),
  })
  .strict();
export type ConfigEntrada = z.infer<typeof ConfigEntradaSchema>;

/** Só o dono. Cada alteração vira registro em Auditoria (feito por ctx.atualizar/acrescentar). */
export async function salvarConfig(ctx: Contexto, entrada: unknown): Promise<{ alteradas: number }> {
  ctx.exigir("config.editar");
  const e = ConfigEntradaSchema.parse(entrada);
  const pares: Array<[string, string]> = [
    [CHAVES.descontoMaxVendedor, String(e.descontoMaxVendedorPb)],
    [CHAVES.estoqueNegativo, e.estoqueNegativo ? "sim" : "nao"],
    [CHAVES.taxaDebito, String(e.taxaDebitoPb)],
    [CHAVES.taxaPix, String(e.taxaPixPb)],
    [CHAVES.taxaDinheiro, String(e.taxaDinheiroPb)],
    ...e.taxaCreditoPb.map((v, i): [string, string] => [CHAVES.taxaCredito(i + 1), String(v)]),
    [CHAVES.crediarioMaxParcelas, String(e.crediarioMaxParcelas)],
    [CHAVES.crediarioPrimeiroDias, String(e.crediarioPrimeiroDias)],
    [CHAVES.condicionalPrazoDias, String(e.condicionalPrazoDias)],
    [CHAVES.trocaPrazoDias, String(e.trocaPrazoDias)],
  ];

  const atuais = await ctx.sistema.lerFresco("Config");
  const porChave = new Map(atuais.map((l) => [l.chave, l])); // a última linha da chave vence
  let alteradas = 0;
  for (const [chave, valor] of pares) {
    const atual = porChave.get(chave);
    if (!atual) {
      await ctx.acrescentar("Config", { chave, valor });
      alteradas++;
    } else if (atual.valor !== valor) {
      await ctx.atualizar("Config", atual.id, () => ({ valor }));
      alteradas++;
    }
  }
  return { alteradas };
}
