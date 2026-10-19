import { describe, expect, it } from "vitest";
import { ABAS, conferirCabecalhos, linhaParaObjeto, NOMES_SOMENTE_ACRESCIMO, objetoParaLinha } from "@/lib/core/schema";

describe("schema único das abas", () => {
  it("toda aba começa com id, versao, criadoEm, criadoPor e termina com removidoEm", () => {
    for (const aba of Object.values(ABAS)) {
      expect(aba.cabecalhos.slice(0, 4)).toEqual(["id", "versao", "criadoEm", "criadoPor"]);
      expect(aba.cabecalhos.at(-1)).toBe("removidoEm");
    }
  });

  it("as abas de registro são só de acréscimo", () => {
    expect(NOMES_SOMENTE_ACRESCIMO.sort()).toEqual(["Auditoria", "Caixa", "CreditosLoja", "Movimentos"]);
  });

  it("dinheiro só aceita inteiro em centavos (decimais são recusados)", () => {
    const base = { id: "1", versao: 1, criadoEm: "x", criadoPor: "u", nome: "n", categoria: "c", tipo: "simples", custoCentavos: 100 };
    expect(() => objetoParaLinha("Produtos", { ...base, precoCentavos: 59.9 })).toThrow();
    expect(() => objetoParaLinha("Produtos", { ...base, precoCentavos: -1 })).toThrow();
    expect(() => objetoParaLinha("Produtos", { ...base, precoCentavos: 5990 })).not.toThrow();
  });

  it("campo desconhecido é recusado (strict)", () => {
    expect(() =>
      objetoParaLinha("Config", { id: "1", versao: 1, criadoEm: "x", criadoPor: "u", chave: "a", valor: "b", extra: "?" }),
    ).toThrow();
  });

  it("limites de tamanho por campo", () => {
    expect(() =>
      objetoParaLinha("Config", { id: "1", versao: 1, criadoEm: "x", criadoPor: "u", chave: "a", valor: "x".repeat(501) }),
    ).toThrow();
  });

  it("ida e volta: objeto -> linha -> objeto", () => {
    const linha = objetoParaLinha("Usuarios", {
      id: "u1", versao: 1, criadoEm: "2026-01-01", criadoPor: "s", email: "a@b.co", nome: "Ana", papel: "dono", ativo: true, comissaoPontosBase: 500,
    });
    expect(linha).toContain("TRUE");
    const obj = linhaParaObjeto("Usuarios", linha);
    expect(obj).toMatchObject({ email: "a@b.co", ativo: true, comissaoPontosBase: 500, removidoEm: undefined });
  });

  it("confere cabeçalho: aceita o certo, aponta coluna trocada, ausente ou com sobra", () => {
    const certo = [...ABAS.Config.cabecalhos];
    expect(conferirCabecalhos("Config", certo)).toEqual([]);
    expect(conferirCabecalhos("Config", [...certo.slice(0, 4), "chaveX", ...certo.slice(5)])[0]).toMatch(/coluna 5/);
    expect(conferirCabecalhos("Config", [])).toHaveLength(1);
    expect(conferirCabecalhos("Config", [...certo, "sobrou"])[0]).toMatch(/extras/);
  });
});
