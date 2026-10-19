/**
 * RESERVAR E CONFERIR: o jeito de gastar um saldo (peça no estoque, vale-troca do cliente)
 * sem transação, no Google Sheets, com várias instâncias do servidor ao mesmo tempo.
 *
 *  1. confere o saldo com leitura fresca e recusa cedo se não cobre;
 *  2. RESERVA: grava a saída no livro (acréscimo);
 *  3. CONFERE: relê o livro e soma, para cada chave (peça ou cliente), os lançamentos ATÉ a minha
 *     linha, na ordem em que o Google gravou. Essa ordem é igual para todas as instâncias, então de
 *     dois gastos do mesmo saldo só o primeiro fica; o outro é desfeito com um lançamento de estorno.
 * Conservador: em disputa pesada pode recusar à toa; nunca deixa gastar a mais (ADR 0002 e 0003).
 *
 * Quem chama recebe `desfazer()` para compensar se uma etapa seguinte falhar.
 */
import type { Contexto } from "@/lib/core/contexto";
import { formatarReais } from "@/lib/core/dinheiro";
import { ErroApp } from "@/lib/core/erros";
import { logErro } from "@/lib/core/log";
import { calcularSaldos } from "./estoque";

export interface Reserva {
  desfazer(): Promise<void>;
}

const SEM_RESERVA: Reserva = { async desfazer() {} };

/** Soma o livro na ordem das linhas e devolve a primeira chave que ficou negativa NA minha linha. */
function conferirPrefixo<T extends { id: string }>(
  livro: T[],
  meus: ReadonlySet<string>,
  chave: (l: T) => string,
  valor: (l: T) => number,
): { faltou?: string; achados: number } {
  const acumulado = new Map<string, number>();
  let achados = 0;
  let faltou: string | undefined;
  for (const l of livro) {
    const k = chave(l);
    const total = (acumulado.get(k) ?? 0) + valor(l);
    acumulado.set(k, total);
    if (meus.has(l.id)) {
      achados++;
      if (total < 0) faltou ??= k;
    }
  }
  return { faltou, achados };
}

/* ----------------------------------- estoque ----------------------------------- */

export interface PedidoPeca {
  variacaoId: string;
  quantidade: number; // positiva: quanto sai
  rotulo: string; // "Camiseta P Azul", para a mensagem
}

export async function reservarEstoque(
  ctx: Contexto,
  o: {
    origemId: string;
    tipo: "venda" | "troca" | "condicional_saida";
    itens: PedidoPeca[];
    /** false quando a loja permite vender sem saldo (estoque negativo). */
    controla: boolean;
    /** Nome do registro de Auditoria quando a reserva é recusada por falta de peça. */
    acaoRecusa?: string;
  },
): Promise<Reserva> {
  if (o.itens.length === 0) return SEM_RESERVA;
  const repo = ctx.sistema;
  const rotuloDe = (id: string) => o.itens.find((i) => i.variacaoId === id)?.rotulo ?? "Peça";

  if (o.controla) {
    const saldos = calcularSaldos(await repo.lerFresco("Movimentos"));
    for (const i of o.itens) {
      const saldo = saldos.get(i.variacaoId) ?? 0;
      if (saldo < i.quantidade) throw new ErroApp("conflito", `${i.rotulo}: ${saldo <= 0 ? "acabou" : `só restam ${saldo}`}.`);
    }
  }

  const reservadas = await repo.acrescentarVarios(
    "Movimentos",
    o.itens.map((i) => ({ dados: { variacaoId: i.variacaoId, tipo: o.tipo, quantidade: -i.quantidade, origemId: o.origemId } })),
    ctx.usuario.id,
  );

  const reserva: Reserva = {
    async desfazer() {
      try {
        await repo.acrescentarVarios(
          "Movimentos",
          reservadas.map((m) => ({
            dados: { variacaoId: m.variacaoId, tipo: "estorno" as const, quantidade: -m.quantidade, origemId: o.origemId },
          })),
          ctx.usuario.id,
        );
      } catch (err) {
        // Reserva presa. A conferência de movimentos sem origem (Fase 5) encontra por origemId.
        logErro("desfazer_reserva", err);
      }
    },
  };

  if (o.controla) {
    const livro = await repo.lerFresco("Movimentos");
    const { faltou, achados } = conferirPrefixo(livro, new Set(reservadas.map((m) => m.id)), (l) => l.variacaoId, (l) => l.quantidade);
    if (faltou || achados !== reservadas.length) {
      await reserva.desfazer();
      await ctx.auditar(o.acaoRecusa ?? "reserva_recusada_estoque", "Movimentos", o.origemId).catch((err) => logErro("auditar", err));
      throw new ErroApp(
        "conflito",
        faltou ? `${rotuloDe(faltou)}: acabou de ser vendida em outro caixa.` : "Não foi possível confirmar o estoque. Tente de novo.",
      );
    }
  }
  return reserva;
}

/* ---------------------------------- vale-troca ---------------------------------- */

export function saldoCredito(livro: ReadonlyArray<{ clienteId: string; valorCentavos: number }>, clienteId: string): number {
  return livro.filter((l) => l.clienteId === clienteId).reduce((s, l) => s + l.valorCentavos, 0);
}

export async function reservarCredito(
  ctx: Contexto,
  o: { clienteId: string; valorCentavos: number; origemId: string },
): Promise<Reserva> {
  const repo = ctx.sistema;
  const disponivel = saldoCredito(await repo.lerFresco("CreditosLoja"), o.clienteId);
  if (disponivel < o.valorCentavos) {
    throw new ErroApp("conflito", `O vale-troca da cliente tem ${formatarReais(Math.max(disponivel, 0))}, menos que ${formatarReais(o.valorCentavos)}.`);
  }
  const [minha] = await repo.acrescentarVarios(
    "CreditosLoja",
    [{ dados: { clienteId: o.clienteId, valorCentavos: -o.valorCentavos, origemId: o.origemId, motivo: "uso" } }],
    ctx.usuario.id,
  );
  const reserva: Reserva = {
    async desfazer() {
      try {
        await repo.acrescentarVarios(
          "CreditosLoja",
          [{ dados: { clienteId: o.clienteId, valorCentavos: o.valorCentavos, origemId: o.origemId, motivo: "estorno" } }],
          ctx.usuario.id,
        );
      } catch (err) {
        logErro("desfazer_reserva_credito", err);
      }
    },
  };
  const livro = await repo.lerFresco("CreditosLoja");
  const { faltou, achados } = conferirPrefixo(livro, new Set([minha!.id]), (l) => l.clienteId, (l) => l.valorCentavos);
  if (faltou || achados !== 1) {
    await reserva.desfazer();
    await ctx.auditar("reserva_recusada_credito", "CreditosLoja", o.origemId).catch((err) => logErro("auditar", err));
    throw new ErroApp("conflito", faltou ? "O vale-troca acabou de ser usado em outro caixa." : "Não foi possível confirmar o vale-troca. Tente de novo.");
  }
  return reserva;
}

/** Desfaz várias reservas, da última para a primeira. */
export async function desfazerTodas(reservas: Reserva[]): Promise<void> {
  for (const r of [...reservas].reverse()) await r.desfazer();
}
