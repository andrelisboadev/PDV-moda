/**
 * Condicional: a cliente leva peças para experimentar em casa e devolve o que não ficar.
 *
 *  - SAÍDA: as peças saem do estoque (movimento "condicional_saida", reserva-e-conferência) e ficam
 *    "pendentes". Peça em condicional não conta como disponível para outra venda.
 *  - RESOLUÇÃO de cada peça: "devolveu" (volta ao estoque) ou "comprou" (vira venda normal, com
 *    desconto, pagamento, crediário etc.).
 *  - SEM CONTAR DUAS VEZES: a venda de peça comprada NÃO baixa o estoque de novo (a baixa foi a saída),
 *    e a devolução repõe só o que voltou. Cada peça só pode ser resolvida uma vez (conferência de versão).
 *  - "Vencido" é calculado pela data (não há tarefa agendada): passou do prazo e ainda há pendência.
 */
import { ulid } from "ulid";
import { z } from "zod";
import type { Contexto } from "@/lib/core/contexto";
import { ErroApp } from "@/lib/core/erros";
import { logErro } from "@/lib/core/log";
import { comTrava } from "@/lib/core/mutex";
import { agoraSP, diaSP, somarDias } from "@/lib/core/tempo";
import { lerConfig } from "./config";
import { reservarEstoque, type Reserva } from "./reserva";
import { fecharVenda, prepararVenda, VendaSchema, type BlocoAtomico, type ResultadoVenda } from "./venda";

const id = z.string().min(1).max(40);

export const SaidaCondicionalSchema = z
  .object({
    clienteId: id,
    itens: z.array(z.object({ variacaoId: id, quantidade: z.number().int().min(1).max(99) }).strict()).min(1).max(50),
    /** Se não informar, vale o prazo da loja. */
    prazoDias: z.number().int().min(1).max(60).optional(),
  })
  .strict();

export async function registrarSaidaCondicional(ctx: Contexto, entrada: unknown): Promise<{ condicionalId: string; devolverAte: string }> {
  ctx.exigir("condicional.gerir");
  const e = SaidaCondicionalSchema.parse(entrada);
  return comTrava(`estoque:${ctx.tenantId}`, async () => {
    const repo = ctx.sistema;
    if (!(await repo.ler("Clientes")).some((c) => c.id === e.clienteId)) throw new ErroApp("invalido", "Cliente não encontrado.");
    const [produtos, variacoes, cfg] = await Promise.all([repo.ler("Produtos"), repo.ler("Variacoes"), lerConfig(ctx)]);

    const qtd = new Map<string, number>();
    for (const i of e.itens) qtd.set(i.variacaoId, (qtd.get(i.variacaoId) ?? 0) + i.quantidade);
    const linhas = [...qtd].map(([variacaoId, quantidade]) => {
      const v = variacoes.find((x) => x.id === variacaoId);
      const p = v && produtos.find((x) => x.id === v.produtoId);
      if (!v || !p) throw new ErroApp("invalido", "Uma das peças não existe mais. Atualize a tela e tente de novo.");
      return { variacaoId, quantidade, rotulo: `${p.nome} ${v.tamanho} ${v.cor}`.replace(/ Único/g, "") };
    });

    const condicionalId = ulid();
    const reserva: Reserva = await reservarEstoque(ctx, { origemId: condicionalId, tipo: "condicional_saida", controla: !cfg.estoqueNegativo, itens: linhas });
    const agora = agoraSP();
    const devolverAte = somarDias(diaSP(), e.prazoDias ?? cfg.condicionalPrazoDias);
    try {
      await repo.acrescentarAtomico(
        [
          { aba: "Condicionais", itens: [{ id: condicionalId, dados: { clienteId: e.clienteId, vendedorId: ctx.usuario.id, saidaEm: agora, devolverAte, status: "aberto" } }] },
          { aba: "CondicionalItens", itens: linhas.map((l) => ({ dados: { condicionalId, variacaoId: l.variacaoId, quantidade: l.quantidade, resultado: "pendente" } })) },
          { aba: "Auditoria", itens: [{ dados: { quando: agora, usuario: ctx.usuario.id, acao: "condicional_saida", entidade: "Condicionais", entidadeId: condicionalId } }] },
        ],
        ctx.usuario.id,
      );
    } catch (err) {
      await reserva.desfazer();
      throw err;
    }
    return { condicionalId, devolverAte };
  });
}

