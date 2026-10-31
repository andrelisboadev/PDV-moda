/**
 * Compras de mercadoria por grade. Uma compra grava, num lote atômico: a compra, os itens, a entrada
 * no estoque (livro), a saída do caixa (à vista) OU as parcelas a pagar (a prazo) e a auditoria.
 * Só o dono ("compras.gerir"). Custo e quantidade vêm do formulário; a loja vem da sessão.
 */
import { ulid } from "ulid";
import { z } from "zod";
import type { Contexto } from "@/lib/core/contexto";
import { dividirEmParcelas, MAX_CENTAVOS } from "@/lib/core/dinheiro";
import { ErroApp } from "@/lib/core/erros";
import { agoraSP, diaSP, somarDias, somarMeses } from "@/lib/core/tempo";

export const FormaCompraSchema = z.enum(["dinheiro", "pix", "debito", "credito"]);

export const FornecedorSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome").max(120),
    telefone: z.string().trim().max(30).optional(),
    prazoPadraoDias: z.number().int().min(0).max(365).default(30),
  })
  .strict();

export async function criarFornecedor(ctx: Contexto, entrada: unknown): Promise<{ fornecedorId: string }> {
  ctx.exigir("compras.gerir");
  const e = FornecedorSchema.parse(entrada);
  const nova = await ctx.sistema.acrescentar(
    "Fornecedores",
    { nome: e.nome, telefone: e.telefone || undefined, prazoPadraoDias: e.prazoPadraoDias },
    ctx.usuario.id,
  );
  await ctx.auditar("criar_fornecedor", "Fornecedores", nova.id);
  return { fornecedorId: nova.id };
}

export const CompraSchema = z
  .object({
    fornecedorId: z.string().min(10).max(40),
    pagamento: z.enum(["avista", "prazo"]),
    /** Como saiu o dinheiro (só compra à vista). */
    forma: FormaCompraSchema.default("dinheiro"),
    /** Número de parcelas (só compra a prazo). */
    parcelas: z.number().int().min(1).max(12).default(1),
    /** Dias até a 1ª parcela. Sem valor, usa o prazo padrão do fornecedor. */
    primeiroVencimentoDias: z.number().int().min(0).max(365).optional(),
    /** Atualiza o custo do produto para o desta compra. */
    atualizarCusto: z.boolean().default(false),
    itens: z
      .array(
        z
          .object({
            variacaoId: z.string().min(10).max(40),
            quantidade: z.number().int().min(1).max(100_000),
            custoCentavos: z.number().int().min(0).max(MAX_CENTAVOS),
          })
          .strict(),
      )
      .min(1, "Inclua ao menos uma peça")
      .max(200),
  })
  .strict();

