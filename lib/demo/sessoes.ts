import "server-only";
import { ABAS } from "@/lib/core/schema";
import { ABAS_MESTRA } from "@/lib/core/mestra";
import { cacheMemoria, type CacheLeitura } from "@/lib/core/sheets/cache";
import { DriverFalso } from "@/lib/core/sheets/memoria";
import { DEMO_EMAIL_DONO, DEMO_EMAIL_VENDEDOR, DEMO_LOJA_ID, DEMO_MESTRA_ID, semearDemo } from "./semente";
import { TAMANHO_MAX_SNAPSHOT } from "./modo";

/** Driver da demonstração: igual ao simulado dos testes, mas conta cada escrita (a "versão" do estado). */
export class DriverDemo extends DriverFalso {
  versao = 0;
  constructor() {
    super();
    this.registrar = false;
  }
  override async append(...a: Parameters<DriverFalso["append"]>) {
    await super.append(...a);
    this.versao++;
  }
  override async appendMultiplo(...a: Parameters<DriverFalso["appendMultiplo"]>) {
    await super.appendMultiplo(...a);
    this.versao++;
  }
  override async updateRow(...a: Parameters<DriverFalso["updateRow"]>) {
    await super.updateRow(...a);
    this.versao++;
  }
  override async updateRows(...a: Parameters<DriverFalso["updateRows"]>) {
    await super.updateRows(...a);
    this.versao++;
  }
}

export interface SessaoDemo {
  driver: DriverDemo;
  cache: CacheLeitura;
  ultimoAcesso: number;
}

export interface Snapshot {
  v: 1;
  versao: number;
  planilhas: Record<string, Record<string, string[][]>>;
}

const MAX_SESSOES = 200;
const OCIOSA_MS = 3 * 60 * 60 * 1000;
const g = globalThis as unknown as { __bmDemo?: Map<string, SessaoDemo>; __bmDemoSemeando?: Map<string, Promise<SessaoDemo>> };
const sessoes = (g.__bmDemo ??= new Map());
const semeando = (g.__bmDemoSemeando ??= new Map());

function limpar(agora: number) {
  for (const [k, s] of sessoes) if (agora - s.ultimoAcesso > OCIOSA_MS) sessoes.delete(k);
  while (sessoes.size >= MAX_SESSOES) {
    const antiga = [...sessoes.entries()].sort((a, b) => a[1].ultimoAcesso - b[1].ultimoAcesso)[0];
    if (!antiga) break;
    sessoes.delete(antiga[0]);
  }
}

/** Sessão da pessoa; se o servidor não a tem (primeira visita, reinício, outra instância), nasce com a loja de exemplo. */
export async function obterSessao(sid: string): Promise<SessaoDemo> {
  const agora = Date.now();
  const s = sessoes.get(sid);
  if (s) {
    s.ultimoAcesso = agora;
    return s;
  }
  const emCurso = semeando.get(sid);
  if (emCurso) return emCurso;
  const p = (async () => {
    limpar(agora);
    const driver = new DriverDemo();
    await semearDemo(driver);
    driver.versao = 0; // a semente não conta como "alteração da pessoa"
    const nova: SessaoDemo = { driver, cache: cacheMemoria(), ultimoAcesso: agora };
    sessoes.set(sid, nova);
    return nova;
  })().finally(() => semeando.delete(sid));
  semeando.set(sid, p);
  return p;
}

export function reiniciarSessao(sid: string) {
  sessoes.delete(sid);
}

export function exportar(s: SessaoDemo): Snapshot {
  const planilhas: Snapshot["planilhas"] = {};
  for (const [id, abas] of s.driver.planilhas) planilhas[id] = Object.fromEntries([...abas].map(([k, v]) => [k, v.map((l) => [...l])]));
  return { v: 1, versao: s.driver.versao, planilhas };
}

/* ------------------------------ restauração (vinda do navegador) ------------------------------ */

const ehTexto = (x: unknown): x is string => typeof x === "string" && x.length <= 4000;

/**
 * Valida um estado vindo do navegador ANTES de aceitar: só as duas planilhas da demonstração, só abas
 * conhecidas, cabeçalho idêntico ao do sistema, tudo texto e com tamanho limitado.
 * Devolve o snapshot limpo ou null. O estado só vale para a sessão de quem enviou.
 */
export function validarSnapshot(bruto: unknown): Snapshot | null {
  if (typeof bruto !== "object" || bruto === null) return null;
  const o = bruto as Record<string, unknown>;
  if (o.v !== 1 || typeof o.versao !== "number" || !Number.isInteger(o.versao) || o.versao < 0) return null;
  const pl = o.planilhas as Record<string, unknown> | undefined;
  if (typeof pl !== "object" || pl === null) return null;
  const esperado: Array<[string, Record<string, { cabecalhos: readonly string[] }>]> = [
    [DEMO_LOJA_ID, ABAS as never],
    [DEMO_MESTRA_ID, ABAS_MESTRA as never],
  ];
  if (Object.keys(pl).length !== esperado.length) return null;
  const saida: Snapshot["planilhas"] = {};
  let linhasTotal = 0;
  for (const [id, defs] of esperado) {
    const abas = pl[id] as Record<string, unknown> | undefined;
    if (typeof abas !== "object" || abas === null) return null;
    const nomes = Object.keys(defs);
    if (Object.keys(abas).length !== nomes.length) return null;
    const limpa: Record<string, string[][]> = {};
    for (const nome of nomes) {
      const linhas = abas[nome];
      if (!Array.isArray(linhas) || linhas.length < 1) return null;
      const cab = defs[nome]!.cabecalhos;
      const resultado: string[][] = [];
      for (let i = 0; i < linhas.length; i++) {
        const l = linhas[i];
        if (!Array.isArray(l) || l.length > 60 || !l.every(ehTexto)) return null;
        if (i === 0 && (l.length !== cab.length || l.some((c, k) => c !== cab[k]))) return null;
        resultado.push(l as string[]);
      }
      linhasTotal += resultado.length;
      if (linhasTotal > 20_000) return null;
      limpa[nome] = resultado;
    }
    saida[id] = limpa;
  }
  // Os dois perfis da demonstração precisam existir (senão a sessão ficaria sem acesso).
  const usuarios = saida[DEMO_LOJA_ID]!.Usuarios!.slice(1).map((l) => (l[ABAS.Usuarios.cabecalhos.indexOf("email")] ?? "").toLowerCase());
  if (!usuarios.includes(DEMO_EMAIL_DONO) || !usuarios.includes(DEMO_EMAIL_VENDEDOR)) return null;
  return { v: 1, versao: o.versao, planilhas: saida };
}

export function restaurar(sid: string, snap: Snapshot): SessaoDemo {
  const driver = new DriverDemo();
  for (const [id, abas] of Object.entries(snap.planilhas)) driver.criarPlanilha(id, abas);
  driver.versao = snap.versao;
  const s: SessaoDemo = { driver, cache: cacheMemoria(), ultimoAcesso: Date.now() };
  sessoes.set(sid, s);
  return s;
}

export { TAMANHO_MAX_SNAPSHOT };
