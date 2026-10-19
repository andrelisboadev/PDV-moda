"use server";

import { executar } from "@/lib/core/acao";
import { buscarClientes } from "@/lib/moda/clientes";
import { registrarSaidaCondicional, resolverCondicional } from "@/lib/moda/condicional";
import { buscarCatalogo } from "@/lib/moda/estoque";

export async function buscarClientesCond(termo: string) {
  return executar("condicional.clientes", (ctx) => buscarClientes(ctx, typeof termo === "string" ? termo : ""));
}
export async function buscarPecasCond(termo: string) {
  return executar("condicional.pecas", (ctx) => buscarCatalogo(ctx, typeof termo === "string" ? termo : ""));
}
export async function saidaCondicional(entrada: unknown) {
  return executar("condicional.saida", (ctx) => registrarSaidaCondicional(ctx, entrada));
}
export async function resolverCondicionalAcao(entrada: unknown) {
  return executar("condicional.resolver", (ctx) => resolverCondicional(ctx, entrada));
}
