import { describe, expect, it } from "vitest";
import { criarContexto } from "@/lib/core/contexto";
import { ErroApp } from "@/lib/core/erros";
import { criarMundo, LOJA_A, LOJA_B, linhaLoja, MESTRA } from "./helpers/mundo";

describe("isolamento entre lojas", () => {
  it("a loja é descoberta pelo e-mail da sessão e só enxerga os dados dela", async () => {
    const { deps } = criarMundo();
    const a = await criarContexto(deps, "dona.a@exemplo.com");
    const b = await criarContexto(deps, "dono.b@exemplo.com");
    expect(a.tenantId).toBe(LOJA_A);
    expect(b.tenantId).toBe(LOJA_B);
    expect((await a.ler("Produtos")).map((p) => p.nome)).toEqual(["Camiseta A"]);
    expect((await b.ler("Produtos")).map((p) => p.nome)).toEqual(["Camiseta B"]);
    expect((await a.ler("Caixa")).map((c) => c.descricao)).toEqual(["Venda A"]);
  });

  it("cache nunca mistura lojas, mesmo com a mesma chave de leitura", async () => {
    const { deps } = criarMundo();
    const a = await criarContexto(deps, "dona.a@exemplo.com");
    const b = await criarContexto(deps, "dono.b@exemplo.com");
    await a.ler("Produtos"); // aquece o cache da loja A
    expect((await b.ler("Produtos")).map((p) => p.id)).toEqual(["P-B-1"]);
  });

  it("escrever na loja A nunca toca a planilha da loja B", async () => {
    const { deps, driver } = criarMundo();
    const a = await criarContexto(deps, "dona.a@exemplo.com");
    await a.acrescentar("Produtos", {
      nome: "Vestido", categoria: "Feminina", tipo: "grade", custoCentavos: 4000, precoCentavos: 9990,
    });
    expect([...driver.planilhasEscritas()]).toEqual([LOJA_A]);
    const b = await criarContexto(deps, "dono.b@exemplo.com");
    expect((await b.ler("Produtos")).map((p) => p.nome)).toEqual(["Camiseta B"]);
  });

  it("forjar o ID de um registro da loja B não altera nem remove nada na loja B", async () => {
    const { deps, driver } = criarMundo();
    const a = await criarContexto(deps, "dona.a@exemplo.com");
    const antes = JSON.stringify(driver.planilhas.get(LOJA_B)!.get("Produtos"));

    await expect(a.atualizar("Produtos", "P-B-1", () => ({ nome: "HACK" }))).rejects.toMatchObject({ codigo: "invalido" });
    await expect(a.remover("Produtos", "P-B-1")).rejects.toMatchObject({ codigo: "invalido" });

    expect(JSON.stringify(driver.planilhas.get(LOJA_B)!.get("Produtos"))).toBe(antes);
    expect(driver.planilhasEscritas().has(LOJA_B)).toBe(false);
  });

  it("o ID da planilha não é aceito como parâmetro: o contexto não tem como apontar para outra loja", async () => {
    const { deps } = criarMundo();
    const a = await criarContexto(deps, "dona.a@exemplo.com");
    // Tentativa de injetar tenant/planilha no registro novo: strict() recusa campo desconhecido.
    await expect(
      a.acrescentar("Produtos", {
        nome: "X", categoria: "Y", tipo: "simples", custoCentavos: 1, precoCentavos: 2,
        planilhaId: LOJA_B,
      } as never),
    ).rejects.toThrow();
  });

  it("o servidor gera id, versao e autor: quem chama não consegue forjar", async () => {
    const { deps } = criarMundo();
    const a = await criarContexto(deps, "dona.a@exemplo.com");
    const nova = await a.acrescentar("Clientes", {
      id: "P-B-1", versao: 99, criadoPor: "outra-pessoa",
      nome: "Maria", limiteCrediarioCentavos: 0, consentimentoEm: "2026-01-01",
    } as never).catch((e) => e);
    // strict() não aceita id/versao/criadoPor vindos de fora... mas como o repositório os sobrescreve,
    // o que importa é: se passar, os valores são os do servidor.
    if (!(nova instanceof Error)) {
      expect(nova.id).not.toBe("P-B-1");
      expect(nova.versao).toBe(1);
      expect(nova.criadoPor).toBe("U-A-DONO");
    }
  });

  it("e-mail que não está na mestra não entra", async () => {
    const { deps } = criarMundo();
    await expect(criarContexto(deps, "estranho@exemplo.com")).rejects.toMatchObject({ codigo: "proibido" });
  });

  it("estar na mestra apontando para a loja A não basta: precisa estar ativo na aba Usuarios da loja", async () => {
    const { deps } = criarMundo();
    await expect(criarContexto(deps, "intruso@exemplo.com")).rejects.toBeInstanceOf(ErroApp);
    await expect(criarContexto(deps, "saiu.a@exemplo.com")).rejects.toMatchObject({ codigo: "proibido" });
  });

  it("e-mail listado em duas lojas é recusado em vez de adivinhar a loja", async () => {
    const { deps, driver } = criarMundo();
    const m = driver.planilhas.get(MESTRA)!.get("Acessos")!;
    m.push(linhaMestra("dupla@exemplo.com", LOJA_A), linhaMestra("dupla@exemplo.com", LOJA_B));
    await expect(criarContexto(deps, "dupla@exemplo.com")).rejects.toMatchObject({ codigo: "proibido" });
  });

  it("a comparação de e-mail ignora maiúsculas e espaços", async () => {
    const { deps } = criarMundo();
    const ctx = await criarContexto(deps, "  DONA.A@Exemplo.com ");
    expect(ctx.tenantId).toBe(LOJA_A);
  });

  it("planilha com cabeçalho trocado: o sistema recusa operar", async () => {
    const { deps, driver } = criarMundo();
    driver.planilhas.get(LOJA_A)!.get("Produtos")![0]![3] = "nomeErrado";
    await expect(criarContexto(deps, "dona.a@exemplo.com")).rejects.toMatchObject({ codigo: "planilha_invalida" });
  });
});

import { escreverLinhaDef } from "@/lib/core/schema";
import { ABAS_MESTRA } from "@/lib/core/mestra";
function linhaMestra(email: string, planilhaId: string) {
  return escreverLinhaDef(ABAS_MESTRA.Acessos, {
    id: `X-${email}-${planilhaId}`, versao: 1, criadoEm: "2026-01-01", criadoPor: "sistema", email, planilhaId, ativo: true,
  });
}
void linhaLoja;
