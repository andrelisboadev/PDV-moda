/**
 * Contexto da requisição: quem é a pessoa, de qual loja, com qual perfil.
 *
 * REGRA CENTRAL DE ISOLAMENTO: a loja (tenant) é descoberta aqui, a partir do e-mail da
 * sessão, e nunca de parâmetro, corpo ou URL. Todo acesso a dados passa por este objeto.
 */
import { ErroApp } from "./erros";
import { logErro } from "./log";
import {
  ABAS_MESTRA,
  DEFS_MESTRA,
  TENANT_MESTRA,
  type LinhaMestra,
} from "./mestra";
import {
  CAMPOS_OCULTOS_VENDEDOR,
  PODE_ESCREVER_GENERICO,
  PODE_LER,
  temPermissao,
  type Papel,
  type Permissao,
} from "./permissoes";
import { conferirCabecalhosDef, lerLinhaDef, type Linha, type NomeAba } from "./schema";
import { agoraSP } from "./tempo";
import { RepoTenant, type CamposAutomaticos, type DadosNovos, type DepsRepo } from "./sheets/repo";

export interface DepsContexto extends DepsRepo {
  masterId: string;
}

export interface UsuarioCtx {
  id: string;
  email: string;
  nome: string;
  papel: Papel;
  comissaoPontosBase: number;
}

const NEGADO = "Você não tem acesso a este sistema. Fale com a dona ou o dono da loja.";
const PROIBIDO = "Você não tem permissão para fazer isso.";

type Oculto = "custoCentavos" | "taxaCentavos";
/** Linha como o perfil enxerga: o vendedor não recebe custo nem taxa. */
export type LinhaVista<N extends NomeAba> = Omit<Linha<N>, Oculto> &
  Partial<Pick<Linha<N>, Extract<keyof Linha<N>, Oculto>>>;

/* ------------------------------ planilha mestra ------------------------------ */

interface Mestra {
  clientes: LinhaMestra<"Clientes">[];
  acessos: LinhaMestra<"Acessos">[];
}

async function lerMestra(deps: DepsContexto): Promise<Mestra> {
  return deps.cache.obter(TENANT_MESTRA, "mestra", async () => {
    const nomes = DEFS_MESTRA.map((d) => d.nome);
    const [cab, dados] = await Promise.all([
      deps.driver.cabecalhos(deps.masterId, nomes),
      deps.driver.batchGet(deps.masterId, nomes),
    ]);
    const problemas = DEFS_MESTRA.flatMap((d) => conferirCabecalhosDef(d, cab[d.nome]));
    if (problemas.length > 0) {
      logErro("mestra", new ErroApp("planilha_invalida", problemas.join(" | ")));
      throw new ErroApp("planilha_invalida", "Configuração do sistema incompleta. Fale com o suporte.");
    }
    const linhas = <N extends keyof typeof ABAS_MESTRA>(n: N) =>
      (dados[n] ?? [])
        .slice(1)
        .filter((v) => v.some((c) => c !== ""))
        .map((v) => lerLinhaDef(ABAS_MESTRA[n], v) as LinhaMestra<N>);
    return { clientes: linhas("Clientes"), acessos: linhas("Acessos") };
  });
}

/**
 * Lojas ativas, para as rotinas automáticas (backup, conferência). NÃO usar em tela:
 * mostra todas as lojas, então só roda em rota protegida por segredo (cron).
 */
export async function listarLojas(deps: DepsContexto): Promise<Array<{ planilhaId: string; nomeLoja: string }>> {
  const { clientes } = await lerMestra(deps);
  return clientes.filter((c) => c.ativo && !c.removidoEm).map((c) => ({ planilhaId: c.planilhaId, nomeLoja: c.nomeLoja }));
}

/* ---------------------------------- contexto ---------------------------------- */

export class Contexto {
  constructor(
    readonly tenantId: string,
    readonly plano: string,
    readonly nomeLoja: string,
    readonly usuario: UsuarioCtx,
    private readonly repo: RepoTenant,
  ) {}

  /** Lança se o perfil não tem a permissão. Chamar no começo de TODA ação de servidor. */
  exigir(p: Permissao): void {
    if (!temPermissao(this.usuario.papel, p)) throw new ErroApp("proibido", PROIBIDO);
  }

  pode(p: Permissao): boolean {
    return temPermissao(this.usuario.papel, p);
  }

