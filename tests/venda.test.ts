import { describe, expect, it } from "vitest";
import { resumoCaixaDoDia } from "@/lib/core/caixa";
import { registrarVenda } from "@/lib/moda/venda";
import { configurar, darEstoque, prepararLoja, saldoDe } from "./helpers/loja";

const pix = (valorCentavos: number) => ({ forma: "pix" as const, valorCentavos, parcelas: 1 });

describe("venda: caminho feliz", () => {
  it("baixa o estoque, grava venda, itens, pagamento, caixa e auditoria", async () => {
    const { dono, vend, v } = await prepararLoja();
    await darEstoque(dono, v("M", "Azul"), 5);

    const r = await registrarVenda(vend, { itens: [{ variacaoId: v("M", "Azul"), quantidade: 2 }], pagamentos: [pix(11980)] });
    expect(r).toMatchObject({ subtotalCentavos: 11980, descontoCentavos: 0, totalCentavos: 11980, taxasCentavos: 0 });

    expect(await saldoDe(dono, v("M", "Azul"))).toBe(3);
    const [venda] = await dono.ler("Vendas");
    expect(venda).toMatchObject({ id: r.vendaId, status: "concluida", totalCentavos: 11980, vendedorId: "U-A-VEND" });
    const [item] = await dono.ler("VendaItens");
    expect(item).toMatchObject({ nomeNoMomento: "Camiseta Básica", tamanho: "M", cor: "Azul", quantidade: 2, precoCentavos: 5990, custoCentavos: 2500 });
    const caixa = (await dono.ler("Caixa")).filter((c) => c.origemId === r.vendaId);
    expect(caixa).toHaveLength(1);
    expect(caixa[0]).toMatchObject({ tipo: "entrada", forma: "pix", valorCentavos: 11980 });
    const acoes = (await dono.ler("Auditoria")).map((a) => a.acao);
    expect(acoes).toContain("venda_concluida");
  });

  it("o preço vem do servidor: campo de preço no pedido é recusado", async () => {
    const { dono, vend, v } = await prepararLoja();
    await darEstoque(dono, v("M", "Azul"), 1);
    await expect(
      registrarVenda(vend, { itens: [{ variacaoId: v("M", "Azul"), quantidade: 1, precoCentavos: 1 }], pagamentos: [pix(1)] }),
    ).rejects.toThrow();
  });

  it("o mesmo item repetido vira um único movimento", async () => {
    const { dono, vend, v } = await prepararLoja();
    await darEstoque(dono, v("P", "Preto"), 5);
    await registrarVenda(vend, {
      itens: [{ variacaoId: v("P", "Preto"), quantidade: 1 }, { variacaoId: v("P", "Preto"), quantidade: 1 }],
      pagamentos: [pix(11980)],
    });
    const vendas = (await dono.sistema.lerFresco("Movimentos")).filter((m) => m.tipo === "venda");
    expect(vendas).toHaveLength(1);
    expect(vendas[0]!.quantidade).toBe(-2);
  });

  it("peça sem saldo é recusada e nada é gravado", async () => {
    const { dono, vend, v, driver } = await prepararLoja();
    const antes = driver.chamadas.filter((c) => c.tipo === "append" || c.tipo === "appendMultiplo").length;
    await expect(
      registrarVenda(vend, { itens: [{ variacaoId: v("G", "Azul"), quantidade: 1 }], pagamentos: [pix(5990)] }),
    ).rejects.toMatchObject({ codigo: "conflito", message: expect.stringMatching(/acabou/) });
    expect(driver.chamadas.filter((c) => c.tipo === "append" || c.tipo === "appendMultiplo").length).toBe(antes);
    expect(await dono.ler("Vendas")).toHaveLength(0);
  });

  it("com 'estoque negativo' liberado na configuração, vende mesmo sem saldo", async () => {
    const { dono, vend, v } = await prepararLoja();
    await configurar(dono, { estoqueNegativo: true });
    await registrarVenda(vend, { itens: [{ variacaoId: v("G", "Preto"), quantidade: 1 }], pagamentos: [pix(5990)] });
    expect(await saldoDe(dono, v("G", "Preto"))).toBe(-1);
  });

  it("peça inexistente e cliente inexistente são recusados", async () => {
    const { dono, vend, v } = await prepararLoja();
    await darEstoque(dono, v("M", "Azul"), 1);
    await expect(registrarVenda(vend, { itens: [{ variacaoId: "nao-existe", quantidade: 1 }], pagamentos: [pix(100)] })).rejects.toMatchObject({ codigo: "invalido" });
    await expect(
      registrarVenda(vend, { clienteId: "fantasma", itens: [{ variacaoId: v("M", "Azul"), quantidade: 1 }], pagamentos: [pix(5990)] }),
    ).rejects.toMatchObject({ codigo: "invalido" });
  });
});

