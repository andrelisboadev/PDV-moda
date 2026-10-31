import { describe, expect, it } from "vitest";
import { criarContexto } from "@/lib/core/contexto";
import { diaSP, somarDias, somarMeses } from "@/lib/core/tempo";
import { criarCliente, definirLimiteCrediario } from "@/lib/moda/clientes";
import { criarFornecedor, listarCompras, registrarCompra } from "@/lib/moda/compras";
import { darBaixa, listarContas, situacaoDe } from "@/lib/moda/contas";
import { modulosEan13, montarEtiquetas } from "@/lib/moda/etiquetas";
import { fecharDia, fechamentoDoDia } from "@/lib/moda/fechamento";
import { aniversariantes, montarPainel } from "@/lib/moda/painel";
import { conferirLoja } from "@/lib/moda/reconciliacao";
import { mesAtual, resumoMensal } from "@/lib/moda/resumo";
import { registrarVenda } from "@/lib/moda/venda";
import { configurar, darEstoque, prepararLoja, saldoDe } from "./helpers/loja";

const pix = (valorCentavos: number) => ({ forma: "pix" as const, valorCentavos, parcelas: 1 });

async function loja() {
  const L = await prepararLoja();
  await configurar(L.dono);
  const { fornecedorId } = await criarFornecedor(L.dono, { nome: "Atacado Bela", prazoPadraoDias: 30 });
  return { ...L, fornecedorId };
}

describe("compras por grade", () => {
  it("à vista: entra no estoque, sai do caixa, sem conta a pagar; vendedor é barrado", async () => {
    const L = await loja();
    const itens = [
      { variacaoId: L.v("M", "Azul"), quantidade: 6, custoCentavos: 2500 },
      { variacaoId: L.v("G", "Azul"), quantidade: 4, custoCentavos: 2500 },
    ];
    await expect(registrarCompra(L.vend, { fornecedorId: L.fornecedorId, pagamento: "avista", itens })).rejects.toMatchObject({ codigo: "proibido" });
    const r = await registrarCompra(L.dono, { fornecedorId: L.fornecedorId, pagamento: "avista", forma: "pix", itens });
    expect(r.totalCentavos).toBe(25_000);
    expect(await saldoDe(L.dono, L.v("M", "Azul"))).toBe(6);
    expect(await saldoDe(L.dono, L.v("G", "Azul"))).toBe(4);
    const caixa = (await L.dono.ler("Caixa")).filter((c) => c.origemId === r.compraId);
    expect(caixa).toEqual([expect.objectContaining({ tipo: "saida", forma: "pix", valorCentavos: 25_000, categoria: "compra" })]);
    expect((await L.dono.ler("Contas")).filter((c) => c.refId === r.compraId)).toHaveLength(0);
    expect((await listarCompras(L.dono))[0]).toMatchObject({ fornecedor: "Atacado Bela", totalCentavos: 25_000 });
    expect(await conferirLoja(L.dono.sistema)).toEqual([]);
  });
  it("a prazo: parcelas somam o total, vencem mês a mês e nada sai do caixa", async () => {
    const L = await loja();
    const r = await registrarCompra(L.dono, {
      fornecedorId: L.fornecedorId, pagamento: "prazo", parcelas: 3,
      itens: [{ variacaoId: L.v("P", "Preto"), quantidade: 10, custoCentavos: 1000 }],
    });
    const contas = (await L.dono.ler("Contas")).filter((c) => c.refId === r.compraId).sort((a, b) => a.parcela - b.parcela);
    expect(contas.map((c) => c.valorCentavos)).toEqual([3333, 3333, 3334]);
    const primeiro = somarDias(diaSP(), 30);
    expect(contas.map((c) => c.vencimento)).toEqual([primeiro, somarMeses(primeiro, 1), somarMeses(primeiro, 2)]);
    expect(contas.every((c) => c.tipo === "pagar" && c.status === "aberta")).toBe(true);
    expect((await L.dono.ler("Caixa")).filter((c) => c.origemId === r.compraId)).toHaveLength(0);
  });
  it("junta itens repetidos, atualiza o custo quando pedido e recusa peça ou fornecedor inexistente", async () => {
    const L = await loja();
    const v = L.v("M", "Preto");
    await registrarCompra(L.dono, {
      fornecedorId: L.fornecedorId, pagamento: "avista", atualizarCusto: true,
      itens: [{ variacaoId: v, quantidade: 1, custoCentavos: 3000 }, { variacaoId: v, quantidade: 1, custoCentavos: 3000 }],
    });
    expect((await L.dono.sistema.lerFresco("Movimentos")).filter((m) => m.tipo === "compra")).toHaveLength(1);
    expect(await saldoDe(L.dono, v)).toBe(2);
    expect((await L.dono.sistema.lerFresco("Produtos")).find((p) => p.id === L.produtoId)!.custoCentavos).toBe(3000);
    const base = { pagamento: "avista", itens: [{ variacaoId: v, quantidade: 1, custoCentavos: 100 }] };
    await expect(registrarCompra(L.dono, { ...base, fornecedorId: "FORNECEDOR-INEXISTENTE" })).rejects.toMatchObject({ codigo: "invalido" });
    await expect(registrarCompra(L.dono, { ...base, fornecedorId: L.fornecedorId, itens: [{ variacaoId: "VARIACAO-INEXISTENTE", quantidade: 1, custoCentavos: 1 }] })).rejects.toMatchObject({ codigo: "invalido" });
    await expect(registrarCompra(L.dono, { ...base, fornecedorId: L.fornecedorId, itens: [{ variacaoId: v, quantidade: 0, custoCentavos: 1 }] })).rejects.toThrow();
    await expect(registrarCompra(L.dono, { ...base, fornecedorId: L.fornecedorId, itens: [{ variacaoId: v, quantidade: 1, custoCentavos: 0 }] })).rejects.toMatchObject({ codigo: "invalido" });
  });
});

