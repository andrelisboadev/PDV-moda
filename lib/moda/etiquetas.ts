/**
 * Etiquetas de preço com código de barras EAN-13. O preço vem do servidor (variação ou produto);
 * custo nunca aparece. Quem tem "estoque.ver" imprime.
 */
import { z } from "zod";
import type { Contexto } from "@/lib/core/contexto";
import { ErroApp } from "@/lib/core/erros";
import { digitoEan13 } from "./estoque";

export const MAX_ETIQUETAS = 300;

export interface Etiqueta {
  produto: string;
  tamanho: string;
  cor: string;
  precoCentavos: number;
  sku: string;
  codigoBarras: string;
}

export const PedidoEtiquetasSchema = z
  .object({
    produtoId: z.string().min(10).max(40),
    /** Cópias por variação. */
    copias: z.number().int().min(1).max(50).default(1),
  })
  .strict();

export async function montarEtiquetas(ctx: Contexto, entrada: unknown): Promise<Etiqueta[]> {
  ctx.exigir("estoque.ver");
  const e = PedidoEtiquetasSchema.parse(entrada);
  const [produtos, variacoes] = await Promise.all([ctx.sistema.ler("Produtos"), ctx.sistema.ler("Variacoes")]);
  const p = produtos.find((x) => x.id === e.produtoId);
  if (!p) throw new ErroApp("invalido", "Produto não encontrado.");
  const doProduto = variacoes.filter((v) => v.produtoId === p.id && v.codigoBarras);
  if (doProduto.length * e.copias > MAX_ETIQUETAS) {
    throw new ErroApp("invalido", `Muitas etiquetas de uma vez (máximo ${MAX_ETIQUETAS}). Reduza as cópias.`);
  }
  return doProduto.flatMap((v) =>
    Array.from({ length: e.copias }, () => ({
      produto: p.nome,
      tamanho: v.tamanho,
      cor: v.cor,
      precoCentavos: v.precoCentavos ?? p.precoCentavos,
      sku: v.sku,
      codigoBarras: v.codigoBarras!,
    })),
  );
}

/* ------------------------------- EAN-13 em módulos ------------------------------- */

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARIDADE = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** "1" = barra, "0" = espaço: 95 módulos. Devolve null se o código não for um EAN-13 válido. */
export function modulosEan13(codigo: string): string | null {
  if (!/^\d{13}$/.test(codigo) || digitoEan13(codigo.slice(0, 12)) !== Number(codigo[12])) return null;
  const d = [...codigo].map(Number);
  const par = PARIDADE[d[0]!]!;
  let out = "101";
  for (let i = 0; i < 6; i++) out += (par[i] === "L" ? L : G)[d[i + 1]!];
  out += "01010";
  for (let i = 0; i < 6; i++) out += R[d[i + 7]!];
  return out + "101";
}
