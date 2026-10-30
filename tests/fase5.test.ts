import { describe, expect, it, vi } from "vitest";
import { fazerBackup } from "@/lib/core/backup";
import { cabecalhosDeSeguranca } from "@/lib/core/cabecalhos";
import { listarLojas } from "@/lib/core/contexto";
import { loginDeTesteAtivo, segredoDeTesteConfere } from "@/lib/core/e2e";
import { ipDe, limitar } from "@/lib/core/limite";
import { PERMISSOES, rotaSoDono } from "@/lib/core/permissoes";
import { bearerConfere } from "@/lib/core/segredo";
import { ABAS, type NomeAba } from "@/lib/core/schema";
import { buscarClientes, criarCliente, definirLimiteCrediario } from "@/lib/moda/clientes";
import { anonimizarCliente, exportarDadosCliente, NOME_ANONIMO } from "@/lib/moda/lgpd";
import { conferir, conferirLoja } from "@/lib/moda/reconciliacao";
import { CHAVE_BACKUP, rodarRotinaDiaria } from "@/lib/moda/rotina";
import { registrarVenda } from "@/lib/moda/venda";
import { LOJA_A, LOJA_B } from "./helpers/mundo";
import { configurar, darEstoque, prepararLoja } from "./helpers/loja";
import { DriverFalso } from "./helpers/fake-driver";

const BACKUP = "planilha-backup-0001";
const NOMES = Object.keys(ABAS) as NomeAba[];
const pix = (valorCentavos: number) => ({ forma: "pix" as const, valorCentavos, parcelas: 1 });

