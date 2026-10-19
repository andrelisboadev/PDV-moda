import { criarContexto, type Contexto } from "@/lib/core/contexto";
import { MAX_PARCELAS_CARTAO, salvarConfig, type ConfigEntrada } from "@/lib/moda/config";
import { ajustarEstoque, criarProdutoComGrade, montarCatalogo } from "@/lib/moda/estoque";
import { criarMundo } from "./mundo";

/** Loja A com um produto em grade (P/M/G × Azul/Preto), preço R$ 59,90 e custo R$ 25,00. */
export async function prepararLoja() {
  const mundo = criarMundo();
  const dono = await criarContexto(mundo.deps, "dona.a@exemplo.com");
  const vend = await criarContexto(mundo.deps, "vend.a@exemplo.com");
  const { produtoId } = await criarProdutoComGrade(dono, {
    nome: "Camiseta Básica",
    categoria: "Feminina",
    marca: "Aurora",
    custoCentavos: 2500,
    precoCentavos: 5990,
    tamanhos: ["P", "M", "G"],
    cores: ["Azul", "Preto"],
    minimo: 1,
  });
  const catalogo = await montarCatalogo(dono, { fresco: true });
  const produto = catalogo.find((p) => p.id === produtoId)!;
  const v = (tamanho: string, cor: string) => produto.variacoes.find((x) => x.tamanho === tamanho && x.cor === cor)!.id;
  return { ...mundo, dono, vend, produtoId, v };
}

export const darEstoque = (dono: Contexto, variacaoId: string, quantidade: number) =>
  ajustarEstoque(dono, { variacaoId, quantidade, motivo: "saldo_inicial" });

export const configurar = (dono: Contexto, parcial: Partial<ConfigEntrada> = {}) =>
  salvarConfig(dono, {
    descontoMaxVendedorPb: 0,
    estoqueNegativo: false,
    taxaDebitoPb: 0,
    taxaPixPb: 0,
    taxaDinheiroPb: 0,
    taxaCreditoPb: Array<number>(MAX_PARCELAS_CARTAO).fill(0),
    crediarioMaxParcelas: 6,
    crediarioPrimeiroDias: 30,
    condicionalPrazoDias: 3,
    trocaPrazoDias: 0,
    ...parcial,
  });

export const saldoDe = async (ctx: Contexto, variacaoId: string) => {
  const movs = await ctx.sistema.lerFresco("Movimentos");
  return movs.filter((m) => m.variacaoId === variacaoId).reduce((s, m) => s + m.quantidade, 0);
};