describe("venda: última peça e vendas simultâneas", () => {
  it("duas vendas ao mesmo tempo da última M azul: só uma passa (mesma instância, com trava)", async () => {
    const { dono, vend, v } = await prepararLoja();
    await darEstoque(dono, v("M", "Azul"), 1);
    const pedido = { itens: [{ variacaoId: v("M", "Azul"), quantidade: 1 }], pagamentos: [pix(5990)] };

    const r = await Promise.allSettled([registrarVenda(vend, pedido), registrarVenda(dono, pedido)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(r.filter((x) => x.status === "rejected")).toHaveLength(1);
    expect(await saldoDe(dono, v("M", "Azul"))).toBe(0);
    expect(await dono.ler("Vendas")).toHaveLength(1);
  });

  it("sem a trava (como várias instâncias na Vercel): a conferência do livro ainda segura, e a reserva é desfeita", async () => {
    const { dono, vend, v } = await prepararLoja();
    await darEstoque(dono, v("M", "Azul"), 1);
    const pedido = { itens: [{ variacaoId: v("M", "Azul"), quantidade: 1 }], pagamentos: [pix(5990)] };

    const r = await Promise.allSettled([
      registrarVenda(vend, pedido, { trava: false }),
      registrarVenda(dono, pedido, { trava: false }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const falha = r.find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect(falha.reason).toMatchObject({ codigo: "conflito" });

    expect(await saldoDe(dono, v("M", "Azul"))).toBe(0); // nunca negativo
    expect(await dono.ler("Vendas")).toHaveLength(1);
    const movs = await dono.sistema.lerFresco("Movimentos");
    expect(movs.some((m) => m.tipo === "estorno" && m.quantidade === 1)).toBe(true);
    expect((await dono.ler("Auditoria")).map((a) => a.acao)).toContain("venda_recusada_estoque");
  });

  it("três vendas simultâneas para 2 peças: exatamente 2 passam e o saldo nunca fica negativo", async () => {
    const { dono, vend, v } = await prepararLoja();
    await darEstoque(dono, v("P", "Azul"), 2);
    const pedido = { itens: [{ variacaoId: v("P", "Azul"), quantidade: 1 }], pagamentos: [pix(5990)] };
    const r = await Promise.allSettled([
      registrarVenda(vend, pedido, { trava: false }),
      registrarVenda(dono, pedido, { trava: false }),
      registrarVenda(vend, pedido, { trava: false }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(2);
    expect(await saldoDe(dono, v("P", "Azul"))).toBe(0);
    expect(await dono.ler("Vendas")).toHaveLength(2);
  });

  it("se o lote final falha, a reserva é desfeita e nada fica pela metade", async () => {
    const { dono, vend, v, driver } = await prepararLoja();
    await darEstoque(dono, v("M", "Azul"), 3);
    driver.falharProximoLote = true;
    await expect(
      registrarVenda(vend, { itens: [{ variacaoId: v("M", "Azul"), quantidade: 2 }], pagamentos: [pix(11980)] }),
    ).rejects.toThrow();
    expect(await saldoDe(dono, v("M", "Azul"))).toBe(3);
    expect(await dono.ler("Vendas")).toHaveLength(0);
    expect(await dono.ler("VendaItens")).toHaveLength(0);
    expect((await dono.ler("Caixa")).filter((c) => c.origemId)).toHaveLength(0); // só a linha de exemplo da loja, sem origem
    // e a mesma venda funciona na segunda tentativa
    await registrarVenda(vend, { itens: [{ variacaoId: v("M", "Azul"), quantidade: 2 }], pagamentos: [pix(11980)] });
    expect(await saldoDe(dono, v("M", "Azul"))).toBe(1);
  });
});

describe("venda: pagamento dividido e taxa da maquininha", () => {
  it("Pix + cartão em 2x soma o total e grava a taxa certa (como despesa no caixa)", async () => {
    const { dono, vend, v } = await prepararLoja();
    await darEstoque(dono, v("M", "Azul"), 5);
    const taxas = Array<number>(12).fill(0);
    taxas[1] = 450; // crédito 2x = 4,50%
    await configurar(dono, { taxaCreditoPb: taxas });

    const r = await registrarVenda(vend, {
      itens: [{ variacaoId: v("M", "Azul"), quantidade: 2 }],
      pagamentos: [pix(5000), { forma: "credito", valorCentavos: 6980, parcelas: 2 }],
    });
    expect(r.totalCentavos).toBe(11980);
    expect(r.taxasCentavos).toBe(314); // 6980 × 4,5% = 314,1 -> 314

    const pg = (await dono.sistema.lerFresco("Pagamentos")).filter((p) => p.vendaId === r.vendaId);
    expect(pg.reduce((s, p) => s + p.valorCentavos, 0)).toBe(11980);
    expect(pg.find((p) => p.forma === "credito")).toMatchObject({ parcelas: 2, taxaCentavos: 314 });
    expect(pg.find((p) => p.forma === "pix")).toMatchObject({ taxaCentavos: 0 });

    const caixa = (await dono.ler("Caixa")).filter((c) => c.origemId === r.vendaId);
    expect(caixa.filter((c) => c.tipo === "entrada").reduce((s, c) => s + c.valorCentavos, 0)).toBe(11980);
    expect(caixa.filter((c) => c.tipo === "saida")).toEqual([expect.objectContaining({ categoria: "taxa_maquininha", valorCentavos: 314 })]);
  });

  it("pagamentos que não somam o total são recusados e nada é gravado", async () => {
    const { dono, vend, v, driver } = await prepararLoja();
    await darEstoque(dono, v("M", "Azul"), 1);
    const antes = driver.chamadas.length;
    await expect(
      registrarVenda(vend, { itens: [{ variacaoId: v("M", "Azul"), quantidade: 1 }], pagamentos: [pix(5000)] }),
    ).rejects.toMatchObject({ codigo: "invalido", message: expect.stringMatching(/somam/) });
    expect(driver.chamadas.slice(antes).some((c) => c.tipo === "append" || c.tipo === "appendMultiplo")).toBe(false);
  });

  it("só o crédito e o crediário parcelam; crediário e vale-troca exigem cliente", async () => {
    const { dono, vend, v } = await prepararLoja();
    await darEstoque(dono, v("M", "Azul"), 2);
    const item = [{ variacaoId: v("M", "Azul"), quantidade: 1 }];
    await expect(registrarVenda(vend, { itens: item, pagamentos: [{ forma: "debito", valorCentavos: 5990, parcelas: 3 }] })).rejects.toMatchObject({ codigo: "invalido" });
    await expect(registrarVenda(vend, { itens: item, pagamentos: [{ forma: "crediario", valorCentavos: 5990, parcelas: 1 }] })).rejects.toMatchObject({ message: expect.stringMatching(/precisa de um cliente/) });
    await expect(registrarVenda(vend, { itens: item, pagamentos: [{ forma: "credito_loja", valorCentavos: 5990, parcelas: 1 }] })).rejects.toMatchObject({ codigo: "invalido" });
  });
});

describe("venda: desconto e perfis", () => {
  it("desconto em % é aplicado sobre o subtotal e arredondado ao centavo", async () => {
    const { dono, vend, v } = await prepararLoja();
    await darEstoque(dono, v("M", "Azul"), 1);
    await configurar(dono, { descontoMaxVendedorPb: 1000 });
    const r = await registrarVenda(vend, {
      itens: [{ variacaoId: v("M", "Azul"), quantidade: 1 }],
      desconto: { tipo: "percentual", pontosBase: 1000 },
      pagamentos: [pix(5391)],
    });
    expect(r).toMatchObject({ subtotalCentavos: 5990, descontoCentavos: 599, totalCentavos: 5391 });
  });

  it("vendedor acima do limite é barrado e isso fica registrado; no limite passa", async () => {
    const { dono, vend, v } = await prepararLoja();
    await darEstoque(dono, v("M", "Azul"), 3);
    await configurar(dono, { descontoMaxVendedorPb: 1000 });
    const item = [{ variacaoId: v("M", "Azul"), quantidade: 1 }];

    await expect(
      registrarVenda(vend, { itens: item, desconto: { tipo: "valor", centavos: 600 }, pagamentos: [pix(5390)] }),
    ).rejects.toMatchObject({ codigo: "proibido" }); // 600/5990 = 10,017% > 10%
    expect((await dono.ler("Auditoria")).map((a) => a.acao)).toContain("desconto_recusado");
    expect(await dono.ler("Vendas")).toHaveLength(0);

    await registrarVenda(vend, { itens: item, desconto: { tipo: "valor", centavos: 599 }, pagamentos: [pix(5391)] }); // 9,998%
    expect(await dono.ler("Vendas")).toHaveLength(1);
  });

  it("sem limite configurado o vendedor não dá desconto nenhum", async () => {
    const { dono, vend, v } = await prepararLoja();
    await darEstoque(dono, v("M", "Azul"), 1);
    await expect(
      registrarVenda(vend, { itens: [{ variacaoId: v("M", "Azul"), quantidade: 1 }], desconto: { tipo: "valor", centavos: 1 }, pagamentos: [pix(5989)] }),
    ).rejects.toMatchObject({ codigo: "proibido" });
  });

  it("o dono pode passar do limite, e fica registrado", async () => {
    const { dono, v } = await prepararLoja();
    await darEstoque(dono, v("M", "Azul"), 1);
    await configurar(dono, { descontoMaxVendedorPb: 1000 });
    await registrarVenda(dono, {
      itens: [{ variacaoId: v("M", "Azul"), quantidade: 1 }],
      desconto: { tipo: "percentual", pontosBase: 3000 },
      pagamentos: [pix(4193)],
    });
    expect((await dono.ler("Auditoria")).map((a) => a.acao)).toContain("desconto_acima_do_limite");
  });

  it("desconto igual ou maior que o total é recusado", async () => {
    const { dono, v } = await prepararLoja();
    await darEstoque(dono, v("M", "Azul"), 1);
    await expect(
      registrarVenda(dono, { itens: [{ variacaoId: v("M", "Azul"), quantidade: 1 }], desconto: { tipo: "valor", centavos: 5990 }, pagamentos: [pix(1)] }),
    ).rejects.toMatchObject({ codigo: "invalido" });
  });
});

describe("caixa do dia", () => {
  it("o dono vê entradas por forma, taxas como saída e o saldo; o vendedor não vê", async () => {
    const { dono, vend, v } = await prepararLoja();
    await darEstoque(dono, v("M", "Azul"), 5);
    const taxas = Array<number>(12).fill(0);
    taxas[0] = 350;
    await configurar(dono, { taxaCreditoPb: taxas });
    await registrarVenda(vend, { itens: [{ variacaoId: v("M", "Azul"), quantidade: 1 }], pagamentos: [{ forma: "credito", valorCentavos: 5990, parcelas: 1 }] });
    await registrarVenda(vend, { itens: [{ variacaoId: v("M", "Azul"), quantidade: 1 }], pagamentos: [{ forma: "dinheiro", valorCentavos: 5990, parcelas: 1 }] });

    const r = await resumoCaixaDoDia(dono);
    expect(r.vendas).toBe(2);
    expect(r.entradasPorForma).toEqual({ credito: 5990, dinheiro: 5990 });
    expect(r.saidasPorForma).toEqual({ credito: 210 }); // 5990 × 3,5% = 209,65 -> 210
    expect(r.saldoCentavos).toBe(11980 - 210);
    await expect(resumoCaixaDoDia(vend)).rejects.toMatchObject({ codigo: "proibido" });
  });
});