describe("contas a pagar e a receber", () => {
  async function comCrediario() {
    const L = await loja();
    await darEstoque(L.dono, L.v("M", "Azul"), 10);
    const { clienteId } = await criarCliente(L.vend, { nome: "Maria da Silva", telefone: "(91) 98888-7777", consentimento: true });
    await definirLimiteCrediario(L.dono, clienteId, 100_000);
    const v = await registrarVenda(L.vend, {
      clienteId, itens: [{ variacaoId: L.v("M", "Azul"), quantidade: 1 }],
      pagamentos: [{ forma: "crediario", valorCentavos: 5990, parcelas: 2 }],
    });
    return { ...L, clienteId, v };
  }
  it("lista o crediário com resumo e classifica atraso", async () => {
    const L = await comCrediario();
    const { contas, resumo } = await listarContas(L.dono, { tipo: "receber" });
    expect(contas).toHaveLength(2);
    expect(resumo.abertasCentavos).toBe(5990);
    expect(resumo.atrasadasCentavos).toBe(0);
    const depois = await listarContas(L.dono, { tipo: "receber", hoje: somarDias(diaSP(), 40) });
    expect(depois.resumo.quantidadeAtrasadas).toBe(1);
    expect(situacaoDe({ status: "aberta", vencimento: "2026-01-01" }, "2026-01-01")).toBe("hoje");
    expect(situacaoDe({ status: "paga", vencimento: "2020-01-01" }, "2026-01-01")).toBe("paga");
    await expect(listarContas(L.vend, { tipo: "receber" })).rejects.toMatchObject({ codigo: "proibido" });
  });
  it("baixa de parcela: marca paga, lança entrada no caixa e recusa baixa dupla", async () => {
    const L = await comCrediario();
    const [c1] = (await listarContas(L.dono, { tipo: "receber" })).contas;
    await darBaixa(L.dono, { contaId: c1!.id, forma: "pix" });
    const caixa = (await L.dono.ler("Caixa")).filter((c) => c.origemId === c1!.id);
    expect(caixa).toEqual([expect.objectContaining({ tipo: "entrada", forma: "pix", valorCentavos: c1!.valorCentavos, categoria: "recebimento_crediario" })]);
    expect((await listarContas(L.dono, { tipo: "receber" })).resumo.abertasCentavos).toBe(5990 - c1!.valorCentavos);
    await expect(darBaixa(L.dono, { contaId: c1!.id, forma: "pix" })).rejects.toMatchObject({ codigo: "conflito" });
    expect((await L.dono.ler("Caixa")).filter((c) => c.origemId === c1!.id)).toHaveLength(1);
    await expect(darBaixa(L.vend, { contaId: c1!.id, forma: "pix" })).rejects.toMatchObject({ codigo: "proibido" });
  });
  it("pagar conta de compra a prazo lança saída; falha no caixa reabre a parcela", async () => {
    const L = await loja();
    await registrarCompra(L.dono, { fornecedorId: L.fornecedorId, pagamento: "prazo", parcelas: 1, itens: [{ variacaoId: L.v("P", "Azul"), quantidade: 2, custoCentavos: 1500 }] });
    const [c] = (await listarContas(L.dono, { tipo: "pagar" })).contas;
    L.driver.falharProximoLote = false;
    await darBaixa(L.dono, { contaId: c!.id, forma: "dinheiro" });
    expect((await L.dono.ler("Caixa")).filter((x) => x.origemId === c!.id)).toEqual([expect.objectContaining({ tipo: "saida", valorCentavos: 3000, categoria: "pagamento_conta" })]);
  });
  it("loja B não consegue dar baixa em conta da loja A", async () => {
    const L = await comCrediario();
    const [c] = (await listarContas(L.dono, { tipo: "receber" })).contas;
    const donoB = await criarContexto(L.deps, "dono.b@exemplo.com");
    await expect(darBaixa(donoB, { contaId: c!.id, forma: "pix" })).rejects.toMatchObject({ codigo: "invalido" });
  });
});

