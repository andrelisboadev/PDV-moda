/**
 * Estoque de moda. O saldo NUNCA é um campo que se edita: é a soma dos Movimentos (livro só de
 * acréscimo). Venda e condicional saem com quantidade negativa; compra e retorno entram positivos;
 * correção é um novo movimento de estorno/ajuste.
 */
import { randomInt } from "node:crypto";
import { ulid } from "ulid";
import { z } from "zod";
import type { Contexto } from "@/lib/core/contexto";
import { MAX_CENTAVOS } from "@/lib/core/dinheiro";
import { ErroApp } from "@/lib/core/erros";
import { comTrava } from "@/lib/core/mutex";
import { lerConfig } from "./config";

/* --------------------------------- utilidades --------------------------------- */

export const normalizar = (t: string): string =>
  t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

const slug = (t: string): string => normalizar(t).replace(/[^a-z0-9]/g, "").toUpperCase();

const ORDEM_TAMANHOS = ["PP", "P", "M", "G", "GG", "XG", "XGG", "G1", "G2", "G3"];

/** PP, P, M, G, GG... depois números em ordem crescente, depois o resto em ordem alfabética. */
export function compararTamanhos(a: string, b: string): number {
  const ia = ORDEM_TAMANHOS.indexOf(a.toUpperCase());
  const ib = ORDEM_TAMANHOS.indexOf(b.toUpperCase());
  if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  const na = Number(a.replace(",", "."));
  const nb = Number(b.replace(",", "."));
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  if (!Number.isNaN(na)) return -1;
  if (!Number.isNaN(nb)) return 1;
  return a.localeCompare(b, "pt-BR");
}

export function calcularSaldos(
  movimentos: ReadonlyArray<{ variacaoId: string; quantidade: number }>,
): Map<string, number> {
  const saldos = new Map<string, number>();
  for (const m of movimentos) saldos.set(m.variacaoId, (saldos.get(m.variacaoId) ?? 0) + m.quantidade);
  return saldos;
}

export async function lerSaldos(ctx: Contexto, opts: { fresco?: boolean } = {}): Promise<Map<string, number>> {
  const movs = opts.fresco ? await ctx.sistema.lerFresco("Movimentos") : await ctx.sistema.ler("Movimentos");
  return calcularSaldos(movs);
}

/** EAN-13: dígito verificador a partir dos 12 primeiros dígitos. */
export function digitoEan13(doze: string): number {
  if (!/^\d{12}$/.test(doze)) throw new Error("EAN-13 precisa de 12 dígitos");
  const soma = [...doze].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (soma % 10)) % 10;
}

/** Código de barras interno da loja: prefixo 2 (uso restrito/loja), 11 dígitos sorteados, dígito verificador. */
export function gerarEan13Interno(usados: ReadonlySet<string>): string {
  for (let tentativa = 0; tentativa < 50; tentativa++) {
    let doze = "2";
    for (let i = 0; i < 11; i++) doze += String(randomInt(0, 10));
    const codigo = doze + digitoEan13(doze);
    if (!usados.has(codigo)) return codigo;
  }
  throw new ErroApp("interno", "Não foi possível gerar um código de barras único");
}

/* ------------------------------ cadastro rápido de grade ------------------------------ */

const textoCurto = (max: number) => z.string().trim().min(1).max(max);
const opcional = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());

export const MAX_VARIACOES_POR_PRODUTO = 200;

export const NovoProdutoSchema = z
  .object({
    nome: textoCurto(120).min(2),
    categoria: textoCurto(80).min(2),
    marca: opcional(80),
    colecao: opcional(80),
    custoCentavos: z.number().int().min(0).max(MAX_CENTAVOS),
    precoCentavos: z.number().int().min(1).max(MAX_CENTAVOS),
    tamanhos: z.array(textoCurto(20)).min(1).max(40),
    cores: z.array(textoCurto(40)).min(1).max(40),
    minimo: z.number().int().min(0).max(1000).default(0),
  })
  .strict();
export type NovoProduto = z.input<typeof NovoProdutoSchema>;