export async function registrarCompra(
  ctx: Contexto,
  entrada: unknown,
): Promise<{ compraId: string; totalCentavos: number }> {
  ctx.exigir("compras.gerir");
  const e = CompraSchema.parse(entrada);
  const repo = ctx.sistema;

  const [fornecedores, variacoes] = await Promise.all([repo.lerFresco("Fornecedores"), repo.lerFresco("Variacoes")]);
  const fornecedor = fornecedores.find((f) => f.id === e.fornecedorId);
  if (!fornecedor) throw new ErroApp("invalido", "Fornecedor não encontrado.");
  const porId = new Map(variacoes.map((v) => [v.id, v]));
  if (e.itens.some((i) => !porId.has(i.variacaoId))) throw new ErroApp("invalido", "Peça não encontrada.");

  // o mesmo item repetido vira uma linha só (soma quantidades; custo médio ponderado, arredondado)
  const juntos = new Map<string, { quantidade: number; valor: number }>();
  for (const i of e.itens) {
    const a = juntos.get(i.variacaoId) ?? { quantidade: 0, valor: 0 };
    a.quantidade += i.quantidade;
    a.valor += i.quantidade * i.custoCentavos;
    juntos.set(i.variacaoId, a);
  }
  const linhas = [...juntos].map(([variacaoId, a]) => ({
    variacaoId,
    quantidade: a.quantidade,
    custoCentavos: Math.round(a.valor / a.quantidade),
    valor: a.valor,
  }));
  const total = linhas.reduce((s, l) => s + l.valor, 0);
  if (total <= 0) throw new ErroApp("invalido", "O total da compra precisa ser maior que zero.");
  if (total > MAX_CENTAVOS) throw new ErroApp("invalido", "Valor acima do permitido.");

  const compraId = ulid();
  const agora = agoraSP();
  const curto = compraId.slice(-6);
  const diasPrimeira = e.primeiroVencimentoDias ?? fornecedor.prazoPadraoDias;
  const primeiro = somarDias(diaSP(), diasPrimeira);
  const partes = e.pagamento === "prazo" ? dividirEmParcelas(total, e.parcelas) : [];

  await repo.acrescentarAtomico(
    [
      { aba: "Compras", itens: [{ id: compraId, dados: { fornecedorId: fornecedor.id, data: agora, pagamento: e.pagamento, totalCentavos: total } }] },
      {
        aba: "CompraItens",
        itens: linhas.map((l) => ({ dados: { compraId, variacaoId: l.variacaoId, quantidade: l.quantidade, custoCentavos: l.custoCentavos } })),
      },
      {
        aba: "Movimentos",
        itens: linhas.map((l) => ({ dados: { variacaoId: l.variacaoId, tipo: "compra", quantidade: l.quantidade, origemId: compraId } })),
      },
      {
        aba: "Caixa",
        itens:
          e.pagamento === "avista"
            ? [{ dados: { data: agora, tipo: "saida", descricao: `Compra ${curto} (${fornecedor.nome})`.slice(0, 200), categoria: "compra", valorCentavos: total, forma: e.forma, origemId: compraId } }]
            : [],
      },
      {
        aba: "Contas",
        itens: partes.map((valorCentavos, i) => ({
          dados: {
            tipo: "pagar",
            descricao: `Compra ${curto} (${fornecedor.nome})`.slice(0, 200),
            parceiroNome: fornecedor.nome,
            parceiroId: fornecedor.id,
            refId: compraId,
            parcela: i + 1,
            totalParcelas: partes.length,
            vencimento: somarMeses(primeiro, i),
            valorCentavos,
            status: "aberta",
          },
        })),
      },
      { aba: "Auditoria", itens: [{ dados: { quando: agora, usuario: ctx.usuario.id, acao: "compra_registrada", entidade: "Compras", entidadeId: compraId } }] },
    ],
    ctx.usuario.id,
  );

  if (e.atualizarCusto) {
    // melhor esforço: a compra já está gravada; falha aqui não a desfaz
    const porProduto = new Map<string, number>();
    for (const l of linhas) porProduto.set(porId.get(l.variacaoId)!.produtoId, l.custoCentavos);
    for (const [produtoId, custo] of porProduto) {
      await repo.atualizar("Produtos", produtoId, () => ({ custoCentavos: custo })).catch(() => undefined);
    }
  }
  return { compraId, totalCentavos: total };
}

export interface CompraResumo {
  id: string;
  data: string;
  fornecedor: string;
  pagamento: "avista" | "prazo";
  totalCentavos: number;
}

export async function listarCompras(ctx: Contexto, limite = 20): Promise<CompraResumo[]> {
  ctx.exigir("compras.gerir");
  const [compras, fornecedores] = await Promise.all([ctx.sistema.ler("Compras"), ctx.sistema.ler("Fornecedores")]);
  const nome = new Map(fornecedores.map((f) => [f.id, f.nome]));
  return compras
    .sort((a, b) => b.data.localeCompare(a.data))
    .slice(0, limite)
    .map((c) => ({ id: c.id, data: c.data, fornecedor: nome.get(c.fornecedorId) ?? "—", pagamento: c.pagamento, totalCentavos: c.totalCentavos }));
}
