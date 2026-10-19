import type { FORMAS } from "@/lib/core/schema";

export type FormaPagamento = (typeof FORMAS)[number];

export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  debito: "Débito",
  credito: "Crédito",
  crediario: "Crediário",
  credito_loja: "Vale-troca",
};

