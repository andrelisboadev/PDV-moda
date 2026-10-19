/**
 * Comissão = percentual do vendedor sobre o que o cliente REALMENTE pagou (total depois do desconto).
 *  - O percentual fica gravado em cada venda (e em cada troca) no momento em que acontece:
 *    mudar a comissão depois não mexe no passado.
 *  - Devolução tira da comissão do vendedor da venda original; as peças levadas numa troca somam
 *    para quem fez a troca. Troca de mesmo valor, pela mesma pessoa, não muda nada.
 *  - Contamos pela data da venda (competência), mesmo no crediário, ainda não recebido.
 *  - Cada venda é arredondada ao centavo e o relatório é a soma dessas parcelas: o total sempre bate.
 *  - O vendedor só enxerga a PRÓPRIA comissão; o dono vê a de todos.
 */
import type { Contexto } from "@/lib/core/contexto";
import { aplicarPontosBase } from "@/lib/core/dinheiro";
import { ErroApp } from "@/lib/core/erros";

export interface ComissaoVendedor {
  vendedorId: string;
  nome: string;
  pontosBaseAtual: number;
  vendas: number;
  vendasCentavos: number;
  devolvidoCentavos: number;
  levadoEmTrocaCentavos: number;
  /** Venda líquida: vendas - devolvido + levado em troca. */
  baseCentavos: number;
  comissaoCentavos: number;
}

export interface RelatorioComissao {
  de: string;
  ate: string;
  vendedores: ComissaoVendedor[];
  totalComissaoCentavos: number;
}

const dia = (iso: string) => iso.slice(0, 10);

export async function calcularComissoes(ctx: Contexto, periodo: { de: string; ate: string }): Promise<RelatorioComissao> {
  if (!ctx.pode("comissao.todas") && !ctx.pode("comissao.propria")) throw new ErroApp("proibido", "Você não tem permissão para fazer isso.");
  const padrao = /^\d{4}-\d{2}-\d{2}$/;
  if (!padrao.test(periodo.de) || !padrao.test(periodo.ate) || periodo.de > periodo.ate) throw new ErroApp("invalido", "Período inválido.");
  const todos = ctx.pode("comissao.todas");

  const [vendas, trocas, usuarios] = await Promise.all([ctx.sistema.lerFresco("Vendas"), ctx.sistema.lerFresco("Trocas"), ctx.sistema.ler("Usuarios")]);
  const vendaPorId = new Map(vendas.map((v) => [v.id, v]));
  const dentro = (iso: string) => dia(iso) >= periodo.de && dia(iso) <= periodo.ate;

  const acc = new Map<string, ComissaoVendedor>();
  const de = (vendedorId: string): ComissaoVendedor => {
    let a = acc.get(vendedorId);
    if (!a) {
      const u = usuarios.find((x) => x.id === vendedorId);
      a = { vendedorId, nome: u?.nome ?? "Ex-vendedor", pontosBaseAtual: u?.comissaoPontosBase ?? 0, vendas: 0, vendasCentavos: 0, devolvidoCentavos: 0, levadoEmTrocaCentavos: 0, baseCentavos: 0, comissaoCentavos: 0 };
      acc.set(vendedorId, a);
    }
    return a;
  };

  for (const v of vendas) {
    if (v.status !== "concluida" || !dentro(v.data)) continue;
    const a = de(v.vendedorId);
    a.vendas++;
    a.vendasCentavos += v.totalCentavos;
    a.comissaoCentavos += aplicarPontosBase(v.totalCentavos, v.comissaoPontosBase);
  }
  for (const t of trocas) {
    if (!dentro(t.criadoEm)) continue;
    const original = vendaPorId.get(t.vendaId);
    if (original) {
      const a = de(original.vendedorId);
      a.devolvidoCentavos += t.valorCentavos;
      a.comissaoCentavos -= aplicarPontosBase(t.valorCentavos, original.comissaoPontosBase);
    }
    if (t.novoTotalCentavos > 0) {
      const a = de(t.vendedorId);
      a.levadoEmTrocaCentavos += t.novoTotalCentavos;
      a.comissaoCentavos += aplicarPontosBase(t.novoTotalCentavos, t.comissaoPontosBase);
    }
  }

  const vendedores = [...acc.values()]
    .filter((a) => todos || a.vendedorId === ctx.usuario.id)
    .map((a) => ({ ...a, baseCentavos: a.vendasCentavos - a.devolvidoCentavos + a.levadoEmTrocaCentavos }))
    .sort((a, b) => b.comissaoCentavos - a.comissaoCentavos);
  return { ...periodo, vendedores, totalComissaoCentavos: vendedores.reduce((s, a) => s + a.comissaoCentavos, 0) };
}
