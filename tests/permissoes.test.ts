import { describe, expect, it } from "vitest";
import { criarContexto } from "@/lib/core/contexto";
import { PREFIXOS_SO_DONO, rotaSoDono } from "@/lib/core/permissoes";
import { ABAS_NOMES } from "./helpers/abas";
import { criarMundo } from "./helpers/mundo";

describe("perfis: vendedor x dono", () => {
  it("vendedor não lê Caixa, Contas, Compras, Usuários, Config, Auditoria nem Fornecedores", async () => {
    const { deps } = criarMundo();
    const v = await criarContexto(deps, "vend.a@exemplo.com");
    for (const aba of ["Caixa", "Contas", "Compras", "CompraItens", "Fornecedores", "Usuarios", "Config", "Auditoria"] as const) {
      await expect(v.ler(aba)).rejects.toMatchObject({ codigo: "proibido" });
    }
  });

  it("vendedor lê produtos, mas sem custo (nem a chave existe na resposta)", async () => {
    const { deps } = criarMundo();
    const v = await criarContexto(deps, "vend.a@exemplo.com");
    const [p] = await v.ler("Produtos");
    expect(p?.nome).toBe("Camiseta A");
    expect(p?.precoCentavos).toBe(5990);
    expect(p).not.toHaveProperty("custoCentavos");
    expect(JSON.stringify(p)).not.toContain("2500");
  });

  it("dono lê produtos com custo", async () => {
    const { deps } = criarMundo();
    const d = await criarContexto(deps, "dona.a@exemplo.com");
    const [p] = await d.ler("Produtos");
    expect(p?.custoCentavos).toBe(2500);
  });

  it("vendedor não recebe a comissão dos outros (aba Usuarios é só do dono)", async () => {
    const { deps } = criarMundo();
    const v = await criarContexto(deps, "vend.a@exemplo.com");
    await expect(v.ler("Usuarios")).rejects.toMatchObject({ codigo: "proibido" });
    expect(v.pode("comissao.todas")).toBe(false);
    expect(v.pode("comissao.propria")).toBe(true);
  });

  it("vendedor não cadastra produto, usuário nem configuração; pode cadastrar cliente", async () => {
    const { deps, driver } = criarMundo();
    const v = await criarContexto(deps, "vend.a@exemplo.com");
    await expect(
      v.acrescentar("Produtos", { nome: "X", categoria: "Y", tipo: "simples", custoCentavos: 1, precoCentavos: 2 }),
    ).rejects.toMatchObject({ codigo: "proibido" });
    await expect(
      v.acrescentar("Usuarios", { email: "a@b.co", nome: "Z", papel: "dono", ativo: true, comissaoPontosBase: 0 }),
    ).rejects.toMatchObject({ codigo: "proibido" });
    await expect(v.atualizar("Produtos", "P-A-1", () => ({ precoCentavos: 1 }))).rejects.toMatchObject({ codigo: "proibido" });
    expect(driver.chamadas.some((c) => c.tipo === "append" || c.tipo === "updateRow")).toBe(false);

    // Cliente novo só pela função de negócio (o vendedor nunca define limite de crediário).
    await expect(
      v.acrescentar("Clientes", { nome: "Maria", limiteCrediarioCentavos: 999999, consentimentoEm: "2026-01-01" }),
    ).rejects.toMatchObject({ codigo: "proibido" });
  });

  it("vendedor não passa nas permissões do dono", async () => {
    const { deps } = criarMundo();
    const v = await criarContexto(deps, "vend.a@exemplo.com");
    for (const p of ["caixa.ver", "contas.ver", "estoque.custo.ver", "config.editar", "usuarios.gerir", "auditoria.ver"] as const) {
      expect(() => v.exigir(p)).toThrowError(/permissão/);
    }
    expect(() => v.exigir("venda.criar")).not.toThrow();
  });

  it("ninguém, nem o dono, altera Movimentos/Caixa/CreditosLoja/Auditoria (só acréscimo)", async () => {
    const { deps } = criarMundo();
    const d = await criarContexto(deps, "dona.a@exemplo.com");
    for (const aba of ["Movimentos", "Caixa", "CreditosLoja", "Auditoria"] as const) {
      await expect(d.sistema.atualizar(aba, "C-A-1", () => ({}) as never)).rejects.toMatchObject({ codigo: "proibido" });
      await expect(d.sistema.remover(aba, "C-A-1")).rejects.toMatchObject({ codigo: "proibido" });
    }
  });

  it("mudança em Usuarios gera registro de auditoria sem dados pessoais", async () => {
    const { deps, driver } = criarMundo();
    const d = await criarContexto(deps, "dona.a@exemplo.com");
    await d.atualizar("Usuarios", "U-A-VEND", () => ({ comissaoPontosBase: 800 }));
    const auditoria = (await d.ler("Auditoria", { incluirRemovidos: true }))[0];
    expect(auditoria).toMatchObject({ acao: "alterar_cadastro", entidade: "Usuarios", entidadeId: "U-A-VEND", usuario: "U-A-DONO" });
    const crua = JSON.stringify(driver.planilhas.get("planilha-loja-A-0001")!.get("Auditoria"));
    expect(crua).not.toContain("@");
  });

  it("rotas do dono: o middleware reconhece os prefixos", () => {
    for (const p of PREFIXOS_SO_DONO) {
      expect(rotaSoDono(p)).toBe(true);
      expect(rotaSoDono(`${p}/qualquer`)).toBe(true);
    }
    expect(rotaSoDono("/")).toBe(false);
    expect(rotaSoDono("/caixaforte")).toBe(false);
  });

  it("todas as abas da loja têm regra de leitura definida", async () => {
    const { deps } = criarMundo();
    const d = await criarContexto(deps, "dona.a@exemplo.com");
    for (const aba of ABAS_NOMES) await expect(d.ler(aba)).resolves.toBeInstanceOf(Array);
  });
});