describe("cabeçalhos de segurança", () => {
  const mapa = (dev: boolean) => Object.fromEntries(cabecalhosDeSeguranca(dev).map((c) => [c.key, c.value]));
  it("em produção: CSP fechada, sem eval, sem frames, HSTS e nosniff", () => {
    const h = mapa(false);
    expect(h["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(h["Content-Security-Policy"]).not.toContain("unsafe-eval");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=31536000/);
  });
  it("em desenvolvimento libera eval só para o Next", () => {
    expect(mapa(true)["Content-Security-Policy"]).toContain("'unsafe-eval'");
  });
});

describe("limite de requisições", () => {
  const base = { janelaSeg: 60, max: 3, env: {} as Record<string, string | undefined> };
  it("deixa passar até o máximo e bloqueia o excedente, com tempo de espera", async () => {
    const o = { ...base, chave: "t1", agora: 1_000_000 };
    expect((await limitar(o)).ok).toBe(true);
    expect((await limitar(o)).ok).toBe(true);
    const terceira = await limitar(o);
    expect(terceira).toMatchObject({ ok: true, restante: 0 });
    const quarta = await limitar(o);
    expect(quarta.ok).toBe(false);
    expect(quarta.esperarSeg).toBeGreaterThanOrEqual(1);
    expect(quarta.esperarSeg).toBeLessThanOrEqual(60);
  });
  it("a contagem zera na janela seguinte e chaves diferentes não se misturam", async () => {
    for (let i = 0; i < 4; i++) await limitar({ ...base, chave: "t2", agora: 2_000_000 });
    expect((await limitar({ ...base, chave: "t2", agora: 2_000_000 + 61_000 })).ok).toBe(true);
    expect((await limitar({ ...base, chave: "t2-outra", agora: 2_000_000 })).ok).toBe(true);
  });
  it("com Upstash usa o Redis; se ele falhar, cai para a memória sem bloquear ninguém", async () => {
    const env = { UPSTASH_REDIS_REST_URL: "https://x.upstash.io", UPSTASH_REDIS_REST_TOKEN: "tok" };
    const ok = vi.fn(async () => new Response(JSON.stringify([{ result: 9 }, { result: 1 }]), { status: 200 }));
    expect((await limitar({ ...base, env, chave: "t3", agora: 3_000_000, fetchFn: ok as never })).ok).toBe(false);
    expect(ok).toHaveBeenCalledOnce();
    const cai = vi.fn(async () => {
      throw new Error("rede");
    });
    expect((await limitar({ ...base, env, chave: "t4", agora: 3_000_000, fetchFn: cai as never })).ok).toBe(true);
  });
  it("IP vem do primeiro item do x-forwarded-for", () => {
    expect(ipDe(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(ipDe(new Headers())).toBe("desconhecido");
  });
});

describe("segredos de rotina e de teste", () => {
  it("Bearer só confere com o segredo certo e longo", () => {
    const s = "segredo-bem-longo-123456";
    expect(bearerConfere(`Bearer ${s}`, s)).toBe(true);
    expect(bearerConfere(`Bearer outro-segredo-1234567`, s)).toBe(false);
    expect(bearerConfere(null, s)).toBe(false);
    expect(bearerConfere(`Bearer ${s}`, undefined)).toBe(false);
    expect(bearerConfere("Bearer curto", "curto")).toBe(false);
  });
  it("login de teste: desligado por padrão, nunca liga na Vercel, exige segredo certo", () => {
    const segredo = "x".repeat(30);
    expect(loginDeTesteAtivo({})).toBe(false);
    expect(loginDeTesteAtivo({ E2E_LOGIN_SECRET: "curto" })).toBe(false);
    expect(loginDeTesteAtivo({ E2E_LOGIN_SECRET: segredo })).toBe(true);
    expect(loginDeTesteAtivo({ E2E_LOGIN_SECRET: segredo, VERCEL: "1" })).toBe(false);
    expect(loginDeTesteAtivo({ E2E_LOGIN_SECRET: segredo, VERCEL_ENV: "production" })).toBe(false);
    expect(segredoDeTesteConfere(segredo, { E2E_LOGIN_SECRET: segredo })).toBe(true);
    expect(segredoDeTesteConfere("errado", { E2E_LOGIN_SECRET: segredo })).toBe(false);
    expect(segredoDeTesteConfere(segredo, { E2E_LOGIN_SECRET: segredo, VERCEL: "1" })).toBe(false);
  });
});

describe("backup", () => {
  function mundoComBackup() {
    const d = new DriverFalso();
    d.criarPlanilha(LOJA_A, Object.fromEntries(NOMES.map((n) => [n, [ABAS[n].cabecalhos, ["x"]]])));
    d.criarPlanilha(BACKUP, { Página1: [[]] });
    return d;
  }
  it("copia todas as abas com a data no nome e guarda só os últimos 7 dias", async () => {
    const d = mundoComBackup();
    for (const dia of ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"]) {
      await fazerBackup(d, { origemId: LOJA_A, backupId: BACKUP, hoje: dia });
    }
    const t = await d.titulosDeAbas(BACKUP);
    const dias = new Set(t.filter((x) => x.startsWith("bk-")).map((x) => x.slice(3, 13)));
    expect([...dias].sort()).toEqual(["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"]);
    expect(t).toContain("Página1");
    expect(t).toContain("bk-2026-10-08 Vendas");
    expect(t.filter((x) => x.startsWith("bk-2026-10-08 "))).toHaveLength(NOMES.length);
  });
  it("rodar duas vezes no mesmo dia não duplica; cópia incompleta é refeita", async () => {
    const d = mundoComBackup();
    const a = await fazerBackup(d, { origemId: LOJA_A, backupId: BACKUP, hoje: "2026-10-10" });
    const b = await fazerBackup(d, { origemId: LOJA_A, backupId: BACKUP, hoje: "2026-10-10" });
    expect(a).toMatchObject({ copiadas: NOMES.length, jaFeito: false });
    expect(b).toMatchObject({ copiadas: 0, jaFeito: true });
    await d.apagarAbas(BACKUP, ["bk-2026-10-10 Vendas"]);
    const c = await fazerBackup(d, { origemId: LOJA_A, backupId: BACKUP, hoje: "2026-10-10" });
    expect(c.copiadas).toBe(NOMES.length);
    expect((await d.titulosDeAbas(BACKUP)).filter((x) => x.startsWith("bk-2026-10-10 "))).toHaveLength(NOMES.length);
  });
  it("a cópia guarda os dados e não toca na planilha da loja; backup na própria loja é recusado", async () => {
    const d = mundoComBackup();
    d.planilhas.get(LOJA_A)!.get("Vendas")!.push(["V1"]);
    await fazerBackup(d, { origemId: LOJA_A, backupId: BACKUP, hoje: "2026-10-11" });
    expect(d.planilhas.get(BACKUP)!.get("bk-2026-10-11 Vendas")).toEqual(d.planilhas.get(LOJA_A)!.get("Vendas"));
    await expect(fazerBackup(d, { origemId: LOJA_A, backupId: LOJA_A, hoje: "2026-10-11" })).rejects.toThrow();
  });
  it("se a cópia falha, nenhuma cópia antiga é apagada", async () => {
    const d = mundoComBackup();
    await fazerBackup(d, { origemId: LOJA_A, backupId: BACKUP, hoje: "2026-10-01" });
    d.copiarAbas = async () => {
      throw new Error("cota");
    };
    await expect(fazerBackup(d, { origemId: LOJA_A, backupId: BACKUP, hoje: "2026-10-20" })).rejects.toThrow();
    expect((await d.titulosDeAbas(BACKUP)).some((x) => x.startsWith("bk-2026-10-01 "))).toBe(true);
  });
});

describe("conferência automática", () => {
  async function comVendas() {
    const L = await prepararLoja();
    await configurar(L.dono);
    await darEstoque(L.dono, L.v("M", "Azul"), 10);
    await darEstoque(L.dono, L.v("G", "Azul"), 10);
    const { clienteId } = await criarCliente(L.vend, { nome: "Maria da Silva", telefone: "(91) 98888-7777", consentimento: true });
    await definirLimiteCrediario(L.dono, clienteId, 100_000);
    const v1 = await registrarVenda(L.vend, { itens: [{ variacaoId: L.v("M", "Azul"), quantidade: 2 }], pagamentos: [pix(11980)] });
    const v2 = await registrarVenda(L.vend, {
      clienteId,
      itens: [{ variacaoId: L.v("G", "Azul"), quantidade: 1 }],
      pagamentos: [{ forma: "crediario", valorCentavos: 5990, parcelas: 2 }],
    });
    return { ...L, clienteId, v1, v2 };
  }
  const mexer = (L: { driver: DriverFalso }, aba: NomeAba, coluna: string, onde: (l: string[], cab: string[]) => boolean, valor: string) => {
    const m = L.driver.planilhas.get(LOJA_A)!.get(aba)!;
    const cab = m[0]!;
    const i = cab.indexOf(coluna);
    const linha = m.slice(1).find((l) => onde(l, cab))!;
    linha[i] = valor;
  };

  it("vendas reais (à vista e crediário) fecham sem divergência", async () => {
    const L = await comVendas();
    expect(await conferirLoja(L.dono.sistema)).toEqual([]);
  });
  it("detecta pagamento adulterado, estoque alterado, caixa alterado e vale negativo", async () => {
    const L = await comVendas();
    mexer(L, "Pagamentos", "valorCentavos", (l, c) => l[c.indexOf("vendaId")] === L.v1.vendaId, "100");
    mexer(L, "Movimentos", "quantidade", (l, c) => l[c.indexOf("origemId")] === L.v2.vendaId, "-5");
    mexer(L, "Caixa", "valorCentavos", (l, c) => l[c.indexOf("origemId")] === L.v1.vendaId && l[c.indexOf("categoria")] === "venda", "1");
    const regras = (await conferirLoja(L.dono.sistema)).map((d) => `${d.regra}:${d.id}`);
    expect(regras).toEqual(
      expect.arrayContaining([`venda_pagamentos:${L.v1.vendaId}`, `venda_estoque:${L.v2.vendaId}`, `caixa_venda:${L.v1.vendaId}`]),
    );
    const neg = conferir({ vendas: [], itens: [], pagamentos: [], movimentos: [], caixa: [], creditos: [{ clienteId: "C1", valorCentavos: -100 }] });
    expect(neg).toEqual([{ regra: "vale_negativo", id: "C1" }]);
  });
  it("venda estornada não entra na conferência", () => {
    const d = conferir({
      vendas: [{ id: "V", totalCentavos: 100, descontoCentavos: 0, status: "estornada" }],
      itens: [], pagamentos: [], movimentos: [], creditos: [], caixa: [],
    });
    expect(d).toEqual([]);
  });

  it("rotina diária: faz o backup da loja que tem planilha configurada, registra divergência e isola as lojas", async () => {
    const L = await comVendas();
    L.driver.criarPlanilha(BACKUP, { Página1: [[]] });
    await L.dono.sistema.acrescentar("Config", { chave: CHAVE_BACKUP, valor: BACKUP }, "U-A-DONO");
    mexer(L, "Pagamentos", "valorCentavos", (l, c) => l[c.indexOf("vendaId")] === L.v1.vendaId, "100");

    const r = await rodarRotinaDiaria(L.deps, new Date("2026-10-14T12:00:00Z"));
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ backup: "feito" });
    expect(r[0]!.divergencias).toBeGreaterThan(0);
    expect(r[1]).toMatchObject({ backup: "sem_planilha", divergencias: 0 });
    expect((await L.driver.titulosDeAbas(BACKUP)).some((t) => t.startsWith("bk-2026-10-14 "))).toBe(true);
    const acoes = (await L.dono.sistema.lerFresco("Auditoria")).map((a) => a.acao);
    expect(acoes).toContain("divergencia_venda_pagamentos");

    const de = await rodarRotinaDiaria(L.deps, new Date("2026-10-14T13:00:00Z"));
    expect(de[0]!.backup).toBe("ja_feito");
  });
  it("listarLojas só traz lojas ativas da mestra", async () => {
    const L = await prepararLoja();
    expect((await listarLojas(L.deps)).map((l) => l.planilhaId).sort()).toEqual([LOJA_A, LOJA_B].sort());
  });
});

describe("LGPD", () => {
  async function loja() {
    const L = await prepararLoja();
    await configurar(L.dono);
    await darEstoque(L.dono, L.v("M", "Azul"), 10);
    const { clienteId } = await criarCliente(L.vend, { nome: "Maria da Silva", telefone: "(91) 98888-7777", bairro: "Centro", consentimento: true });
    await definirLimiteCrediario(L.dono, clienteId, 100_000);
    await registrarVenda(L.vend, {
      clienteId,
      itens: [{ variacaoId: L.v("M", "Azul"), quantidade: 1 }],
      pagamentos: [{ forma: "crediario", valorCentavos: 5990, parcelas: 2 }],
    });
    return { ...L, clienteId };
  }
  it("só o dono exporta e apaga; vendedor é barrado", async () => {
    const L = await loja();
    expect(PERMISSOES.vendedor.has("lgpd.gerir")).toBe(false);
    expect(rotaSoDono("/lgpd")).toBe(true);
    await expect(exportarDadosCliente(L.vend, L.clienteId)).rejects.toMatchObject({ codigo: "proibido" });
    await expect(anonimizarCliente(L.vend, L.clienteId)).rejects.toMatchObject({ codigo: "proibido" });
  });
  it("exporta os dados do cliente (vendas, parcelas) e registra a auditoria sem dado pessoal", async () => {
    const L = await loja();
    const x = await exportarDadosCliente(L.dono, L.clienteId);
    expect(x.cliente).toMatchObject({ nome: "Maria da Silva", telefone: "(91) 98888-7777", bairro: "Centro" });
    expect(x.vendas).toHaveLength(1);
    expect(x.parcelas).toHaveLength(2);
    const aud = (await L.dono.sistema.lerFresco("Auditoria")).filter((a) => a.acao === "lgpd_exportar");
    expect(aud).toHaveLength(1);
    expect(JSON.stringify(aud)).not.toContain("Maria");
  });
  it("anonimiza: some nome, telefone e bairro (inclusive nas parcelas); vendas e valores permanecem", async () => {
    const L = await loja();
    await anonimizarCliente(L.dono, L.clienteId);
    const c = (await L.dono.sistema.lerFresco("Clientes")).find((x) => x.id === L.clienteId)!;
    expect(c).toMatchObject({ nome: NOME_ANONIMO, limiteCrediarioCentavos: 0 });
    expect(c.telefone).toBeUndefined();
    expect(c.bairro).toBeUndefined();
    const contas = (await L.dono.sistema.lerFresco("Contas")).filter((x) => x.parceiroId === L.clienteId);
    expect(contas.every((x) => x.parceiroNome === NOME_ANONIMO)).toBe(true);
    expect(contas.reduce((s, x) => s + x.valorCentavos, 0)).toBe(5990);
    expect((await L.dono.sistema.lerFresco("Vendas"))).toHaveLength(1);
    expect(await buscarClientes(L.dono, "Maria")).toHaveLength(0);
    expect((await conferirLoja(L.dono.sistema))).toEqual([]);
    await expect(exportarDadosCliente(L.dono, "ID-QUE-NAO-EXISTE-1")).rejects.toMatchObject({ codigo: "invalido" });
  });
  it("não alcança cliente de outra loja", async () => {
    const L = await loja();
    const outra = await (await import("@/lib/core/contexto")).criarContexto(L.deps, "dono.b@exemplo.com");
    await expect(anonimizarCliente(outra, L.clienteId)).rejects.toMatchObject({ codigo: "invalido" });
  });
});