  /** Leitura genérica: confere o perfil e remove custo/taxa do vendedor. */
  async ler<N extends NomeAba>(aba: N, opts: { incluirRemovidos?: boolean } = {}): Promise<LinhaVista<N>[]> {
    if (!PODE_LER(this.usuario.papel, aba)) throw new ErroApp("proibido", PROIBIDO);
    const linhas = await this.repo.ler(aba, opts);
    const ocultos = this.usuario.papel === "dono" ? undefined : CAMPOS_OCULTOS_VENDEDOR[aba];
    if (!ocultos) return linhas as LinhaVista<N>[];
    return linhas.map((l) => {
      const c = { ...(l as Record<string, unknown>) };
      for (const campo of ocultos) delete c[campo];
      return c as LinhaVista<N>;
    });
  }

  /** Cadastro genérico. Abas de registro (vendas, estoque, caixa) só pelas funções de negócio. */
  async acrescentar<N extends NomeAba>(aba: N, dados: DadosNovos<N>): Promise<Linha<N>> {
    this.conferirEscrita(aba);
    const nova = await this.repo.acrescentar(aba, dados, this.usuario.id);
    await this.auditarCadastro("criar", aba, (nova as { id: string }).id);
    return nova;
  }

  async atualizar<N extends NomeAba>(
    aba: N,
    id: string,
    mutador: (atual: Linha<N>) => Partial<Omit<Linha<N>, CamposAutomaticos>>,
  ): Promise<Linha<N>> {
    this.conferirEscrita(aba);
    const nova = await this.repo.atualizar(aba, id, mutador);
    await this.auditarCadastro("alterar", aba, id);
    return nova;
  }

  async remover<N extends NomeAba>(aba: N, id: string): Promise<Linha<N>> {
    this.conferirEscrita(aba);
    const nova = await this.repo.remover(aba, id);
    await this.auditarCadastro("remover", aba, id);
    return nova;
  }

  /**
   * Acesso sem a trava de abas, para as FUNÇÕES DE NEGÓCIO (venda, estoque, caixa...).
   * Quem usa deve chamar `ctx.exigir(...)` antes e `ctx.auditar(...)` depois.
   * Nunca expor a uma rota diretamente.
   */
  get sistema(): RepoTenant {
    return this.repo;
  }

  /** Registro em Auditoria (só acréscimo). Guarda o ID do usuário, nunca dados pessoais. */
  async auditar(acao: string, entidade: string, entidadeId?: string): Promise<void> {
    await this.repo.acrescentar(
      "Auditoria",
      { quando: agoraSP(), usuario: this.usuario.id, acao, entidade, entidadeId },
      this.usuario.id,
    );
  }

  private conferirEscrita(aba: NomeAba) {
    if (!PODE_ESCREVER_GENERICO(this.usuario.papel, aba)) throw new ErroApp("proibido", PROIBIDO);
  }

  private async auditarCadastro(acao: string, aba: NomeAba, id: string) {
    // Mudança de usuários, papéis e configurações sempre deixa rastro.
    if (aba === "Usuarios" || aba === "Config") await this.auditar(`${acao}_cadastro`, aba, id);
  }
}

/**
 * Descobre loja, plano e perfil a partir do e-mail da sessão.
 * Falha com a mesma mensagem genérica em todos os casos de recusa (não revela se o e-mail existe).
 */
export async function criarContexto(deps: DepsContexto, emailDaSessao: string): Promise<Contexto> {
  const email = emailDaSessao.trim().toLowerCase();
  if (!email) throw new ErroApp("nao_autenticado", NEGADO);

  const { clientes, acessos } = await lerMestra(deps);

  const planilhas = new Set(
    acessos
      .filter((a) => a.ativo && !a.removidoEm && a.email.toLowerCase() === email)
      .map((a) => a.planilhaId),
  );
  if (planilhas.size !== 1) {
    // 0 = sem acesso; >1 = e-mail em duas lojas (ambíguo): recusamos em vez de adivinhar.
    if (planilhas.size > 1) logErro("acesso", new ErroApp("proibido", "e-mail em mais de uma loja"));
    throw new ErroApp("proibido", NEGADO);
  }
  const tenantId = [...planilhas][0] as string;

  const cliente = clientes.find((c) => c.planilhaId === tenantId && c.ativo && !c.removidoEm);
  if (!cliente) throw new ErroApp("proibido", NEGADO);

  const repo = new RepoTenant(tenantId, deps);
  await repo.garantirCabecalhos();

  // A aba Usuarios da loja é a fonte de verdade: estar na mestra não basta.
  const usuarios = await repo.ler("Usuarios");
  const u = usuarios.find((x) => x.ativo && x.email.toLowerCase() === email);
  if (!u) throw new ErroApp("proibido", NEGADO);

  return new Contexto(
    tenantId,
    cliente.plano,
    cliente.nomeLoja,
    { id: u.id, email, nome: u.nome, papel: u.papel, comissaoPontosBase: u.comissaoPontosBase },
    repo,
  );
}
