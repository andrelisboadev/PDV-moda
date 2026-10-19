import { ABAS, ABAS_NOMES, type NomeAba } from "./abas";
import { ABAS_MESTRA } from "@/lib/core/mestra";
import { escreverLinhaDef } from "@/lib/core/schema";
import { cacheMemoria } from "@/lib/core/sheets/cache";
import type { DepsContexto } from "@/lib/core/contexto";
import { DriverFalso } from "./fake-driver";

export const MESTRA = "mestra-0000000000";
export const LOJA_A = "planilha-loja-A-0001";
export const LOJA_B = "planilha-loja-B-0002";

const base = { versao: 1, criadoEm: "2026-01-01T00:00:00.000Z", criadoPor: "sistema" };

export function linhaLoja(aba: NomeAba, dados: Record<string, unknown>): string[] {
  return escreverLinhaDef(ABAS[aba], { ...base, ...dados });
}

function planilhaVazia(): Record<string, string[][]> {
  return Object.fromEntries(ABAS_NOMES.map((n) => [n, [ABAS[n].cabecalhos]]));
}

export interface UsuarioSeed {
  id: string;
  email: string;
  nome: string;
  papel: "dono" | "vendedor";
  ativo?: boolean;
}

function usuario(u: UsuarioSeed) {
  return linhaLoja("Usuarios", { ...u, ativo: u.ativo ?? true, comissaoPontosBase: 500 });
}

/** Cria duas lojas (A e B) e a planilha mestra. */
export function criarMundo() {
  const driver = new DriverFalso();
  const cache = cacheMemoria();
  const deps: DepsContexto = { driver, cache, masterId: MESTRA };

  const a = planilhaVazia();
  a.Usuarios!.push(
    usuario({ id: "U-A-DONO", email: "dona.a@exemplo.com", nome: "Dona A", papel: "dono" }),
    usuario({ id: "U-A-VEND", email: "vend.a@exemplo.com", nome: "Vendedora A", papel: "vendedor" }),
    usuario({ id: "U-A-OFF", email: "saiu.a@exemplo.com", nome: "Ex A", papel: "vendedor", ativo: false }),
  );
  a.Produtos!.push(
    linhaLoja("Produtos", {
      id: "P-A-1", nome: "Camiseta A", categoria: "Feminina", tipo: "grade", custoCentavos: 2500, precoCentavos: 5990,
    }),
  );
  a.Caixa!.push(
    linhaLoja("Caixa", {
      id: "C-A-1", data: "2026-01-02", tipo: "entrada", descricao: "Venda A", categoria: "venda",
      valorCentavos: 5990, forma: "pix",
    }),
  );

  const b = planilhaVazia();
  b.Usuarios!.push(
    usuario({ id: "U-B-DONO", email: "dono.b@exemplo.com", nome: "Dono B", papel: "dono" }),
    usuario({ id: "U-B-VEND", email: "vend.b@exemplo.com", nome: "Vendedor B", papel: "vendedor" }),
  );
  b.Produtos!.push(
    linhaLoja("Produtos", {
      id: "P-B-1", nome: "Camiseta B", categoria: "Masculina", tipo: "grade", custoCentavos: 3000, precoCentavos: 7990,
    }),
  );
  b.Caixa!.push(
    linhaLoja("Caixa", {
      id: "C-B-1", data: "2026-01-02", tipo: "entrada", descricao: "Venda B", categoria: "venda",
      valorCentavos: 7990, forma: "dinheiro",
    }),
  );

  const acesso = (email: string, planilhaId: string, ativo = true) =>
    escreverLinhaDef(ABAS_MESTRA.Acessos, { ...base, id: `AC-${email}`, email, planilhaId, ativo });
  const cliente = (nomeLoja: string, emailDono: string, planilhaId: string) =>
    escreverLinhaDef(ABAS_MESTRA.Clientes, { ...base, id: `CL-${planilhaId}`, nomeLoja, emailDono, planilhaId, plano: "basico", ativo: true });

  driver.criarPlanilha(MESTRA, {
    Clientes: [
      ABAS_MESTRA.Clientes.cabecalhos,
      cliente("Loja A", "dona.a@exemplo.com", LOJA_A),
      cliente("Loja B", "dono.b@exemplo.com", LOJA_B),
    ],
    Acessos: [
      ABAS_MESTRA.Acessos.cabecalhos,
      acesso("dona.a@exemplo.com", LOJA_A),
      acesso("vend.a@exemplo.com", LOJA_A),
      acesso("saiu.a@exemplo.com", LOJA_A),
      acesso("dono.b@exemplo.com", LOJA_B),
      acesso("vend.b@exemplo.com", LOJA_B),
      // Intruso: está na mestra apontando para a loja A, mas NÃO está na aba Usuarios da loja A.
      acesso("intruso@exemplo.com", LOJA_A),
    ],
  });
  driver.criarPlanilha(LOJA_A, a);
  driver.criarPlanilha(LOJA_B, b);

  return { driver, cache, deps };
}
