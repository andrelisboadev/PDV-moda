import { describe, expect, it } from "vitest";
import {
  aplicarPontosBase,
  centavosParaCampo,
  dividirEmParcelas,
  formatarPercentual,
  formatarReais,
  lerPercentual,
  lerReais,
  pontosBaseParaCampo,
} from "@/lib/core/dinheiro";
import { comTrava } from "@/lib/core/mutex";
import { agoraSP, diaSP } from "@/lib/core/tempo";

describe("dinheiro em centavos", () => {
  it("lê o que a pessoa digita, sem usar decimal de ponto flutuante", () => {
    expect(lerReais("59,90")).toBe(5990);
    expect(lerReais("R$ 59,90")).toBe(5990);
    expect(lerReais("1.299,90")).toBe(129990);
    expect(lerReais("59.90")).toBe(5990);
    expect(lerReais("1.299")).toBe(129900);
    expect(lerReais("59")).toBe(5900);
    expect(lerReais("59,9")).toBe(5990);
    expect(lerReais("0,05")).toBe(5);
    expect(lerReais("19,99")).toBe(1999); // 19,99 × 100 em float daria 1998,9999...
  });

  it("recusa o que não é valor", () => {
    for (const ruim of ["", "abc", "-5", "5,999", "1,2,3", "R$", "9".repeat(20)]) expect(lerReais(ruim)).toBeNull();
  });

  it("formata em R$ para a tela e volta para o campo", () => {
    expect(formatarReais(5990).replace(/ /g, " ")).toBe("R$ 59,90");
    expect(formatarReais(129990).replace(/ /g, " ")).toBe("R$ 1.299,90");
    expect(centavosParaCampo(5990)).toBe("59,90");
    expect(lerReais(centavosParaCampo(129990))).toBe(129990);
  });

  it("percentual em pontos-base: 10% = 1000", () => {
    expect(lerPercentual("10")).toBe(1000);
    expect(lerPercentual("10,5%")).toBe(1050);
    expect(lerPercentual("0,01")).toBe(1);
    expect(lerPercentual("100")).toBe(10000);
    expect(lerPercentual("100,01")).toBeNull();
    expect(lerPercentual("-1")).toBeNull();
    expect(formatarPercentual(1050)).toBe("10,5%");
    expect(pontosBaseParaCampo(1050)).toBe("10,5");
  });

  it("aplica pontos-base arredondando ao centavo mais próximo", () => {
    expect(aplicarPontosBase(5990, 1000)).toBe(599);
    expect(aplicarPontosBase(6980, 450)).toBe(314); // 314,1
    expect(aplicarPontosBase(5990, 350)).toBe(210); // 209,65
    expect(aplicarPontosBase(100, 0)).toBe(0);
  });

  it("parcelas somam EXATAMENTE o total; a última absorve os centavos", () => {
    expect(dividirEmParcelas(10000, 3)).toEqual([3333, 3333, 3334]);
    expect(dividirEmParcelas(1, 3)).toEqual([0, 0, 1]);
    for (const total of [1, 99, 10000, 12345, 99999, 100001, 7]) {
      for (let n = 1; n <= 12; n++) {
        const p = dividirEmParcelas(total, n);
        expect(p).toHaveLength(n);
        expect(p.reduce((a, b) => a + b, 0)).toBe(total);
        expect(p.every(Number.isInteger)).toBe(true);
      }
    }
    expect(() => dividirEmParcelas(100, 0)).toThrow();
    expect(() => dividirEmParcelas(10.5, 2)).toThrow();
  });
});

describe("datas no fuso de São Paulo", () => {
  it("ISO 8601 com -03:00", () => {
    expect(agoraSP(new Date("2026-10-14T11:31:05Z"))).toBe("2026-10-14T08:31:05-03:00");
  });
  it("o dia vira à meia-noite de São Paulo, não à do UTC", () => {
    expect(diaSP(new Date("2026-10-15T02:30:00Z"))).toBe("2026-10-14"); // 23:30 em SP
    expect(diaSP(new Date("2026-10-15T03:00:00Z"))).toBe("2026-10-15");
  });
});

describe("trava por loja", () => {
  it("executa em fila na mesma chave e em paralelo em chaves diferentes", async () => {
    const ordem: string[] = [];
    const tarefa = (nome: string, ms: number) => async () => {
      ordem.push(`${nome}:inicio`);
      await new Promise((r) => setTimeout(r, ms));
      ordem.push(`${nome}:fim`);
    };
    await Promise.all([comTrava("A", tarefa("a1", 20)), comTrava("A", tarefa("a2", 1)), comTrava("B", tarefa("b1", 1))]);
    expect(ordem.indexOf("a1:fim")).toBeLessThan(ordem.indexOf("a2:inicio")); // mesma chave: em fila
    expect(ordem.indexOf("b1:fim")).toBeLessThan(ordem.indexOf("a1:fim")); // outra chave: não espera
  });

  it("uma tarefa que falha não trava a fila", async () => {
    await expect(comTrava("C", async () => { throw new Error("x"); })).rejects.toThrow("x");
    await expect(comTrava("C", async () => "ok")).resolves.toBe("ok");
  });
});
