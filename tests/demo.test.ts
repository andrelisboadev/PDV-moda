import { describe, expect, it } from "vitest";
import { criarContexto } from "@/lib/core/contexto";
import { DEMO_EMAIL_DONO, DEMO_EMAIL_VENDEDOR, DEMO_LOJA_ID, DEMO_MESTRA_ID } from "@/lib/demo/semente";
import { demoAtivo, papelValido, sessaoValida } from "@/lib/demo/modo";
import { DriverDemo, exportar, validarSnapshot } from "@/lib/demo/sessoes";
import { semearDemo } from "@/lib/demo/semente";
import { cacheMemoria } from "@/lib/core/sheets/cache";
import { conferirLoja } from "@/lib/moda/reconciliacao";
import { registrarVenda } from "@/lib/moda/venda";
import { montarCatalogo } from "@/lib/moda/estoque";

async function novaSessao() {
  const driver = new DriverDemo();
  const { dono } = await semearDemo(driver);
  driver.versao = 0;
  return { driver, dono, cache: cacheMemoria() };
}

describe("modo demonstração", () => {
  it("só liga em projeto sem credenciais reais", () => {
    expect(demoAtivo({ DEMO_ATIVO: "1" })).toBe(true);
    expect(demoAtivo({})).toBe(false);
    expect(demoAtivo({ DEMO_ATIVO: "1", MASTER_SHEET_ID: "abc" })).toBe(false);
    expect(demoAtivo({ DEMO_ATIVO: "1", GOOGLE_SERVICE_ACCOUNT_B64: "x" })).toBe(false);
    expect(demoAtivo({ DEMO_ATIVO: "true" })).toBe(false);
  });

  it("valida cookies", () => {
    expect(sessaoValida(crypto.randomUUID())).toBe(true);
    expect(sessaoValida("../etc/passwd")).toBe(false);
    expect(papelValido("dono")).toBe(true);
    expect(papelValido("admin")).toBe(false);
  });

  it("a loja de exemplo fecha as contas e tem os dois perfis", async () => {
    const { driver, dono } = await novaSessao();
    expect(await conferirLoja(dono.sistema)).toEqual([]);
    const deps = { driver, cache: cacheMemoria(), masterId: DEMO_MESTRA_ID };
    expect((await criarContexto(deps, DEMO_EMAIL_VENDEDOR)).usuario.papel).toBe("vendedor");
    expect((await criarContexto(deps, DEMO_EMAIL_DONO)).usuario.papel).toBe("dono");
  });

  it("conta alterações (versão) e a semente não conta", async () => {
    const { driver, dono } = await novaSessao();
    expect(driver.versao).toBe(0);
    const p = (await montarCatalogo(dono, { fresco: true })).find((x) => x.nome === "Brinco Argola")!;
    await registrarVenda(dono, { itens: [{ variacaoId: p.variacoes[0]!.id, quantidade: 1 }], pagamentos: [{ forma: "pix", valorCentavos: p.variacoes[0]!.precoCentavos, parcelas: 1 }] });
    expect(driver.versao).toBeGreaterThan(0);
  });

  it("exporta, valida e restaura sem perder nada", async () => {
    const { driver } = await novaSessao();
    const snap = exportar({ driver, cache: cacheMemoria(), ultimoAcesso: 0 });
    const volta = validarSnapshot(JSON.parse(JSON.stringify(snap)));
    expect(volta).not.toBeNull();
    expect(volta!.planilhas).toEqual(snap.planilhas);
  });

  it("recusa estado estragado ou malicioso", async () => {
    const { driver } = await novaSessao();
    const base = () => JSON.parse(JSON.stringify(exportar({ driver, cache: cacheMemoria(), ultimoAcesso: 0 })));
    expect(validarSnapshot(null)).toBeNull();
    expect(validarSnapshot("texto")).toBeNull();
    expect(validarSnapshot({ ...base(), v: 2 })).toBeNull();
    expect(validarSnapshot({ ...base(), versao: -1 })).toBeNull();

    const outraPlanilha = base();
    outraPlanilha.planilhas["planilha-de-cliente-real"] = outraPlanilha.planilhas[DEMO_LOJA_ID];
    expect(validarSnapshot(outraPlanilha)).toBeNull();

    const cabecalhoTrocado = base();
    cabecalhoTrocado.planilhas[DEMO_LOJA_ID].Produtos[0][0] = "outra";
    expect(validarSnapshot(cabecalhoTrocado)).toBeNull();

    const semAba = base();
    delete semAba.planilhas[DEMO_LOJA_ID].Caixa;
    expect(validarSnapshot(semAba)).toBeNull();

    const celulaNaoTexto = base();
    celulaNaoTexto.planilhas[DEMO_LOJA_ID].Produtos.push([123]);
    expect(validarSnapshot(celulaNaoTexto)).toBeNull();

    const semUsuarios = base();
    semUsuarios.planilhas[DEMO_LOJA_ID].Usuarios = [semUsuarios.planilhas[DEMO_LOJA_ID].Usuarios[0]];
    expect(validarSnapshot(semUsuarios)).toBeNull();

    const gigante = base();
    gigante.planilhas[DEMO_LOJA_ID].Auditoria.push(...Array.from({ length: 21_000 }, () => ["x"]));
    expect(validarSnapshot(gigante)).toBeNull();
  });
});