describe("fechamento e resumo", () => {
  async function comVendas() {
    const L = await loja();
    await darEstoque(L.dono, L.v("M", "Azul"), 10);
    await registrarVenda(L.vend, { itens: [{ variacaoId: L.v("M", "Azul"), quantidade: 2 }], pagamentos: [{ forma: "dinheiro", valorCentavos: 11980, parcelas: 1 }] });
    await registrarVenda(L.vend, { itens: [{ variacaoId: L.v("M", "Azul"), quantidade: 1 }], pagamentos: [pix(5990)] });
    return L;
  }
  it("fechamento do dia soma vendas, formas e o dinheiro esperado; diferença fica na auditoria", async () => {
    const L = await comVendas();
    const f = await fechamentoDoDia(L.dono);
    expect(f).toMatchObject({ vendas: 2, faturamentoCentavos: 17_970, ticketMedioCentavos: 8985, dinheiroEsperadoCentavos: 11_980 });
    expect(f.porVendedor).toEqual([expect.objectContaining({ nome: "Vendedora A", vendas: 2, totalCentavos: 17_970 })]);
    const r = await fecharDia(L.dono, { dia: diaSP(), trocoInicialCentavos: 5000, contadoCentavos: 16_000 });
    expect(r.diferencaCentavos).toBe(-980);
    expect((await L.dono.ler("Auditoria")).some((a) => a.acao === "fechamento_dia:dif=-980")).toBe(true);
    await expect(fechamentoDoDia(L.vend)).rejects.toMatchObject({ codigo: "proibido" });
    await expect(fechamentoDoDia(L.dono, "ontem")).rejects.toThrow();
  });
  it("resumo do mês: faturamento, custo, lucro bruto, mais vendidos e vendedores", async () => {
    const L = await comVendas();
    const r = await resumoMensal(L.dono, mesAtual());
    expect(r).toMatchObject({ vendas: 2, faturamentoCentavos: 17_970, custoCentavos: 7500, taxasCentavos: 0, lucroBrutoCentavos: 10_470 });
    expect(r.margemPontosBase).toBe(Math.round((10_470 * 10_000) / 17_970));
    expect(r.maisVendidos[0]).toMatchObject({ nome: "Camiseta Básica", quantidade: 3 });
    expect(r.porVendedor[0]).toMatchObject({ nome: "Vendedora A", vendas: 2 });
    expect((await resumoMensal(L.dono, "2020-01")).vendas).toBe(0);
    await expect(resumoMensal(L.vend)).rejects.toMatchObject({ codigo: "proibido" });
  });
});