/* ------------------------------ devolver / comprar ------------------------------ */

export const ResolverCondicionalSchema = z
  .object({
    condicionalId: id,
    resolucoes: z
      .array(z.object({ itemId: id, resultado: z.enum(["comprou", "devolveu"]) }).strict())
      .min(1)
      .max(50),
    /** Obrigatórios só quando alguma peça foi comprada: mesmas regras de uma venda. */
    desconto: VendaSchema.shape.desconto,
    pagamentos: VendaSchema.shape.pagamentos.optional(),
  })
  .strict();

export interface ResultadoResolucao {
  vendaId?: string;
  devolvidas: number;
  compradas: number;
  encerrado: boolean;
}

export async function resolverCondicional(ctx: Contexto, entrada: unknown): Promise<ResultadoResolucao> {
  ctx.exigir("condicional.gerir");
  const e = ResolverCondicionalSchema.parse(entrada);
  return comTrava(`estoque:${ctx.tenantId}`, async () => {
    const repo = ctx.sistema;
    const [conds, todosItens] = await Promise.all([repo.lerFresco("Condicionais"), repo.lerFresco("CondicionalItens")]);
    const cond = conds.find((c) => c.id === e.condicionalId);
    if (!cond) throw new ErroApp("invalido", "Condicional não encontrado.");
    const itens = todosItens.filter((i) => i.condicionalId === cond.id);

    const ids = e.resolucoes.map((r) => r.itemId);
    if (new Set(ids).size !== ids.length) throw new ErroApp("invalido", "Peça repetida na lista.");
    const escolhidos = e.resolucoes.map((r) => {
      const item = itens.find((i) => i.id === r.itemId);
      if (!item) throw new ErroApp("invalido", "Peça não faz parte deste condicional.");
      if (item.resultado !== "pendente") throw new ErroApp("conflito", "Esta peça já foi resolvida (devolvida ou comprada).");
      return { item, resultado: r.resultado };
    });
    const compradas = escolhidos.filter((x) => x.resultado === "comprou").map((x) => x.item);
    const devolvidas = escolhidos.filter((x) => x.resultado === "devolveu").map((x) => x.item);
    if (compradas.length > 0) ctx.exigir("venda.criar");
    if (compradas.length === 0 && (e.pagamentos || e.desconto)) throw new ErroApp("invalido", "Sem peça comprada, não há o que pagar.");
    if (compradas.length > 0 && !e.pagamentos) throw new ErroApp("invalido", "Informe como a cliente vai pagar as peças que ficou.");

    const agora = agoraSP();
    const marcar = (resultado: "comprou" | "devolveu") => async (lista: typeof compradas) => {
      if (lista.length === 0) return;
      await repo.atualizarVarias("CondicionalItens", lista.map((i) => i.id), (atual) => {
        if (atual.resultado !== "pendente") throw new ErroApp("conflito", "Esta peça já foi resolvida (devolvida ou comprada).");
        return { resultado };
      });
    };
    const reclamar = async () => {
      await marcar("comprou")(compradas);
      await marcar("devolveu")(devolvidas);
    };
    const desreclamar = async () => {
      try {
        await repo.atualizarVarias("CondicionalItens", [...compradas, ...devolvidas].map((i) => i.id), () => ({ resultado: "pendente" as const }));
      } catch (err) {
        logErro("desfazer_condicional", err);
      }
    };

    const retornos: BlocoAtomico = {
      aba: "Movimentos",
      itens: devolvidas.map((i) => ({ dados: { variacaoId: i.variacaoId, tipo: "condicional_retorno", quantidade: i.quantidade, origemId: cond.id } })),
    };
    const auditoria: BlocoAtomico = {
      aba: "Auditoria",
      itens: [{ dados: { quando: agora, usuario: ctx.usuario.id, acao: "condicional_resolvido", entidade: "Condicionais", entidadeId: cond.id } }],
    };

    let vendaId: string | undefined;
    if (compradas.length > 0) {
      const venda = VendaSchema.parse({
        clienteId: cond.clienteId,
        itens: compradas.map((i) => ({ variacaoId: i.variacaoId, quantidade: i.quantidade })),
        desconto: e.desconto,
        pagamentos: e.pagamentos,
      });
      const prep = await prepararVenda(ctx, venda); // valida tudo (preço, limite, pagamentos) antes de mexer em qualquer coisa
      const r: ResultadoVenda = await fecharVenda(ctx, prep, {
        baixaPrevia: true, // as peças já saíram do estoque na saída do condicional
        antesDeFechar: reclamar,
        aoFalhar: desreclamar,
        blocosExtras: [retornos, auditoria],
      });
      vendaId = r.vendaId;
    } else {
      await reclamar();
      try {
        await repo.acrescentarAtomico([retornos, auditoria], ctx.usuario.id);
      } catch (err) {
        await desreclamar();
        throw err;
      }
    }

    // Encerra o condicional quando não sobrou pendência (se falhar, o status calculado já mostra "finalizado").
    const restantes = itens.length - escolhidos.length;
    if (restantes === 0) {
      await repo.atualizar("Condicionais", cond.id, () => ({ status: "finalizado" as const })).catch((err) => logErro("encerrar_condicional", err));
    }
    return { vendaId, devolvidas: devolvidas.length, compradas: compradas.length, encerrado: restantes === 0 };
  });
}

