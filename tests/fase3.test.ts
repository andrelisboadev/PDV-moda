import { describe, expect, it } from "vitest";
import { resumoCaixaDoDia } from "@/lib/core/caixa";
import { diasEntre, somarDias, somarMeses } from "@/lib/core/tempo";
import { linkWhatsapp, telefoneParaWhatsapp } from "@/lib/core/whatsapp";
import { buscarClientes, criarCliente, definirLimiteCrediario, saldoCliente } from "@/lib/moda/clientes";
import { calcularComissoes } from "@/lib/moda/comissao";
import { listarCondicionais, registrarSaidaCondicional, resolverCondicional } from "@/lib/moda/condicional";
import { registrarTroca, valorLiquidoPorLinha, vendaParaTroca } from "@/lib/moda/troca";
import { registrarVenda } from "@/lib/moda/venda";
import { diaSP } from "@/lib/core/tempo";
import { configurar, darEstoque, prepararLoja, saldoDe } from "./helpers/loja";

const pix = (valorCentavos: number) => ({ forma: "pix" as const, valorCentavos, parcelas: 1 });

/** Loja A com estoque 10 em três peças e a cliente Maria (limite de crediário R$ 1.000). */
async function loja() {
  const L = await prepararLoja();
  for (const [t, c] of [["M", "Azul"], ["G", "Azul"], ["P", "Preto"]] as const) await darEstoque(L.dono, L.v(t, c), 10);
  const { clienteId } = await criarCliente(L.vend, { nome: "Maria da Silva", telefone: "(91) 98888-7777", consentimento: true });
  await definirLimiteCrediario(L.dono, clienteId, 100_000);
  return { ...L, clienteId };
}
const saldos = async (L: Awaited<ReturnType<typeof loja>>) => ({
  MAzul: await saldoDe(L.dono, L.v("M", "Azul")),
  GAzul: await saldoDe(L.dono, L.v("G", "Azul")),
  PPreto: await saldoDe(L.dono, L.v("P", "Preto")),
});