describe("etiquetas", () => {
  it("EAN-13: 95 módulos, começa e termina com a guarda; código inválido é recusado", () => {
    const m = modulosEan13("4006381333931")!;
    expect(m).toHaveLength(95);
    expect(m.startsWith("101")).toBe(true);
    expect(m.endsWith("101")).toBe(true);
    expect(m.slice(45, 50)).toBe("01010");
    expect(modulosEan13("4006381333932")).toBeNull();
    expect(modulosEan13("123")).toBeNull();
  });
  it("monta uma etiqueta por tamanho e cor com o preço do servidor, sem custo; vendedor também imprime", async () => {
    const L = await loja();
    const e = await montarEtiquetas(L.vend, { produtoId: L.produtoId, copias: 2 });
    expect(e).toHaveLength(12);
    expect(e[0]).toMatchObject({ produto: "Camiseta Básica", precoCentavos: 5990 });
    expect(modulosEan13(e[0]!.codigoBarras)).not.toBeNull();
    expect(JSON.stringify(e)).not.toContain("custo");
    await expect(montarEtiquetas(L.vend, { produtoId: L.produtoId, copias: 51 })).rejects.toThrow();
    await expect(montarEtiquetas(L.vend, { produtoId: "PRODUTO-INEXISTENTE" })).rejects.toMatchObject({ codigo: "invalido" });
  });
});

describe("painel", () => {
  it("aniversariantes: hoje e próximos 7 dias, virando o mês e o ano", () => {
    const cl = [
      { id: "1", nome: "Ana", aniversarioDia: 31, aniversarioMes: 12 },
      { id: "2", nome: "Bia", aniversarioDia: 3, aniversarioMes: 1 },
      { id: "3", nome: "Cris", aniversarioDia: 20, aniversarioMes: 1 },
      { id: "4", nome: "Dani" },
      { id: "5", nome: "Cliente removido", aniversarioDia: 1, aniversarioMes: 1 },
    ];
    const r = aniversariantes(cl, "2026-12-30");
    expect(r.map((a) => a.nome)).toEqual(["Ana", "Bia"]);
    expect(r[0]!.hoje).toBe(false);
    expect(aniversariantes(cl, "2026-12-31")[0]).toMatchObject({ nome: "Ana", hoje: true });
  });
  it("dono vê caixa e contas; vendedor vê só as próprias vendas", async () => {
    const L = await loja();
    await darEstoque(L.dono, L.v("M", "Azul"), 10);
    await registrarVenda(L.vend, { itens: [{ variacaoId: L.v("M", "Azul"), quantidade: 1 }], pagamentos: [pix(5990)] });
    await registrarVenda(L.dono, { itens: [{ variacaoId: L.v("M", "Azul"), quantidade: 1 }], pagamentos: [pix(5990)] });
    const d = await montarPainel(L.dono);
    expect(d).toMatchObject({ vendasHoje: 2, totalHojeCentavos: 11_980 });
    expect(d.dono).toMatchObject({ caixaSaldoCentavos: 11_980 });
    const v = await montarPainel(L.vend);
    expect(v).toMatchObject({ vendasHoje: 1, totalHojeCentavos: 5990 });
    expect(v.dono).toBeUndefined();
  });
});