/* ----------------------------------- consulta ----------------------------------- */

export interface CondicionalVisto {
  id: string;
  clienteId: string;
  clienteNome: string;
  clienteTelefone: string | null;
  saidaEm: string;
  devolverAte: string;
  status: "aberto" | "vencido" | "finalizado";
  itens: Array<{ id: string; variacaoId: string; descricao: string; precoCentavos: number; quantidade: number; resultado: "pendente" | "comprou" | "devolveu" }>;
}

export async function listarCondicionais(ctx: Contexto, opts: { apenasAbertos?: boolean } = {}): Promise<CondicionalVisto[]> {
  ctx.exigir("condicional.gerir");
  const [conds, itens, clientes, produtos, variacoes] = await Promise.all([
    ctx.sistema.ler("Condicionais"),
    ctx.sistema.ler("CondicionalItens"),
    ctx.sistema.ler("Clientes"),
    ctx.sistema.ler("Produtos"),
    ctx.sistema.ler("Variacoes"),
  ]);
  const hoje = diaSP();
  return conds
    .map<CondicionalVisto>((c) => {
      const meus = itens.filter((i) => i.condicionalId === c.id);
      const pendente = meus.some((i) => i.resultado === "pendente");
      const cliente = clientes.find((x) => x.id === c.clienteId);
      return {
        id: c.id,
        clienteId: c.clienteId,
        clienteNome: cliente?.nome ?? "Cliente",
        clienteTelefone: cliente?.telefone ?? null,
        saidaEm: c.saidaEm,
        devolverAte: c.devolverAte,
        status: !pendente ? "finalizado" : c.devolverAte.slice(0, 10) < hoje ? "vencido" : "aberto",
        itens: meus.map((i) => {
          const v = variacoes.find((x) => x.id === i.variacaoId);
          const p = v && produtos.find((x) => x.id === v.produtoId);
          return {
            id: i.id,
            variacaoId: i.variacaoId,
            descricao: p && v ? `${p.nome} ${v.tamanho} ${v.cor}`.replace(/ Único/g, "") : "Peça",
            precoCentavos: p && v ? (v.precoCentavos ?? p.precoCentavos) : 0,
            quantidade: i.quantidade,
            resultado: i.resultado,
          };
        }),
      };
    })
    .filter((c) => (opts.apenasAbertos ? c.status !== "finalizado" : true))
    .sort((a, b) => (a.status === b.status ? a.devolverAte.localeCompare(b.devolverAte) : a.status === "vencido" ? -1 : 1));
}
