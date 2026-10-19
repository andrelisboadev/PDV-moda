import { describe, expect, it } from "vitest";
import { CONFIG_PADRAO, interpretarConfig, lerConfig, salvarConfig, taxaPontosBase } from "@/lib/moda/config";
import { configurar, prepararLoja } from "./helpers/loja";

describe("configuração da loja", () => {
  it("sem nada configurado: vendedor sem desconto, estoque não negativo, taxas zero", () => {
    expect(interpretarConfig([])).toEqual(CONFIG_PADRAO);
  });

  it("lê as chaves, ignora valor inválido e a última linha da chave vence", () => {
    const cfg = interpretarConfig([
      { chave: "desconto.max.vendedor", valor: "500" },
      { chave: "desconto.max.vendedor", valor: "1000" },
      { chave: "estoque.negativo", valor: "sim" },
      { chave: "taxa.debito", valor: "199" },
      { chave: "taxa.credito.3", valor: "abc" },
      { chave: "taxa.credito.2", valor: "99999" },
      { chave: "taxa.credito.4", valor: "650" },
    ]);
    expect(cfg).toMatchObject({ descontoMaxVendedorPb: 1000, estoqueNegativo: true, taxaDebitoPb: 199 });
    expect(cfg.taxaCreditoPb[3]).toBe(0);
    expect(cfg.taxaCreditoPb[2]).toBe(0);
    expect(cfg.taxaCreditoPb[4]).toBe(650);
  });

  it("taxa por forma de pagamento e parcelas", () => {
    const cfg = interpretarConfig([
      { chave: "taxa.debito", valor: "199" },
      { chave: "taxa.credito.1", valor: "349" },
      { chave: "taxa.credito.12", valor: "1299" },
    ]);
    expect(taxaPontosBase(cfg, "debito", 1)).toBe(199);
    expect(taxaPontosBase(cfg, "credito", 1)).toBe(349);
    expect(taxaPontosBase(cfg, "credito", 12)).toBe(1299);
    expect(taxaPontosBase(cfg, "pix", 1)).toBe(0);
    expect(taxaPontosBase(cfg, "crediario", 1)).toBe(0);
  });

  it("só o dono salva; salvar de novo sem mudar não altera nada; mudança gera auditoria", async () => {
    const { dono, vend } = await prepararLoja();
    const entrada = {
      descontoMaxVendedorPb: 1000, estoqueNegativo: false, taxaDebitoPb: 199, taxaPixPb: 0, taxaDinheiroPb: 0,
      taxaCreditoPb: Array<number>(12).fill(349),
      crediarioMaxParcelas: 6, crediarioPrimeiroDias: 30, condicionalPrazoDias: 3, trocaPrazoDias: 0,
    };
    await expect(salvarConfig(vend, entrada)).rejects.toMatchObject({ codigo: "proibido" });
    expect((await salvarConfig(dono, entrada)).alteradas).toBe(21);
    expect((await salvarConfig(dono, entrada)).alteradas).toBe(0);
    expect((await salvarConfig(dono, { ...entrada, descontoMaxVendedorPb: 1500 })).alteradas).toBe(1);
    expect((await lerConfig(dono, { fresco: true })).descontoMaxVendedorPb).toBe(1500);
    const acoes = (await dono.ler("Auditoria")).map((a) => a.acao);
    expect(acoes).toContain("alterar_cadastro");
    expect(acoes).toContain("criar_cadastro");
  });

  it("o vendedor não lê a aba Config diretamente, mas as regras de venda a usam", async () => {
    const { dono, vend } = await prepararLoja();
    await configurar(dono, { descontoMaxVendedorPb: 800 });
    await expect(vend.ler("Config")).rejects.toMatchObject({ codigo: "proibido" });
    expect((await lerConfig(vend, { fresco: true })).descontoMaxVendedorPb).toBe(800);
  });

  it("recusa valor fora de 0 a 100% e campo desconhecido", async () => {
    const { dono } = await prepararLoja();
    const ok = { descontoMaxVendedorPb: 0, estoqueNegativo: false, taxaDebitoPb: 0, taxaPixPb: 0, taxaDinheiroPb: 0, taxaCreditoPb: Array<number>(12).fill(0), crediarioMaxParcelas: 6, crediarioPrimeiroDias: 30, condicionalPrazoDias: 3, trocaPrazoDias: 0 };
    await expect(salvarConfig(dono, { ...ok, descontoMaxVendedorPb: 10001 })).rejects.toThrow();
    await expect(salvarConfig(dono, { ...ok, taxaCreditoPb: [1, 2] })).rejects.toThrow();
    await expect(salvarConfig(dono, { ...ok, algo: 1 })).rejects.toThrow();
    await expect(salvarConfig(dono, { ...ok, crediarioMaxParcelas: 0 })).rejects.toThrow();
    await expect(salvarConfig(dono, { ...ok, condicionalPrazoDias: 61 })).rejects.toThrow();
  });
});
