/**
 * Perfis e permissões. Esta é a ÚNICA fonte de regras de acesso.
 * O servidor aplica em toda ação; a tela apenas esconde o que não cabe ao perfil.
 */
import type { NomeAba } from "./schema";

export type Papel = "dono" | "vendedor";

export type Permissao =
  | "estoque.ver"
  | "venda.criar"
  | "cliente.gerir"
  | "condicional.gerir"
  | "comissao.propria"
  | "troca.registrar"
  | "estoque.custo.ver" // custo e margem
  | "estoque.gerir"
  | "caixa.ver"
  | "contas.ver"
  | "compras.gerir"
  | "comissao.todas"
  | "config.editar"
  | "usuarios.gerir"
  | "auditoria.ver"
  | "troca.estorno" // devolver dinheiro ao cliente
  | "lgpd.gerir" // exportar e apagar dados pessoais de um cliente
  | "crediario.limite"; // definir o limite de crediário de cada cliente

const DO_VENDEDOR: Permissao[] = [
  "estoque.ver",
  "venda.criar",
  "cliente.gerir",
  "condicional.gerir",
  "comissao.propria",
  "troca.registrar",
];

const SO_DONO: Permissao[] = [
  "estoque.custo.ver",
  "estoque.gerir",
  "caixa.ver",
  "contas.ver",
  "compras.gerir",
  "comissao.todas",
  "config.editar",
  "usuarios.gerir",
  "auditoria.ver",
  "troca.estorno",
  "crediario.limite",
  "lgpd.gerir",
];

export const PERMISSOES: Record<Papel, ReadonlySet<Permissao>> = {
  vendedor: new Set(DO_VENDEDOR),
  dono: new Set<Permissao>([...DO_VENDEDOR, ...SO_DONO]),
};

export const temPermissao = (papel: Papel, p: Permissao) => PERMISSOES[papel].has(p);

/** Quem pode LER cada aba pelo acesso genérico `ctx.ler`. */
const SO_DONO_LER: NomeAba[] = [
  "Fornecedores", "Compras", "CompraItens", "Contas", "Caixa", "Usuarios", "Auditoria", "Config",
];
export const PODE_LER = (papel: Papel, aba: NomeAba): boolean =>
  papel === "dono" || !SO_DONO_LER.includes(aba);

/** Campos que o vendedor nunca recebe (custo e margem). Removidos no servidor. */
export const CAMPOS_OCULTOS_VENDEDOR: Partial<Record<NomeAba, string[]>> = {
  Produtos: ["custoCentavos"],
  VendaItens: ["custoCentavos"],
  Pagamentos: ["taxaCentavos"],
};

/**
 * Quem pode ESCREVER cada aba pelo acesso genérico `ctx.acrescentar` / `ctx.atualizar`.
 * Abas de registro (Movimentos, Caixa, Vendas, ...) NÃO estão aqui de propósito: elas só
 * são escritas por funções de negócio (Fase 2 em diante) via `ctx.sistema`, depois de
 * conferir a permissão da ação.
 */
const ESCRITA_GENERICA: Partial<Record<NomeAba, Papel[]>> = {
  // Clientes: criação pela função de negócio (o vendedor nunca define limite de crediário)
  Clientes: ["dono"],
  Produtos: ["dono"],
  Variacoes: ["dono"],
  Fornecedores: ["dono"],
  Usuarios: ["dono"],
  Config: ["dono"],
};
export const PODE_ESCREVER_GENERICO = (papel: Papel, aba: NomeAba): boolean =>
  ESCRITA_GENERICA[aba]?.includes(papel) ?? false;

/** Rotas que só o dono abre. Usado no middleware (reforço) e nas páginas. */
export const PREFIXOS_SO_DONO = [
  "/configuracoes",
  "/lgpd",
  "/caixa",
  "/contas",
  "/comissoes",
  "/compras",
  "/estoque/novo",
  "/estoque/ajustar",
];
export const rotaSoDono = (caminho: string) =>
  PREFIXOS_SO_DONO.some((p) => caminho === p || caminho.startsWith(`${p}/`));