const semRepetir = (lista: string[]): string[] => {
  const vistos = new Set<string>();
  return lista.filter((x) => {
    const k = normalizar(x);
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
};

/**
 * Cria o modelo e TODAS as variações (tamanho × cor) de uma vez. Peça sem grade: tamanhos ["Único"] e cores ["Único"].
 * Cada variação nasce com SKU e código de barras próprios, sem repetir os já existentes na loja.
 */
export async function criarProdutoComGrade(
  ctx: Contexto,
  entrada: unknown,
): Promise<{ produtoId: string; variacoes: number }> {
  ctx.exigir("estoque.gerir");
  const e = NovoProdutoSchema.parse(entrada);
  const tamanhos = semRepetir(e.tamanhos);
  const cores = semRepetir(e.cores);
  if (tamanhos.length * cores.length > MAX_VARIACOES_POR_PRODUTO) {
    throw new ErroApp("invalido", `Muitas combinações (máximo ${MAX_VARIACOES_POR_PRODUTO}). Divida em dois produtos.`);
  }
  const semGrade = tamanhos.length === 1 && cores.length === 1 && normalizar(tamanhos[0]!) === "unico" && normalizar(cores[0]!) === "unico";

  return comTrava(`catalogo:${ctx.tenantId}`, async () => {
    const existentes = await ctx.sistema.lerFresco("Variacoes", { incluirRemovidos: true });
    const skus = new Set(existentes.map((v) => v.sku));
    const codigos = new Set(existentes.flatMap((v) => (v.codigoBarras ? [v.codigoBarras] : [])));
    const base = slug(e.nome).slice(0, 8) || "ITEM";

    const produtoId = ulid();
    const variacoes = tamanhos.flatMap((tamanho) =>
      cores.map((cor) => {
        const parte = semGrade ? "" : `-${slug(tamanho)}-${slug(cor).slice(0, 4)}`;
        let sku = `${base}${parte}`;
        for (let n = 2; skus.has(sku); n++) sku = `${base}${parte}-${n}`;
        skus.add(sku);
        const codigoBarras = gerarEan13Interno(codigos);
        codigos.add(codigoBarras);
        return { dados: { produtoId, sku, tamanho, cor, codigoBarras, minimo: e.minimo }, id: undefined };
      }),
    );

    await ctx.sistema.acrescentar(
      "Produtos",
      {
        nome: e.nome,
        categoria: e.categoria,
        marca: e.marca,
        colecao: e.colecao,
        tipo: semGrade ? "simples" : "grade",
        custoCentavos: e.custoCentavos,
        precoCentavos: e.precoCentavos,
      },
      ctx.usuario.id,
      produtoId,
    );
    await ctx.sistema.acrescentarVarios("Variacoes", variacoes, ctx.usuario.id);
    await ctx.auditar("criar_produto", "Produtos", produtoId);
    return { produtoId, variacoes: variacoes.length };
  });
}

/* --------------------------------- ajuste de estoque --------------------------------- */

export const MOTIVOS_AJUSTE = ["saldo_inicial", "contagem", "perda", "avaria", "outro"] as const;

export const AjusteSchema = z
  .object({
    variacaoId: z.string().min(1).max(40),
    quantidade: z
      .number()
      .int()
      .min(-100_000)
      .max(100_000)
      .refine((n) => n !== 0, "A quantidade não pode ser zero"),
    motivo: z.enum(MOTIVOS_AJUSTE),
  })
  .strict();

/** Ajuste manual (entrada de saldo inicial, contagem, perda). Só o dono. Sempre gera Auditoria. */
export async function ajustarEstoque(ctx: Contexto, entrada: unknown): Promise<{ saldo: number }> {
  ctx.exigir("estoque.gerir");
  const e = AjusteSchema.parse(entrada);
  return comTrava(`estoque:${ctx.tenantId}`, async () => {
    const variacao = (await ctx.sistema.lerFresco("Variacoes")).find((v) => v.id === e.variacaoId);
    if (!variacao) throw new ErroApp("invalido", "Peça não encontrada.");
    const saldoAtual = (await lerSaldos(ctx, { fresco: true })).get(e.variacaoId) ?? 0;
    const cfg = await lerConfig(ctx, { fresco: true });
    if (saldoAtual + e.quantidade < 0 && !cfg.estoqueNegativo) {
      throw new ErroApp("invalido", "O estoque não pode ficar negativo.");
    }
    await ctx.sistema.acrescentar(
      "Movimentos",
      { variacaoId: e.variacaoId, tipo: "ajuste", quantidade: e.quantidade, origemId: undefined },
      ctx.usuario.id,
    );
    await ctx.auditar(`ajuste_estoque:${e.motivo}`, "Variacoes", e.variacaoId);
    return { saldo: saldoAtual + e.quantidade };
  });
}

/* ----------------------------------- catálogo e busca ----------------------------------- */

export interface VariacaoCatalogo {
  id: string;
  sku: string;
  tamanho: string;
  cor: string;
  codigoBarras: string | null;
  precoCentavos: number;
  saldo: number;
  minimo: number;
}

export interface ProdutoCatalogo {
  id: string;
  nome: string;
  categoria: string;
  marca: string | null;
  colecao: string | null;
  tipo: "grade" | "simples";
  precoCentavos: number;
  /** Só vem preenchido para quem tem a permissão "estoque.custo.ver" (o dono). */
  custoCentavos: number | null;
  variacoes: VariacaoCatalogo[];
}

export async function montarCatalogo(ctx: Contexto, opts: { fresco?: boolean } = {}): Promise<ProdutoCatalogo[]> {
  ctx.exigir("estoque.ver");
  const lerAba = <N extends "Produtos" | "Variacoes">(aba: N) =>
    opts.fresco ? ctx.sistema.lerFresco(aba) : ctx.sistema.ler(aba);
  const [produtos, variacoes, saldos] = await Promise.all([
    lerAba("Produtos"),
    lerAba("Variacoes"),
    lerSaldos(ctx, opts),
  ]);
  const verCusto = ctx.pode("estoque.custo.ver");
  const porProduto = new Map<string, typeof variacoes>();
  for (const v of variacoes) porProduto.set(v.produtoId, [...(porProduto.get(v.produtoId) ?? []), v]);

  return produtos
    .map<ProdutoCatalogo>((p) => ({
      id: p.id,
      nome: p.nome,
      categoria: p.categoria,
      marca: p.marca ?? null,
      colecao: p.colecao ?? null,
      tipo: p.tipo,
      precoCentavos: p.precoCentavos,
      custoCentavos: verCusto ? p.custoCentavos : null,
      variacoes: (porProduto.get(p.id) ?? [])
        .map<VariacaoCatalogo>((v) => ({
          id: v.id,
          sku: v.sku,
          tamanho: v.tamanho,
          cor: v.cor,
          codigoBarras: v.codigoBarras ?? null,
          precoCentavos: v.precoCentavos ?? p.precoCentavos,
          saldo: saldos.get(v.id) ?? 0,
          minimo: v.minimo,
        }))
        .sort((a, b) => compararTamanhos(a.tamanho, b.tamanho) || a.cor.localeCompare(b.cor, "pt-BR")),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export interface ResultadoBusca {
  produtos: ProdutoCatalogo[];
  /** Quando o termo é exatamente um código de barras ou SKU (leitor): a variação a adicionar direto. */
  variacaoExataId: string | null;
  total: number;
}

/** Busca por nome, marca, categoria, cor, tamanho, SKU ou código de barras. */
export async function buscarCatalogo(ctx: Contexto, termo: string, limite = 30): Promise<ResultadoBusca> {
  const todos = await montarCatalogo(ctx);
  const t = normalizar(termo.slice(0, 80));
  if (t === "") return { produtos: todos.slice(0, limite), variacaoExataId: null, total: todos.length };

  for (const p of todos) {
    const v = p.variacoes.find((x) => x.codigoBarras === t || normalizar(x.sku) === t);
    if (v) return { produtos: [p], variacaoExataId: v.id, total: 1 };
  }

  const tokens = t.split(/\s+/).filter(Boolean);
  const achados = todos.filter((p) => {
    const palheiro = normalizar(
      [p.nome, p.marca, p.categoria, p.colecao, ...p.variacoes.flatMap((v) => [v.sku, v.cor, v.tamanho])]
        .filter(Boolean)
        .join(" "),
    );
    return tokens.every((tk) => palheiro.includes(tk));
  });
  return { produtos: achados.slice(0, limite), variacaoExataId: null, total: achados.length };
}

export interface AlertaMinimo {
  produto: string;
  variacaoId: string;
  tamanho: string;
  cor: string;
  saldo: number;
  minimo: number;
}

/** Variações com saldo abaixo do mínimo definido para elas (mínimo 0 = sem alerta). */
export async function abaixoDoMinimo(ctx: Contexto): Promise<AlertaMinimo[]> {
  const catalogo = await montarCatalogo(ctx);
  return catalogo.flatMap((p) =>
    p.variacoes
      .filter((v) => v.minimo > 0 && v.saldo < v.minimo)
      .map((v) => ({ produto: p.nome, variacaoId: v.id, tamanho: v.tamanho, cor: v.cor, saldo: v.saldo, minimo: v.minimo })),
  );
}
