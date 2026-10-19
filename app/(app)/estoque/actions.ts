"use server";

import { executar } from "@/lib/core/acao";
import { ajustarEstoque, criarProdutoComGrade } from "@/lib/moda/estoque";

export async function criarProduto(entrada: unknown) {
  return executar("estoque.criar", (ctx) => criarProdutoComGrade(ctx, entrada));
}

export async function ajustarEstoqueAcao(entrada: unknown) {
  return executar("estoque.ajustar", (ctx) => ajustarEstoque(ctx, entrada));
}