describe("datas e WhatsApp", () => {
  it("somarMeses não escorrega o dia 31 e somarDias vira o mês", () => {
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2026-01-31", 2)).toBe("2026-03-31");
    expect(somarMeses("2028-01-31", 1)).toBe("2028-02-29");
    expect(somarMeses("2026-11-15", 3)).toBe("2027-02-15");
    expect(somarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(diasEntre("2026-10-01", "2026-10-15")).toBe(14);
  });
  it("telefone vira link wa.me com DDI 55 e mensagem codificada", () => {
    expect(telefoneParaWhatsapp("(91) 98888-7777")).toBe("5591988887777");
    expect(telefoneParaWhatsapp("5591988887777")).toBe("5591988887777");
    expect(telefoneParaWhatsapp("1234")).toBeNull();
    expect(linkWhatsapp("(91) 98888-7777", "Oi & tchau")).toBe("https://wa.me/5591988887777?text=Oi%20%26%20tchau");
    expect(linkWhatsapp(undefined, "x")).toBeNull();
  });
});

describe("clientes", () => {
  it("vendedor cadastra, mas não define limite de crediário; sem consentimento não cadastra", async () => {
    const { vend, dono } = await prepararLoja();
    await expect(criarCliente(vend, { nome: "Ana", consentimento: true, limiteCrediarioCentavos: 50_000 })).rejects.toMatchObject({ codigo: "proibido" });
    await expect(criarCliente(vend, { nome: "Ana", consentimento: false })).rejects.toThrow();
    const { clienteId } = await criarCliente(vend, { nome: "Ana Paula", telefone: "91 99999-0000", consentimento: true });
    await expect(definirLimiteCrediario(vend, clienteId, 1)).rejects.toMatchObject({ codigo: "proibido" });
    await definirLimiteCrediario(dono, clienteId, 20_000);
    expect((await saldoCliente(vend, clienteId, { fresco: true })).limiteCrediarioCentavos).toBe(20_000);
    expect((await buscarClientes(vend, "ana"))[0]?.nome).toBe("Ana Paula");
    expect((await buscarClientes(vend, "99999"))).toHaveLength(1);
    expect((await dono.ler("Auditoria")).map((a) => a.acao)).toEqual(expect.arrayContaining(["criar_cliente", "limite_crediario"]));
  });
});

describe("crediário", () => {
  it("3 parcelas somam exatamente o valor, vencem mês a mês e não entram no caixa", async () => {
    const L = await loja();
    const r = await registrarVenda(L.vend, {
      clienteId: L.clienteId,
      itens: [{ variacaoId: L.v("M", "Azul"), quantidade: 1 }],
      pagamentos: [{ forma: "crediario", valorCentavos: 5990, parcelas: 3 }],
    });
    const parcelas = (await L.dono.ler("Contas")).filter((c) => c.refId === r.vendaId).sort((a, b) => a.parcela - b.parcela);
    expect(parcelas.map((p) => p.valorCentavos)).toEqual([1996, 1996, 1998]);
    expect(parcelas.reduce((s, p) => s + p.valorCentavos, 0)).toBe(5990);
    expect(parcelas.every((p) => p.tipo === "receber" && p.status === "aberta" && p.totalParcelas === 3 && p.parceiroId === L.clienteId)).toBe(true);
    const primeiro = somarDias(diaSP(), 30);
    expect(parcelas.map((p) => p.vencimento)).toEqual([primeiro, somarMeses(primeiro, 1), somarMeses(primeiro, 2)]);
    expect((await L.dono.ler("Caixa")).filter((c) => c.origemId === r.vendaId)).toHaveLength(0);
    expect((await saldoCliente(L.vend, L.clienteId, { fresco: true })).crediarioAbertoCentavos).toBe(5990);
    expect(await saldoDe(L.dono, L.v("M", "Azul"))).toBe(9);
  });

  it("limite do cliente: vendedor é barrado (e fica registrado), dono passa com registro; vendedor não lê Contas", async () => {
    const L = await loja();
    const venda = (valor: number) => ({
      clienteId: L.clienteId,
      itens: [{ variacaoId: L.v("G", "Azul"), quantidade: 1 }],
      pagamentos: [{ forma: "crediario" as const, valorCentavos: valor, parcelas: 2 }],
    });
    await definirLimiteCrediario(L.dono, L.clienteId, 5000); // menos que o preço (5990)
    await expect(registrarVenda(L.vend, venda(5990))).rejects.toMatchObject({ codigo: "proibido", message: expect.stringMatching(/limite/) });
    expect(await saldoDe(L.dono, L.v("G", "Azul"))).toBe(10); // nada foi baixado
    await registrarVenda(L.dono, venda(5990));
    const acoes = (await L.dono.ler("Auditoria")).map((a) => a.acao);
    expect(acoes).toEqual(expect.arrayContaining(["crediario_recusado", "crediario_acima_do_limite"]));
    await expect(L.vend.ler("Contas")).rejects.toMatchObject({ codigo: "proibido" });
  });

  it("crediário e vale-troca exigem cliente; só um de cada; parcelas respeitam o máximo da loja", async () => {
    const L = await loja();
    const item = [{ variacaoId: L.v("M", "Azul"), quantidade: 1 }];
    await expect(registrarVenda(L.vend, { itens: item, pagamentos: [{ forma: "crediario", valorCentavos: 5990, parcelas: 2 }] })).rejects.toMatchObject({ codigo: "invalido" });
    await expect(registrarVenda(L.vend, { clienteId: L.clienteId, itens: item, pagamentos: [{ forma: "crediario", valorCentavos: 5990, parcelas: 7 }] })).rejects.toMatchObject({ message: expect.stringMatching(/até 6x/) });
    await expect(
      registrarVenda(L.vend, { clienteId: L.clienteId, itens: item, pagamentos: [{ forma: "crediario", valorCentavos: 3000, parcelas: 2 }, { forma: "crediario", valorCentavos: 2990, parcelas: 2 }] }),
    ).rejects.toMatchObject({ codigo: "invalido" });
    expect(await saldoDe(L.dono, L.v("M", "Azul"))).toBe(10);
  });
});

describe("condicional", () => {
  it("saída baixa o estoque; devolver repõe; comprar vira venda SEM baixar de novo", async () => {
    const L = await loja();
    const { condicionalId, devolverAte } = await registrarSaidaCondicional(L.vend, {
      clienteId: L.clienteId,
      itens: [{ variacaoId: L.v("M", "Azul"), quantidade: 1 }, { variacaoId: L.v("G", "Azul"), quantidade: 1 }],
    });
    expect(devolverAte).toBe(somarDias(diaSP(), 3));
    expect(await saldos(L)).toMatchObject({ MAzul: 9, GAzul: 9 });

    let [c] = await listarCondicionais(L.vend);
    expect(c).toMatchObject({ id: condicionalId, status: "aberto", clienteNome: "Maria da Silva" });
    const itemM = c!.itens.find((i) => i.variacaoId === L.v("M", "Azul"))!;
    const itemG = c!.itens.find((i) => i.variacaoId === L.v("G", "Azul"))!;

    const r = await resolverCondicional(L.vend, {
      condicionalId,
      resolucoes: [{ itemId: itemM.id, resultado: "devolveu" }, { itemId: itemG.id, resultado: "comprou" }],
      pagamentos: [pix(5990)],
    });
    expect(r).toMatchObject({ devolvidas: 1, compradas: 1, encerrado: true });
    // M voltou (10); G continua em 9 (a saída do condicional JÁ baixou; a venda não baixa outra vez)
    expect(await saldos(L)).toMatchObject({ MAzul: 10, GAzul: 9 });
    const itensVenda = (await L.dono.ler("VendaItens")).filter((i) => i.vendaId === r.vendaId);
    expect(itensVenda).toHaveLength(1);
    expect(itensVenda[0]).toMatchObject({ quantidade: 1, precoCentavos: 5990 });
    expect((await L.dono.ler("Vendas")).find((v) => v.id === r.vendaId)).toMatchObject({ clienteId: L.clienteId, totalCentavos: 5990 });
    const movs = (await L.dono.sistema.lerFresco("Movimentos")).filter((m) => m.tipo === "venda");
    expect(movs).toHaveLength(0); // nenhuma baixa "venda": só a do condicional
    expect((await resumoCaixaDoDia(L.dono)).totalEntradasCentavos).toBe(5990);
    [c] = await listarCondicionais(L.vend);
    expect(c!.status).toBe("finalizado");
  });

  it("não resolve a mesma peça duas vezes (nem em disputa) e falha de pagamento não marca nada", async () => {
    const L = await loja();
    const { condicionalId } = await registrarSaidaCondicional(L.vend, { clienteId: L.clienteId, itens: [{ variacaoId: L.v("M", "Azul"), quantidade: 1 }] });
    const [c] = await listarCondicionais(L.vend);
    const item = c!.itens[0]!;

    // pagamento que não fecha: nada muda
    await expect(resolverCondicional(L.vend, { condicionalId, resolucoes: [{ itemId: item.id, resultado: "comprou" }], pagamentos: [pix(100)] })).rejects.toMatchObject({ codigo: "invalido" });
    expect((await listarCondicionais(L.vend))[0]!.itens[0]!.resultado).toBe("pendente");

    const r = await Promise.allSettled([
      resolverCondicional(L.vend, { condicionalId, resolucoes: [{ itemId: item.id, resultado: "devolveu" }] }),
      resolverCondicional(L.dono, { condicionalId, resolucoes: [{ itemId: item.id, resultado: "devolveu" }] }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await saldoDe(L.dono, L.v("M", "Azul"))).toBe(10); // repôs uma vez só
    await expect(resolverCondicional(L.vend, { condicionalId, resolucoes: [{ itemId: item.id, resultado: "devolveu" }] })).rejects.toMatchObject({ codigo: "conflito" });
  });

  it("peça em condicional não está disponível para venda; sem saldo, a saída é recusada", async () => {
    const L = await loja();
    await registrarSaidaCondicional(L.vend, { clienteId: L.clienteId, itens: [{ variacaoId: L.v("P", "Preto"), quantidade: 10 }] });
    await expect(registrarVenda(L.vend, { itens: [{ variacaoId: L.v("P", "Preto"), quantidade: 1 }], pagamentos: [pix(5990)] })).rejects.toMatchObject({ codigo: "conflito" });
    await expect(registrarSaidaCondicional(L.vend, { clienteId: L.clienteId, itens: [{ variacaoId: L.v("P", "Preto"), quantidade: 1 }] })).rejects.toMatchObject({ codigo: "conflito" });
  });

  it("vencido é calculado pela data; compra pelo condicional respeita limite de crediário", async () => {
    const L = await loja();
    const { condicionalId } = await registrarSaidaCondicional(L.vend, { clienteId: L.clienteId, itens: [{ variacaoId: L.v("M", "Azul"), quantidade: 1 }] });
    await L.dono.sistema.atualizar("Condicionais", condicionalId, () => ({ devolverAte: "2020-01-01" }));
    const [c] = await listarCondicionais(L.vend);
    expect(c!.status).toBe("vencido");

    await definirLimiteCrediario(L.dono, L.clienteId, 0);
    await expect(
      resolverCondicional(L.vend, { condicionalId, resolucoes: [{ itemId: c!.itens[0]!.id, resultado: "comprou" }], pagamentos: [{ forma: "crediario", valorCentavos: 5990, parcelas: 2 }] }),
    ).rejects.toMatchObject({ codigo: "proibido" });
    expect((await listarCondicionais(L.vend))[0]!.itens[0]!.resultado).toBe("pendente");
  });
});

describe("troca, devolução e vale-troca", () => {
  /** Vende 2 camisetas M azul com 10% de desconto (dono): total líquido R$ 107,82. */
  async function vendaComDesconto(L: Awaited<ReturnType<typeof loja>>) {
    return registrarVenda(L.dono, {
      clienteId: L.clienteId,
      itens: [{ variacaoId: L.v("M", "Azul"), quantidade: 2 }],
      desconto: { tipo: "percentual", pontosBase: 1000 },
      pagamentos: [pix(10782)],
    });
  }

  it("o valor devolvido é o LÍQUIDO (com o desconto) e a soma das devoluções fecha o total exato", () => {
    expect(valorLiquidoPorLinha([{ precoCentavos: 5990, quantidade: 2 }, { precoCentavos: 3333, quantidade: 1 }], 13000).reduce((a, b) => a + b, 0)).toBe(13000);
  });

  it("troca com diferença de preço: paga a diferença; estoque e caixa batem", async () => {
    const L = await loja();
    const venda = await vendaComDesconto(L);
    expect(venda.totalCentavos).toBe(10782);

    const r = await registrarTroca(L.vend, {
      vendaId: venda.vendaId,
      devolvidos: [{ variacaoId: L.v("M", "Azul"), quantidade: 1 }],
      novos: [{ variacaoId: L.v("G", "Azul"), quantidade: 1 }],
      motivo: "Ficou pequena",
      pagamentos: [pix(599)],
    });
    expect(r).toMatchObject({ tipo: "troca", devolvidoCentavos: 5391, levadoCentavos: 5990, diferencaCentavos: 599, valeCentavos: 0 });
    expect(await saldos(L)).toMatchObject({ MAzul: 9, GAzul: 9 }); // M: 10-2+1; G: 10-1
    const caixa = (await L.dono.ler("Caixa")).filter((c) => c.origemId === r.trocaId);
    expect(caixa).toEqual([expect.objectContaining({ tipo: "entrada", forma: "pix", valorCentavos: 599, categoria: "troca_diferenca" })]);
    expect((await L.dono.ler("Trocas"))[0]).toMatchObject({ vendaId: venda.vendaId, destino: "nenhum", valorCentavos: 5391, novoTotalCentavos: 5990 });
    // pagamento errado é recusado e nada muda
    const antes = await saldos(L);
    await expect(
      registrarTroca(L.vend, { vendaId: venda.vendaId, devolvidos: [{ variacaoId: L.v("M", "Azul"), quantidade: 1 }], novos: [{ variacaoId: L.v("G", "Azul"), quantidade: 1 }], motivo: "x1", pagamentos: [pix(1)] }),
    ).rejects.toMatchObject({ codigo: "invalido" });
    expect(await saldos(L)).toEqual(antes);
  });

  it("não devolve mais peças do que vendeu; a 2ª devolução recebe o resto exato", async () => {
    const L = await loja();
    const venda = await vendaComDesconto(L);
    const devolver = (q: number) => ({ vendaId: venda.vendaId, devolvidos: [{ variacaoId: L.v("M", "Azul"), quantidade: q }], motivo: "Não gostou", destino: "vale" as const });
    await expect(registrarTroca(L.vend, devolver(3))).rejects.toMatchObject({ codigo: "invalido" });
    const a = await registrarTroca(L.vend, devolver(1));
    const b = await registrarTroca(L.vend, devolver(1));
    expect(a.valeCentavos + b.valeCentavos).toBe(10782);
    await expect(registrarTroca(L.vend, devolver(1))).rejects.toMatchObject({ codigo: "invalido" });
    expect(await saldoDe(L.dono, L.v("M", "Azul"))).toBe(10);
    const tela = await vendaParaTroca(L.vend, venda.vendaId.slice(-6));
    expect(tela?.itens[0]).toMatchObject({ vendida: 2, devolvida: 2 });
  });

  it("vale-troca: emitido na devolução, usado numa venda, sem sobrar nem faltar", async () => {
    const L = await loja();
    const venda = await vendaComDesconto(L);
    const t = await registrarTroca(L.vend, { vendaId: venda.vendaId, devolvidos: [{ variacaoId: L.v("M", "Azul"), quantidade: 1 }], motivo: "Não serviu", destino: "vale" });
    expect(t).toMatchObject({ tipo: "credito", valeCentavos: 5391, dinheiroCentavos: 0 });
    expect((await saldoCliente(L.vend, L.clienteId, { fresco: true })).creditoCentavos).toBe(5391);
    expect((await L.dono.ler("Caixa")).filter((c) => c.origemId === t.trocaId)).toHaveLength(0); // vale não mexe no caixa

    const nova = await registrarVenda(L.vend, {
      clienteId: L.clienteId,
      itens: [{ variacaoId: L.v("P", "Preto"), quantidade: 1 }],
      pagamentos: [{ forma: "credito_loja", valorCentavos: 5391, parcelas: 1 }, pix(599)],
    });
    expect((await saldoCliente(L.vend, L.clienteId, { fresco: true })).creditoCentavos).toBe(0);
    const caixa = (await L.dono.ler("Caixa")).filter((c) => c.origemId === nova.vendaId);
    expect(caixa).toEqual([expect.objectContaining({ forma: "pix", valorCentavos: 599 })]); // só o Pix entrou
    await expect(
      registrarVenda(L.vend, { clienteId: L.clienteId, itens: [{ variacaoId: L.v("P", "Preto"), quantidade: 1 }], pagamentos: [{ forma: "credito_loja", valorCentavos: 5990, parcelas: 1 }] }),
    ).rejects.toMatchObject({ codigo: "conflito" });
    expect(await saldoDe(L.dono, L.v("P", "Preto"))).toBe(9); // a venda recusada não baixou nada
  });

  it("vale-troca não é gasto em dobro, nem com duas instâncias ao mesmo tempo", async () => {
    const L = await loja();
    const venda = await vendaComDesconto(L);
    await registrarTroca(L.vend, { vendaId: venda.vendaId, devolvidos: [{ variacaoId: L.v("M", "Azul"), quantidade: 1 }], motivo: "Não serviu", destino: "vale" });
    const pedido = (variacaoId: string) => ({
      clienteId: L.clienteId,
      itens: [{ variacaoId, quantidade: 1 }],
      pagamentos: [{ forma: "credito_loja" as const, valorCentavos: 5391, parcelas: 1 }, pix(599)],
    });
    const r = await Promise.allSettled([
      registrarVenda(L.vend, pedido(L.v("P", "Preto")), { trava: false }),
      registrarVenda(L.dono, pedido(L.v("G", "Azul")), { trava: false }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason as { codigo: string }).codigo).toBe("conflito");
    expect((await saldoCliente(L.dono, L.clienteId, { fresco: true })).creditoCentavos).toBe(0); // nunca negativo
    // a venda que perdeu devolveu a peça reservada
    const s = await saldos(L);
    expect([s.PPreto, s.GAzul].sort((a, b) => a - b)).toEqual([9, 10]);
  });

  it("devolução em dinheiro: só o dono, só até o que entrou em dinheiro de verdade", async () => {
    const L = await loja();
    const venda = await vendaComDesconto(L);
    const dev = { vendaId: venda.vendaId, devolvidos: [{ variacaoId: L.v("M", "Azul"), quantidade: 1 }], motivo: "Defeito", destino: "dinheiro" as const };
    await expect(registrarTroca(L.vend, dev)).rejects.toMatchObject({ codigo: "proibido" });
    const r = await registrarTroca(L.dono, dev);
    expect(r).toMatchObject({ tipo: "devolucao", dinheiroCentavos: 5391 });
    const caixa = (await L.dono.ler("Caixa")).filter((c) => c.origemId === r.trocaId);
    expect(caixa).toEqual([expect.objectContaining({ tipo: "saida", forma: "dinheiro", valorCentavos: 5391, categoria: "devolucao" })]);
    expect((await L.dono.ler("Auditoria")).map((a) => a.acao)).toContain("devolucao_em_dinheiro");

    // venda no crediário: não existe dinheiro para devolver
    const cred = await registrarVenda(L.dono, { clienteId: L.clienteId, itens: [{ variacaoId: L.v("G", "Azul"), quantidade: 1 }], pagamentos: [{ forma: "crediario", valorCentavos: 5990, parcelas: 2 }] });
    await expect(registrarTroca(L.dono, { vendaId: cred.vendaId, devolvidos: [{ variacaoId: L.v("G", "Azul"), quantidade: 1 }], motivo: "Defeito", destino: "dinheiro" })).rejects.toMatchObject({ message: expect.stringMatching(/vale-troca/) });
    // sem cliente na venda, vale-troca pede o cliente
    const avulsa = await registrarVenda(L.vend, { itens: [{ variacaoId: L.v("P", "Preto"), quantidade: 1 }], pagamentos: [pix(5990)] });
    await expect(registrarTroca(L.vend, { vendaId: avulsa.vendaId, devolvidos: [{ variacaoId: L.v("P", "Preto"), quantidade: 1 }], motivo: "Não serviu", destino: "vale" })).rejects.toMatchObject({ message: expect.stringMatching(/cliente/) });
    const ok = await registrarTroca(L.vend, { vendaId: avulsa.vendaId, clienteId: L.clienteId, devolvidos: [{ variacaoId: L.v("P", "Preto"), quantidade: 1 }], motivo: "Não serviu", destino: "vale" });
    expect(ok.valeCentavos).toBe(5990);
  });

  it("prazo de troca: vendedor barrado fora do prazo, dono passa com registro", async () => {
    const L = await loja();
    await configurar(L.dono, { trocaPrazoDias: 7 });
    const venda = await vendaComDesconto(L);
    await L.dono.sistema.atualizar("Vendas", venda.vendaId, () => ({ data: "2020-01-01T10:00:00-03:00" }));
    const dev = { vendaId: venda.vendaId, devolvidos: [{ variacaoId: L.v("M", "Azul"), quantidade: 1 }], motivo: "Não serviu", destino: "vale" as const };
    await expect(registrarTroca(L.vend, dev)).rejects.toMatchObject({ codigo: "proibido", message: expect.stringMatching(/prazo/) });
    await registrarTroca(L.dono, dev);
    expect((await L.dono.ler("Auditoria")).map((a) => a.acao)).toEqual(expect.arrayContaining(["troca_recusada_prazo", "troca_fora_do_prazo"]));
  });
});

describe("comissão", () => {
  it("é sobre o valor depois do desconto, desconta devolução, soma troca e bate com a soma das vendas", async () => {
    const L = await loja(); // todos com 5% (500 pontos-base) no seed
    const v1 = await registrarVenda(L.vend, { itens: [{ variacaoId: L.v("M", "Azul"), quantidade: 1 }], pagamentos: [pix(5990)] }); // 299,5 -> 300
    const v2 = await registrarVenda(L.dono, {
      itens: [{ variacaoId: L.v("G", "Azul"), quantidade: 2 }],
      desconto: { tipo: "percentual", pontosBase: 1000 },
      pagamentos: [pix(10782)],
    }); // 539,1 -> 539
    const hoje = diaSP();

    let rel = await calcularComissoes(L.dono, { de: hoje, ate: hoje });
    const vend = () => rel.vendedores.find((x) => x.vendedorId === "U-A-VEND")!;
    const dona = () => rel.vendedores.find((x) => x.vendedorId === "U-A-DONO")!;
    expect(vend()).toMatchObject({ vendas: 1, vendasCentavos: 5990, baseCentavos: 5990, comissaoCentavos: 300 });
    expect(dona()).toMatchObject({ vendas: 1, vendasCentavos: 10782, baseCentavos: 10782, comissaoCentavos: 539 }); // não sobre 11980
    expect(rel.totalComissaoCentavos).toBe(839);

    // vendedora devolve 1 camiseta da venda da dona (5391) e leva 1 de 5990: a dona perde 270, a vendedora ganha 300
    await registrarTroca(L.vend, {
      vendaId: v2.vendaId,
      devolvidos: [{ variacaoId: L.v("G", "Azul"), quantidade: 1 }],
      novos: [{ variacaoId: L.v("P", "Preto"), quantidade: 1 }],
      motivo: "Trocou o modelo",
      pagamentos: [pix(599)],
    });
    rel = await calcularComissoes(L.dono, { de: hoje, ate: hoje });
    expect(dona()).toMatchObject({ devolvidoCentavos: 5391, baseCentavos: 5391, comissaoCentavos: 539 - 270 });
    expect(vend()).toMatchObject({ levadoEmTrocaCentavos: 5990, baseCentavos: 11980, comissaoCentavos: 300 + 300 });
    expect(rel.totalComissaoCentavos).toBe(vend().comissaoCentavos + dona().comissaoCentavos);

    // mudar o percentual depois não muda o que já foi vendido
    await L.dono.atualizar("Usuarios", "U-A-VEND", () => ({ comissaoPontosBase: 2000 }));
    rel = await calcularComissoes(L.dono, { de: hoje, ate: hoje });
    expect(vend().comissaoCentavos).toBe(600);
    expect(v1.totalCentavos).toBe(5990);
  });

  it("vendedor vê só a própria comissão; período inválido é recusado", async () => {
    const L = await loja();
    await registrarVenda(L.vend, { itens: [{ variacaoId: L.v("M", "Azul"), quantidade: 1 }], pagamentos: [pix(5990)] });
    await registrarVenda(L.dono, { itens: [{ variacaoId: L.v("G", "Azul"), quantidade: 1 }], pagamentos: [pix(5990)] });
    const hoje = diaSP();
    const meu = await calcularComissoes(L.vend, { de: hoje, ate: hoje });
    expect(meu.vendedores.map((x) => x.vendedorId)).toEqual(["U-A-VEND"]);
    expect(meu.totalComissaoCentavos).toBe(300);
    await expect(calcularComissoes(L.vend, { de: "2026-10-31", ate: "2026-10-01" })).rejects.toMatchObject({ codigo: "invalido" });
    await expect(calcularComissoes(L.vend, { de: "ontem", ate: hoje })).rejects.toMatchObject({ codigo: "invalido" });
  });
});
