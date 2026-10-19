"use server";

import { executar } from "@/lib/core/acao";
import { buscarClientes, criarCliente, saldoCliente } from "@/lib/moda/clientes";
import { buscarCatalogo } from "@/lib/moda/estoque";
import { registrarVenda } from "@/lib/moda/venda";

/** Busca de peças no PDV. Só leitura; o perfil define o que vem (vendedor não recebe custo). */
export async function buscarPecas(termo: string) {
  return executar("vender.buscar", (ctx) => buscarCatalogo(ctx, typeof termo === "string" ? termo : ""));
}

/** Fecha a venda. Preço, custo, desconto permitido e estoque são conferidos no servidor. */
export async function finalizarVenda(entrada: unknown) {
  return executar("vender.finalizar", (ctx) => registrarVenda(ctx, entrada));
}

/** Busca de clientes no PDV (nome ou telefone). */
export async function buscarClientesAcao(termo: string) {
  return executar("vender.clientes", (ctx) => buscarClientes(ctx, typeof termo === "string" ? termo : ""));
}

/** Vale-troca e crediário do cliente escolhido. */
export async function saldoClienteAcao(clienteId: string) {
  return executar("vender.saldo", (ctx) => saldoCliente(ctx, String(clienteId), { fresco: true }));
}

/** Cadastro rápido no balcão. Só entra com a autorização do cliente. */
export async function cadastrarClienteAcao(entrada: unknown) {
  return executar("vender.cliente_novo", (ctx) => criarCliente(ctx, entrada));
}
