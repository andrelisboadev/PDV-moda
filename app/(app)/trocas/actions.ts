"use server";

import { executar } from "@/lib/core/acao";
import { buscarCatalogo } from "@/lib/moda/estoque";
import { registrarTroca } from "@/lib/moda/troca";

export async function buscarPecasTroca(termo: string) {
  return executar("troca.pecas", (ctx) => buscarCatalogo(ctx, typeof termo === "string" ? termo : ""));
}
export async function trocaAcao(entrada: unknown) {
  return executar("troca.registrar", (ctx) => registrarTroca(ctx, entrada));
}
