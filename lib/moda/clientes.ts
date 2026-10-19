/**
 * Clientes. O vendedor cadastra e busca, mas NUNCA define limite de crediário (só o dono).
 * LGPD: guardamos o mínimo (nome, telefone, bairro, aniversário) e só com consentimento registrado.
 */
import { z } from "zod";
import type { Contexto } from "@/lib/core/contexto";
import { MAX_CENTAVOS } from "@/lib/core/dinheiro";
import { ErroApp } from "@/lib/core/erros";
import { agoraSP } from "@/lib/core/tempo";
import { normalizar } from "./estoque";

export const ClienteSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome").max(120),
    telefone: z.string().trim().max(30).optional(),
    bairro: z.string().trim().max(80).optional(),
    aniversarioDia: z.number().int().min(1).max(31).optional(),
    aniversarioMes: z.number().int().min(1).max(12).optional(),
    /** A pessoa precisa concordar com o uso dos dados. Sem isso, não cadastra. */
    consentimento: z.literal(true, { message: "Peça a autorização do cliente para guardar os dados." }),
    /** Só vale quando quem cadastra é o dono. */
    limiteCrediarioCentavos: z.number().int().min(0).max(MAX_CENTAVOS).optional(),
  })
  .strict();

export async function criarCliente(ctx: Contexto, entrada: unknown): Promise<{ clienteId: string }> {
  ctx.exigir("cliente.gerir");
  const e = ClienteSchema.parse(entrada);
  const limite = e.limiteCrediarioCentavos ?? 0;
  if (limite > 0) ctx.exigir("crediario.limite");
  const nova = await ctx.sistema.acrescentar(
    "Clientes",
    {
      nome: e.nome,
      telefone: e.telefone || undefined,
      bairro: e.bairro || undefined,
      aniversarioDia: e.aniversarioDia,
      aniversarioMes: e.aniversarioMes,
      limiteCrediarioCentavos: limite,
      consentimentoEm: agoraSP(),
    },
    ctx.usuario.id,
  );
  await ctx.auditar("criar_cliente", "Clientes", nova.id);
  return { clienteId: nova.id };
}

export async function definirLimiteCrediario(ctx: Contexto, clienteId: string, centavos: number): Promise<void> {
  ctx.exigir("crediario.limite");
  const limite = z.number().int().min(0).max(MAX_CENTAVOS).parse(centavos);
  const existe = (await ctx.sistema.lerFresco("Clientes")).some((c) => c.id === clienteId);
  if (!existe) throw new ErroApp("invalido", "Cliente não encontrado.");
  await ctx.sistema.atualizar("Clientes", clienteId, () => ({ limiteCrediarioCentavos: limite }));
  await ctx.auditar("limite_crediario", "Clientes", clienteId);
}

export interface ClienteResumo {
  id: string;
  nome: string;
  telefone: string | null;
  limiteCrediarioCentavos: number;
}

/** Busca por nome (sem acento, em qualquer ordem) ou telefone. */
export async function buscarClientes(ctx: Contexto, termo: string, limite = 8): Promise<ClienteResumo[]> {
  ctx.exigir("cliente.gerir");
  const t = normalizar(termo.slice(0, 60));
  const digitos = t.replace(/\D/g, "");
  const tokens = t.split(/\s+/).filter(Boolean);
  const todos = await ctx.sistema.ler("Clientes");
  return todos
    .filter((c) => {
      if (t === "") return true;
      const tel = (c.telefone ?? "").replace(/\D/g, "");
      if (digitos.length >= 4 && tel.includes(digitos)) return true;
      const nome = normalizar(c.nome);
      return tokens.every((tk) => nome.includes(tk));
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, limite)
    .map((c) => ({ id: c.id, nome: c.nome, telefone: c.telefone ?? null, limiteCrediarioCentavos: c.limiteCrediarioCentavos }));
}

export interface SaldoCliente {
  /** Vale-troca disponível. */
  creditoCentavos: number;
  /** Parcelas de crediário ainda abertas. */
  crediarioAbertoCentavos: number;
  limiteCrediarioCentavos: number;
}

export async function saldoCliente(ctx: Contexto, clienteId: string, opts: { fresco?: boolean } = {}): Promise<SaldoCliente> {
  ctx.exigir("cliente.gerir");
  const ler = <N extends "Clientes" | "CreditosLoja" | "Contas">(aba: N) =>
    opts.fresco ? ctx.sistema.lerFresco(aba) : ctx.sistema.ler(aba);
  const [clientes, creditos, contas] = await Promise.all([ler("Clientes"), ler("CreditosLoja"), ler("Contas")]);
  const c = clientes.find((x) => x.id === clienteId);
  if (!c) throw new ErroApp("invalido", "Cliente não encontrado.");
  return {
    creditoCentavos: creditos.filter((x) => x.clienteId === clienteId).reduce((s, x) => s + x.valorCentavos, 0),
    crediarioAbertoCentavos: contas
      .filter((x) => x.tipo === "receber" && x.status === "aberta" && x.parceiroId === clienteId)
      .reduce((s, x) => s + x.valorCentavos, 0),
    limiteCrediarioCentavos: c.limiteCrediarioCentavos,
  };
}
