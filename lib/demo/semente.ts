/**
 * Loja de DEMONSTRAÇÃO: dados fictícios gerados pelas próprias regras do sistema, para os números
 * sempre fecharem. Usada pelo modo ?demo=true (app) e pelo gerador das planilhas de demonstração (teste).
 * As datas são relativas a HOJE: o que "venceu" ou "faz aniversário" é sempre calculado a partir do dia.
 */
import { criarContexto, type Contexto } from "@/lib/core/contexto";
import { ABAS_MESTRA } from "@/lib/core/mestra";
import { ABAS, escreverLinhaDef } from "@/lib/core/schema";
import { DriverFalso } from "@/lib/core/sheets/memoria";
import { cacheMemoria } from "@/lib/core/sheets/cache";
import { diaSP, somarDias } from "@/lib/core/tempo";
import { criarCliente, definirLimiteCrediario } from "@/lib/moda/clientes";
import { criarFornecedor, registrarCompra } from "@/lib/moda/compras";
import { MAX_PARCELAS_CARTAO, salvarConfig } from "@/lib/moda/config";
import { registrarSaidaCondicional, resolverCondicional, listarCondicionais } from "@/lib/moda/condicional";
import { criarProdutoComGrade, montarCatalogo } from "@/lib/moda/estoque";
import { registrarTroca } from "@/lib/moda/troca";
import { registrarVenda } from "@/lib/moda/venda";

export const DEMO_LOJA_ID = "demo-loja-0001";
export const DEMO_MESTRA_ID = "demo-mestra-0001";
export const DEMO_EMAIL_DONO = "dona@demonstracao.local";
export const DEMO_EMAIL_VENDEDOR = "vendedora@demonstracao.local";

const base = { versao: 1, criadoEm: "2026-01-01T00:00:00-03:00", criadoPor: "sistema" };

export interface OpcoesDemo {
  lojaId?: string;
  mestraId?: string;
  emailDono?: string;
  emailVendedor?: string;
}

