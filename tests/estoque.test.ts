import { describe, expect, it } from "vitest";
import { criarContexto } from "@/lib/core/contexto";
import {
  abaixoDoMinimo,
  ajustarEstoque,
  buscarCatalogo,
  compararTamanhos,
  criarProdutoComGrade,
  digitoEan13,
  gerarEan13Interno,
  montarCatalogo,
} from "@/lib/moda/estoque";
import { configurar, darEstoque, prepararLoja } from "./helpers/loja";
import { criarMundo } from "./helpers/mundo";

const base = { categoria: "Feminina", custoCentavos: 2000, precoCentavos: 4990 };

describe("cadastro rápido de grade", () => {
  it("gera todas as combinações, com SKU e código de barras únicos e válidos", async () => {
    const { dono, produtoId } = await prepararLoja();
    const prod = (await montarCatalogo(dono, { fresco: true })).find((p) => p.id === produtoId)!;
    expect(prod.variacoes).toHaveLength(6); // 3 tamanhos × 2 cores
    expect(prod.tipo).toBe("grade");
    expect(new Set(prod.variacoes.map((v) => v.sku)).size).toBe(6);
    expect(new Set(prod.variacoes.map((v) => v.codigoBarras)).size).toBe(6);
    for (const v of prod.variacoes) {
      expect(v.codigoBarras).toMatch(/^2\d{12}$/);
      expect(digitoEan13(v.codigoBarras!.slice(0, 12))).toBe(Number(v.codigoBarras!.slice(12)));
    }
    expect(prod.variacoes.map((v) => v.tamanho)).toEqual(["P", "P", "M", "M", "G", "G"]); // ordem P, M, G
    expect((await dono.ler("Auditoria")).map((a) => a.acao)).toContain("criar_produto");
  });

  it("peça sem grade vira produto 'simples' com variação única e SKU sem sufixo", async () => {
    const { dono } = await prepararLoja();
    const { produtoId, variacoes } = await criarProdutoComGrade(dono, { ...base, nome: "Brinco Argola", tamanhos: ["Único"], cores: ["Único"] });
    expect(variacoes).toBe(1);
    const p = (await montarCatalogo(dono, { fresco: true })).find((x) => x.id === produtoId)!;
    expect(p.tipo).toBe("simples");
    expect(p.variacoes[0]!.sku).toBe("BRINCOAR");
  });

  it("não repete tamanho ou cor escrito de outro jeito (m = M)", async () => {
    const { dono } = await prepararLoja();
    const r = await criarProdutoComGrade(dono, { ...base, nome: "Blusa", tamanhos: ["M", "m", " M "], cores: ["Rosa", "rosa"] });
    expect(r.variacoes).toBe(1);
  });

  it("dois produtos com o mesmo nome ganham SKUs diferentes", async () => {
    const { dono } = await prepararLoja();
    const a = await criarProdutoComGrade(dono, { ...base, nome: "Vestido Longo", tamanhos: ["M"], cores: ["Preto"] });
    const b = await criarProdutoComGrade(dono, { ...base, nome: "Vestido Longo", tamanhos: ["M"], cores: ["Preto"] });
    const cat = await montarCatalogo(dono, { fresco: true });
    const skus = [a, b].map((x) => cat.find((p) => p.id === x.produtoId)!.variacoes[0]!.sku);
    expect(skus[0]).not.toBe(skus[1]);
  });

  it("recusa grade grande demais e dados inválidos", async () => {
    const { dono } = await prepararLoja();
    const muitos = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${i}`);
    await expect(criarProdutoComGrade(dono, { ...base, nome: "X1", tamanhos: muitos(20, "T"), cores: muitos(11, "C") })).rejects.toMatchObject({ codigo: "invalido" });
    await expect(criarProdutoComGrade(dono, { ...base, nome: "X1", precoCentavos: 59.9, tamanhos: ["M"], cores: ["A"] })).rejects.toThrow();
    await expect(criarProdutoComGrade(dono, { ...base, nome: "X1", tamanhos: [], cores: ["A"] })).rejects.toThrow();
    await expect(criarProdutoComGrade(dono, { ...base, nome: "X1", tamanhos: ["M"], cores: ["A"], extra: 1 })).rejects.toThrow();
  });

  it("vendedor não cadastra produto nem ajusta estoque", async () => {
    const { vend, v } = await prepararLoja();
    await expect(criarProdutoComGrade(vend, { ...base, nome: "Y", tamanhos: ["M"], cores: ["A"] })).rejects.toMatchObject({ codigo: "proibido" });
    await expect(ajustarEstoque(vend, { variacaoId: v("M", "Azul"), quantidade: 1, motivo: "contagem" })).rejects.toMatchObject({ codigo: "proibido" });
  });
});

describe("saldo, ajuste e alerta de mínimo", () => {
  it("o saldo é a soma dos movimentos; ajuste gera movimento e auditoria", async () => {
    const { dono, v } = await prepararLoja();
    await darEstoque(dono, v("M", "Azul"), 10);
    const r = await ajustarEstoque(dono, { variacaoId: v("M", "Azul"), quantidade: -3, motivo: "perda" });
    expect(r.saldo).toBe(7);
    const movs = (await dono.sistema.lerFresco("Movimentos")).filter((m) => m.variacaoId === v("M", "Azul"));
    expect(movs.map((m) => m.quantidade)).toEqual([10, -3]);
    expect((await dono.ler("Auditoria")).map((a) => a.acao)).toContain("ajuste_estoque:perda");
  });

  it("não deixa o estoque negativo por ajuste, a menos que a loja permita", async () => {
    const { dono, v } = await prepararLoja();
    await expect(ajustarEstoque(dono, { variacaoId: v("M", "Azul"), quantidade: -1, motivo: "perda" })).rejects.toMatchObject({ codigo: "invalido" });
    await configurar(dono, { estoqueNegativo: true });
    await expect(ajustarEstoque(dono, { variacaoId: v("M", "Azul"), quantidade: -1, motivo: "perda" })).resolves.toMatchObject({ saldo: -1 });
  });

  it("recusa quantidade zero, fracionada, peça inexistente e motivo inventado", async () => {
    const { dono, v } = await prepararLoja();
    await expect(ajustarEstoque(dono, { variacaoId: v("M", "Azul"), quantidade: 0, motivo: "contagem" })).rejects.toThrow();
    await expect(ajustarEstoque(dono, { variacaoId: v("M", "Azul"), quantidade: 1.5, motivo: "contagem" })).rejects.toThrow();
    await expect(ajustarEstoque(dono, { variacaoId: v("M", "Azul"), quantidade: 1, motivo: "roubo" })).rejects.toThrow();
    await expect(ajustarEstoque(dono, { variacaoId: "nao-existe", quantidade: 1, motivo: "contagem" })).rejects.toMatchObject({ codigo: "invalido" });
  });

  it("lista as variações abaixo do mínimo (mínimo 0 não alerta)", async () => {
    const { dono, vend, v } = await prepararLoja(); // mínimo 1 em todas as variações
    await darEstoque(dono, v("M", "Azul"), 1);
    const alertas = await abaixoDoMinimo(vend);
    expect(alertas).toHaveLength(5); // só a M Azul está no mínimo
    expect(alertas.some((a) => a.variacaoId === v("M", "Azul"))).toBe(false);
    const { produtoId } = await criarProdutoComGrade(dono, { ...base, nome: "Sem Minimo", tamanhos: ["M"], cores: ["A"], minimo: 0 });
    expect((await abaixoDoMinimo(dono)).some((a) => a.produto === "Sem Minimo")).toBe(false);
    expect(produtoId).toBeTruthy();
  });
});

describe("catálogo e busca (PDV)", () => {
  it("vendedor recebe preço e saldo, mas nunca o custo", async () => {
    const { dono, vend, v } = await prepararLoja();
    await darEstoque(dono, v("M", "Azul"), 4);
    const comoVendedor = JSON.stringify(await montarCatalogo(vend, { fresco: true }));
    expect(comoVendedor).not.toContain("2500");
    expect(comoVendedor).toContain("5990");
    const [p] = (await montarCatalogo(dono, { fresco: true })).filter((x) => x.nome === "Camiseta Básica");
    expect(p!.custoCentavos).toBe(2500);
    expect(p!.variacoes.find((x) => x.id === v("M", "Azul"))!.saldo).toBe(4);
  });

  it("acha por nome sem depender de acento ou maiúscula, e por cor/tamanho", async () => {
    const { vend } = await prepararLoja();
    expect((await buscarCatalogo(vend, "CAMISETA BASICA")).produtos).toHaveLength(1);
    expect((await buscarCatalogo(vend, "camiseta azul")).produtos).toHaveLength(1);
    expect((await buscarCatalogo(vend, "vestido")).produtos).toHaveLength(0);
    expect((await buscarCatalogo(vend, "")).total).toBeGreaterThan(0);
  });

  it("código de barras ou SKU exatos (leitor USB) devolvem a variação direto", async () => {
    const { vend, dono, v, produtoId } = await prepararLoja();
    const cat = await montarCatalogo(dono, { fresco: true });
    const alvo = cat.find((p) => p.id === produtoId)!.variacoes.find((x) => x.id === v("G", "Preto"))!;
    const porBarras = await buscarCatalogo(vend, alvo.codigoBarras!);
    expect(porBarras.variacaoExataId).toBe(v("G", "Preto"));
    const porSku = await buscarCatalogo(vend, alvo.sku.toLowerCase());
    expect(porSku.variacaoExataId).toBe(v("G", "Preto"));
    expect((await buscarCatalogo(vend, "camiseta")).variacaoExataId).toBeNull();
  });

  it("não mistura lojas: a loja B não vê o produto da loja A", async () => {
    const { deps } = await prepararLoja();
    const b = await criarContexto(deps, "dono.b@exemplo.com");
    expect((await montarCatalogo(b)).map((p) => p.nome)).toEqual(["Camiseta B"]);
  });
});

describe("utilidades de estoque", () => {
  it("ordena tamanhos: letras, depois numeração, depois o resto", () => {
    expect(["G", "P", "M", "GG", "PP"].sort(compararTamanhos)).toEqual(["PP", "P", "M", "G", "GG"]);
    expect(["40", "34", "10", "36"].sort(compararTamanhos)).toEqual(["10", "34", "36", "40"]);
    expect(["Único", "M", "38"].sort(compararTamanhos)).toEqual(["M", "38", "Único"]);
  });

  it("dígito verificador do EAN-13 (exemplo conhecido 4006381333931)", () => {
    expect(digitoEan13("400638133393")).toBe(1);
    expect(() => digitoEan13("123")).toThrow();
  });

  it("gera código novo mesmo com vários já usados", () => {
    const usados = new Set<string>();
    for (let i = 0; i < 200; i++) usados.add(gerarEan13Interno(usados));
    expect(usados.size).toBe(200);
  });
});

void criarMundo;
