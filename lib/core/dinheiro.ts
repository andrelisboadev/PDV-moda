/**
 * Dinheiro e percentuais. Tudo é inteiro: reais em CENTAVOS, percentuais em PONTOS-BASE
 * (10% = 1000). Só formatamos em R$ na tela. Nenhuma conta usa decimal de ponto flutuante
 * para guardar valor; a única divisão arredonda de forma explícita.
 */

export const MAX_CENTAVOS = 100_000_000_00; // R$ 100 milhões

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const formatarReais = (centavos: number): string => brl.format(centavos / 100);

/** "59,90", "1.299,90", "R$ 59,90", "59.90" ou "59" -> centavos. Inválido/negativo -> null. */
export function lerReais(texto: string): number | null {
  const t = texto.replace(/R\$/gi, "").replace(/\s/g, "");
  if (t === "") return null;
  let inteiro: string;
  let decimal = "";
  if (t.includes(",")) {
    const partes = t.split(",");
    if (partes.length !== 2) return null;
    inteiro = (partes[0] ?? "").replace(/\./g, "");
    decimal = partes[1] ?? "";
  } else if (/^\d+\.\d{1,2}$/.test(t)) {
    [inteiro = "", decimal = ""] = t.split(".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    inteiro = t.replace(/\./g, "");
  } else {
    inteiro = t;
  }
  if (!/^\d+$/.test(inteiro) || !/^\d{0,2}$/.test(decimal)) return null;
  const centavos = Number(inteiro) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(centavos) && centavos <= MAX_CENTAVOS ? centavos : null;
}

/** Centavos -> "59,90" (sem símbolo), para preencher campos de texto. */
export const centavosParaCampo = (centavos: number): string =>
  (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Aplica pontos-base a um valor em centavos, arredondando para o centavo mais próximo. */
export function aplicarPontosBase(centavos: number, pontosBase: number): number {
  return Math.round((centavos * pontosBase) / 10_000);
}

/** "10", "10,5" -> 1000, 1050 pontos-base. Inválido ou fora de 0..100% -> null. */
export function lerPercentual(texto: string): number | null {
  const t = texto.replace(/%/g, "").replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const pb = Math.round(Number(t) * 100);
  return pb >= 0 && pb <= 10_000 ? pb : null;
}

/** 1050 -> "10,5%". */
export const formatarPercentual = (pontosBase: number): string =>
  `${(pontosBase / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/** Pontos-base como texto de campo: 1050 -> "10,5". */
export const pontosBaseParaCampo = (pb: number): string =>
  (pb / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/**
 * Divide `total` em `n` parcelas inteiras cuja soma é EXATAMENTE `total`:
 * as primeiras parcelas levam o arredondamento para baixo e a última absorve os centavos
 * que sobram. (Usado pelo crediário na Fase 3.)
 */
export function dividirEmParcelas(total: number, n: number): number[] {
  if (!Number.isInteger(total) || total < 0 || !Number.isInteger(n) || n < 1) throw new Error("parcelas inválidas");
  const base = Math.floor(total / n);
  const parcelas = Array<number>(n).fill(base);
  parcelas[n - 1] = total - base * (n - 1);
  return parcelas;
}