/** Preenche o driver (vazio) com a mestra e a loja de demonstração. Devolve o contexto do dono para conferências. */
export async function semearDemo(driver: DriverFalso, o: OpcoesDemo = {}): Promise<{ dono: Contexto; hoje: string }> {
  const LOJA = o.lojaId ?? DEMO_LOJA_ID;
  const MESTRA = o.mestraId ?? DEMO_MESTRA_ID;
  const emailDono = o.emailDono ?? DEMO_EMAIL_DONO;
  const emailVend = o.emailVendedor ?? DEMO_EMAIL_VENDEDOR;
  const deps = { driver, cache: cacheMemoria(), masterId: MESTRA };
  const ABAS_NOMES = Object.keys(ABAS) as Array<keyof typeof ABAS>;

  const loja = Object.fromEntries(ABAS_NOMES.map((n) => [n, [ABAS[n].cabecalhos]])) as Record<string, string[][]>;
  const usuario = (id: string, email: string, nome: string, papel: string) =>
    escreverLinhaDef(ABAS.Usuarios, { ...base, id, email, nome, papel, ativo: true, comissaoPontosBase: 500 });
  loja.Usuarios!.push(usuario("U-DEMO-DONO", emailDono, "Dona da Loja (demo)", "dono"), usuario("U-DEMO-VEND", emailVend, "Vendedora (demo)", "vendedor"));
  driver.criarPlanilha(LOJA, loja);
  driver.criarPlanilha(MESTRA, {
    Clientes: [
      ABAS_MESTRA.Clientes.cabecalhos,
      escreverLinhaDef(ABAS_MESTRA.Clientes, { ...base, id: "CL-DEMO", nomeLoja: "Loja Demonstração", emailDono: emailDono, planilhaId: LOJA, plano: "demo", ativo: true }),
    ],
    Acessos: [
      ABAS_MESTRA.Acessos.cabecalhos,
      ...[emailDono, emailVend].map((e, i) => escreverLinhaDef(ABAS_MESTRA.Acessos, { ...base, id: `AC-DEMO-${i}`, email: e, planilhaId: LOJA, ativo: true })),
    ],
  });

  const dono = await criarContexto(deps, emailDono);
  const vend = await criarContexto(deps, emailVend);
  await salvarConfig(dono, {
    descontoMaxVendedorPb: 1000,
    estoqueNegativo: false,
    taxaDebitoPb: 199,
    taxaPixPb: 0,
    taxaDinheiroPb: 0,
    taxaCreditoPb: [349, 449, 499, 549, 599, 649, 699, 749, 799, 849, 899, 949].slice(0, MAX_PARCELAS_CARTAO),
    crediarioMaxParcelas: 6,
    crediarioPrimeiroDias: 30,
    condicionalPrazoDias: 3,
    trocaPrazoDias: 30,
  });

  /* ------------------------------- produtos com saldo ------------------------------- */
  const grade = (tamanhos: string[], cores: string[], qtd: (t: string, c: string) => number) =>
    tamanhos.flatMap((tamanho) => cores.map((cor) => ({ tamanho, cor, quantidade: qtd(tamanho, cor) })));
  const p = (nome: string, categoria: string, marca: string | undefined, custo: number, preco: number, tamanhos: string[], cores: string[], qtd: (t: string, c: string) => number, minimo = 2) =>
    criarProdutoComGrade(dono, { nome, categoria, marca, custoCentavos: custo, precoCentavos: preco, tamanhos, cores, minimo, quantidades: grade(tamanhos, cores, qtd) });
  await p("Camiseta Básica", "Feminina", "Aurora", 2500, 5990, ["P", "M", "G"], ["Branco", "Preto", "Rosa"], (t) => (t === "M" ? 8 : 5));
  await p("Calça Jeans Skinny", "Feminina", "Denim Co", 6500, 14990, ["36", "38", "40", "42", "44"], ["Azul"], (t) => (t === "40" ? 6 : 3));
  await p("Vestido Floral", "Feminina", "Aurora", 4500, 12990, ["P", "M", "G"], ["Rosa", "Verde"], (t, c) => (t === "G" && c === "Verde" ? 4 : 3));
  await p("Bermuda Masculina", "Masculina", undefined, 4000, 8990, ["38", "40", "42", "44"], ["Bege", "Preto"], () => 3);
  await p("Camisa Polo", "Masculina", "Nobre", 3500, 7990, ["M", "G", "GG"], ["Azul", "Branco"], () => 4);
  await p("Tênis Casual", "Calçados", "Passo Leve", 7000, 17990, ["36", "37", "38", "39", "40"], ["Branco"], () => 2);
  await p("Brinco Argola", "Bijuteria", undefined, 800, 2490, ["Único"], ["Único"], () => 30, 5);
  await p("Cinto de Couro", "Acessórios", undefined, 2000, 5990, ["Único"], ["Único"], () => 12, 3);

  const cat = async () => montarCatalogo(dono, { fresco: true });
  const ach = async (nome: string, tamanho = "Único", cor = "Único") => {
    const pr = (await cat()).find((x) => x.nome === nome)!;
    const v = pr.variacoes.find((x) => x.tamanho === tamanho && x.cor === cor)!;
    return { id: v.id, preco: v.precoCentavos };
  };

  /* ------------------------------- fornecedores e compras ------------------------------- */
  const f1 = (await criarFornecedor(dono, { nome: "Atacado Moda Bela", telefone: "(91) 3000-0001", prazoPadraoDias: 30 })).fornecedorId;
  const f2 = (await criarFornecedor(dono, { nome: "Calçados Passo Leve", telefone: "(91) 3000-0002", prazoPadraoDias: 45 })).fornecedorId;
  const camM = await ach("Camiseta Básica", "M", "Branco");
  await registrarCompra(dono, { fornecedorId: f1, pagamento: "avista", forma: "pix", itens: [{ variacaoId: camM.id, quantidade: 10, custoCentavos: 2500 }] });
  const tenis = await ach("Tênis Casual", "38", "Branco");
  await registrarCompra(dono, { fornecedorId: f2, pagamento: "prazo", parcelas: 3, itens: [{ variacaoId: tenis.id, quantidade: 6, custoCentavos: 7000 }] });

  /* ------------------------------------ clientes ------------------------------------ */
  const hoje = diaSP();
  const aniv = (dias: number) => {
    const d = somarDias(hoje, dias);
    return { aniversarioMes: Number(d.slice(5, 7)), aniversarioDia: Number(d.slice(8, 10)) };
  };
  const cli = async (nome: string, tel: string, bairro: string, a: { aniversarioMes: number; aniversarioDia: number }, limite: number) => {
    const { clienteId } = await criarCliente(vend, { nome, telefone: tel, bairro, ...a, consentimento: true });
    await definirLimiteCrediario(dono, clienteId, limite);
    return clienteId;
  };
  const maria = await cli("Maria Souza (exemplo)", "(91) 98888-0001", "Centro", aniv(0), 100_000);
  const joana = await cli("Joana Lima (exemplo)", "(91) 98888-0002", "Aldeia", aniv(3), 80_000);
  const ana = await cli("Ana Paula (exemplo)", "(91) 98888-0003", "Riozinho", aniv(40), 50_000);
  await cli("Carla Dias (exemplo)", "(91) 98888-0004", "Centro", aniv(120), 0);

  /* ------------------------------------- vendas ------------------------------------- */
  type Item = [string, string, string, number]; // nome, tamanho, cor, qtd
  const montar = async (itens: Item[]) => {
    const l = await Promise.all(itens.map(async ([n, t, c, q]) => ({ ...(await ach(n, t, c)), quantidade: q })));
    return { itens: l.map((x) => ({ variacaoId: x.id, quantidade: x.quantidade })), total: l.reduce((s, x) => s + x.preco * x.quantidade, 0) };
  };
  const vender = async (quem: typeof dono, itens: Item[], forma: "dinheiro" | "pix" | "debito" | "credito" | "crediario", parcelas = 1, clienteId?: string, descontoCentavos?: number) => {
    const m = await montar(itens);
    const total = m.total - (descontoCentavos ?? 0);
    return registrarVenda(quem, { clienteId, itens: m.itens, ...(descontoCentavos ? { desconto: { tipo: "valor", centavos: descontoCentavos } } : {}), pagamentos: [{ forma, valorCentavos: total, parcelas }] });
  };
  const vendas: string[] = [];
  const reg = async (r: Promise<{ vendaId: string }>) => vendas.push((await r).vendaId);
  await reg(vender(vend, [["Camiseta Básica", "M", "Branco", 2]], "dinheiro"));
  await reg(vender(vend, [["Vestido Floral", "P", "Rosa", 1]], "pix"));
  await reg(vender(vend, [["Calça Jeans Skinny", "40", "Azul", 1], ["Cinto de Couro", "Único", "Único", 1]], "credito", 3));
  await reg(vender(dono, [["Camisa Polo", "M", "Azul", 1]], "debito"));
  await reg(vender(vend, [["Tênis Casual", "38", "Branco", 1]], "credito", 2));
  await reg(vender(vend, [["Bermuda Masculina", "40", "Bege", 1]], "crediario", 3, maria));
  await reg(vender(vend, [["Vestido Floral", "M", "Verde", 1]], "crediario", 2, joana));
  await reg(vender(vend, [["Camiseta Básica", "G", "Rosa", 1], ["Brinco Argola", "Único", "Único", 2]], "pix"));
  await reg(vender(vend, [["Camisa Polo", "G", "Branco", 2]], "dinheiro"));
  await reg(vender(vend, [["Calça Jeans Skinny", "38", "Azul", 1]], "pix", 1, undefined, 1000)); // R$ 10 de desconto
  await reg(vender(dono, [["Camiseta Básica", "P", "Preto", 1]], "pix", 1, ana));
  const vTroca = await vender(vend, [["Camiseta Básica", "P", "Branco", 1]], "pix", 1, ana);
  vendas.push(vTroca.vendaId);

  // troca: devolve a P e leva a M com diferença zero -> exemplo de vale-troca: devolve e fica com vale
  await registrarTroca(vend, { vendaId: vTroca.vendaId, devolvidos: [{ variacaoId: (await ach("Camiseta Básica", "P", "Branco")).id, quantidade: 1 }], motivo: "Ficou pequena (exemplo)", destino: "vale" });

  // condicionais: um dentro do prazo e um vencido; um resolvido
  const c1 = await registrarSaidaCondicional(vend, { clienteId: ana, itens: [{ variacaoId: (await ach("Vestido Floral", "G", "Rosa")).id, quantidade: 1 }, { variacaoId: (await ach("Calça Jeans Skinny", "42", "Azul")).id, quantidade: 1 }] });
  const c2 = await registrarSaidaCondicional(vend, { clienteId: joana, itens: [{ variacaoId: (await ach("Camisa Polo", "GG", "Azul")).id, quantidade: 1 }] });
  const c3 = await registrarSaidaCondicional(vend, { clienteId: maria, itens: [{ variacaoId: (await ach("Bermuda Masculina", "42", "Preto")).id, quantidade: 1 }] });
  const lista = await listarCondicionais(vend);
  const it3 = lista.find((x) => x.id === c3.condicionalId)!.itens[0]!;
  const total3 = (await ach("Bermuda Masculina", "42", "Preto")).preco;
  await resolverCondicional(vend, { condicionalId: c3.condicionalId, resolucoes: [{ itemId: it3.id, resultado: "comprou" }], pagamentos: [{ forma: "pix", valorCentavos: total3, parcelas: 1 }] });
  await dono.sistema.atualizar("Condicionais", c2.condicionalId, () => ({ saidaEm: `${somarDias(hoje, -8)}T10:00:00-03:00`, devolverAte: somarDias(hoje, -5) })); // vencido
  void c1;

  /* ---------- datas: espalha as vendas pelos últimos dias e deixa um crediário atrasado ---------- */
  const m = driver.planilhas.get(LOJA)!;
  const col = (aba: string, nome: string) => m.get(aba)![0]!.indexOf(nome);
  const dias = [0, 0, 1, 1, 2, 3, 4, 5, 7, 9, 11, 0, 0]; // por venda, na ordem; 0 = hoje
  vendas.forEach((id, i) => {
    const volta = dias[i] ?? 0;
    if (volta === 0) return;
    const novo = (d: string) => `${somarDias(d.slice(0, 10), -volta)}${d.slice(10)}`;
    for (const l of m.get("Vendas")!.slice(1)) if (l[0] === id) l[col("Vendas", "data")] = novo(l[col("Vendas", "data")]!);
    for (const l of m.get("Caixa")!.slice(1)) if (l[col("Caixa", "origemId")] === id) l[col("Caixa", "data")] = novo(l[col("Caixa", "data")]!);
  });
  const maisAntigaMaria = vendas[5]!; // crediário da Maria: parcelas vencem há 15 dias
  for (const l of m.get("Contas")!.slice(1)) if (l[col("Contas", "refId")] === maisAntigaMaria) l[col("Contas", "vencimento")] = somarDias(l[col("Contas", "vencimento")]!.slice(0, 10), -45);

  return { dono, hoje };
}
