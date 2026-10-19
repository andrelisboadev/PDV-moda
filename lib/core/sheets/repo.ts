import { ulid } from "ulid";
import { ErroApp } from "../erros";
import { logErro } from "../log";
import { agoraSP } from "../tempo";
import {
  ABAS,
  conferirCabecalhos,
  linhaParaObjeto,
  objetoParaLinha,
  type Linha,
  type NomeAba,
} from "../schema";
import type { CacheLeitura } from "./cache";
import type { SheetsDriver } from "./driver";

export interface DepsRepo {
  driver: SheetsDriver;
  cache: CacheLeitura;
}

/** Campos que o servidor preenche sozinho. Quem chama nunca informa. */
export type CamposAutomaticos = "id" | "versao" | "criadoEm" | "criadoPor" | "removidoEm";
export type DadosNovos<N extends NomeAba> = Omit<Linha<N>, CamposAutomaticos>;

const MAX_TENTATIVAS_VERSAO = 3;
const agoraIso = () => agoraSP();

/**
 * Acesso bruto à planilha de UMA loja. O ID da planilha é fixado na construção e vem
 * sempre da sessão (resolvido em contexto.ts). Nenhum método recebe ID de planilha,
 * então é impossível apontar para outra loja por parâmetro.
 *
 * Este objeto NÃO confere perfil: quem o usa (o Contexto) é que confere.
 */
export class RepoTenant {
  constructor(
    readonly tenantId: string,
    private readonly deps: DepsRepo,
  ) {}

  /** Recusa operar se os cabeçalhos da planilha não baterem com o schema. */
  async garantirCabecalhos(): Promise<void> {
    const nomes = Object.keys(ABAS) as NomeAba[];
    const problemas = await this.deps.cache.obter(this.tenantId, "cabecalhos", async () => {
      const lidos = await this.deps.driver.cabecalhos(this.tenantId, nomes);
      return nomes.flatMap((n) => conferirCabecalhos(n, lidos[n]));
    });
    if (problemas.length > 0) {
      logErro("cabecalhos", new ErroApp("planilha_invalida", problemas.join(" | ")));
      throw new ErroApp("planilha_invalida", "A planilha da loja está fora do formato esperado. Fale com o suporte.");
    }
  }

  private converter<N extends NomeAba>(aba: N, matriz: string[][]) {
    const linhas: Array<{ linha: Linha<N>; numero: number }> = [];
    matriz.forEach((valores, i) => {
      if (i === 0) return; // cabeçalho
      if (valores.every((v) => v === "")) return; // linha em branco
      linhas.push({ linha: linhaParaObjeto(aba, valores), numero: i + 1 });
    });
    return linhas;
  }

  /** Leitura com cache de 30 s. Exclusão lógica: linhas com removidoEm ficam de fora. */
  async ler<N extends NomeAba>(aba: N, opts: { incluirRemovidos?: boolean } = {}): Promise<Linha<N>[]> {
    const matriz = await this.deps.cache.obter(this.tenantId, `aba:${aba}`, async () => {
      const r = await this.deps.driver.batchGet(this.tenantId, [aba]);
      return r[aba] ?? [];
    });
    const todas = this.converter(aba, matriz).map((x) => x.linha);
    return opts.incluirRemovidos ? todas : todas.filter((l) => !(l as { removidoEm?: string }).removidoEm);
  }

  /**
   * Leitura SEM cache, na ordem das linhas da planilha. Usada onde a decisão depende do dado
   * mais novo possível (conferência de estoque na venda). Custa uma leitura da cota.
   */
  async lerFresco<N extends NomeAba>(aba: N, opts: { incluirRemovidos?: boolean } = {}): Promise<Linha<N>[]> {
    const r = await this.deps.driver.batchGet(this.tenantId, [aba]);
    const todas = this.converter(aba, r[aba] ?? []).map((x) => x.linha);
    return opts.incluirRemovidos ? todas : todas.filter((l) => !(l as { removidoEm?: string }).removidoEm);
  }

  /** Acrescenta uma linha nova. id, versao, criadoEm e criadoPor são do servidor. */
  async acrescentar<N extends NomeAba>(
    aba: N,
    dados: DadosNovos<N>,
    criadoPor: string,
    id?: string,
  ): Promise<Linha<N>> {
    const [nova] = await this.acrescentarVarios(aba, [{ dados, id }], criadoPor);
    return nova as Linha<N>;
  }

  /**
   * Acrescenta várias linhas em UMA chamada ao Google (o Sheets grava o bloco inteiro de uma vez).
   * Todas são validadas antes de enviar: se uma for inválida, nenhuma é gravada.
   * `id` só pode ser informado por código de servidor (ex.: ID da venda gerado antes).
   */
  async acrescentarVarios<N extends NomeAba>(
    aba: N,
    itens: Array<{ dados: DadosNovos<N>; id?: string }>,
    criadoPor: string,
  ): Promise<Linha<N>[]> {
    if (itens.length === 0) return [];
    const agora = agoraSP();
    const linhas = itens.map(({ dados, id }) =>
      objetoParaLinha(aba, {
        ...(dados as Record<string, unknown>),
        id: id ?? ulid(),
        versao: 1,
        criadoEm: agora,
        criadoPor,
        removidoEm: undefined,
      }),
    );
    await this.deps.driver.append(this.tenantId, aba, linhas);
    await this.deps.cache.invalidar(this.tenantId);
    return linhas.map((l) => linhaParaObjeto(aba, l));
  }

  /**
   * Grava linhas em VÁRIAS abas numa única chamada atômica: ou entra tudo ou não entra nada.
   * É o que fecha uma venda (Vendas + VendaItens + Pagamentos + Caixa + Auditoria) sem deixar
   * registro pela metade, e gasta uma só requisição da cota. Todas as linhas são validadas
   * (strict) antes de enviar. Só para código de servidor.
   */
  async acrescentarAtomico(
    blocos: Array<{ aba: NomeAba; itens: Array<{ dados: Record<string, unknown>; id?: string }> }>,
    criadoPor: string,
  ): Promise<void> {
    const agora = agoraSP();
    const envio = blocos
      .filter((b) => b.itens.length > 0)
      .map((b) => ({
        aba: b.aba as string,
        linhas: b.itens.map(({ dados, id }) =>
          objetoParaLinha(b.aba, {
            ...dados,
            id: id ?? ulid(),
            versao: 1,
            criadoEm: agora,
            criadoPor,
            removidoEm: undefined,
          }),
        ),
      }));
    if (envio.length === 0) return;
    await this.deps.driver.appendMultiplo(this.tenantId, envio);
    await this.deps.cache.invalidar(this.tenantId);
  }

  /**
   * Edita um cadastro com conferência de versão (até 3 tentativas).
   * O Sheets não tem compare-and-set: conferimos a versão da linha logo antes de gravar,
   * o que reduz muito, mas não elimina, a chance de duas pessoas gravarem ao mesmo tempo.
   * Por isso dinheiro e estoque NUNCA passam por aqui (são só de acréscimo).
   */
  async atualizar<N extends NomeAba>(
    aba: N,
    id: string,
    mutador: (atual: Linha<N>) => Partial<Omit<Linha<N>, CamposAutomaticos>>,
  ): Promise<Linha<N>> {
    if (ABAS[aba].somenteAcrescimo) {
      throw new ErroApp("proibido", "Este registro não pode ser alterado.");
    }
    const indiceVersao = ABAS[aba].cabecalhos.indexOf("versao");
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_VERSAO; tentativa++) {
      const r = await this.deps.driver.batchGet(this.tenantId, [aba]); // leitura fresca, sem cache
      const achado = this.converter(aba, r[aba] ?? []).find(
        (x) => (x.linha as { id: string }).id === id && !(x.linha as { removidoEm?: string }).removidoEm,
      );
      if (!achado) throw new ErroApp("invalido", "Registro não encontrado.");
      const atual = achado.linha as Record<string, unknown> & { versao: number };

      const novo = {
        ...atual,
        ...(mutador(achado.linha) as Record<string, unknown>),
        id, // não mudam, mesmo que o mutador tente
        criadoEm: atual.criadoEm,
        criadoPor: atual.criadoPor,
        versao: atual.versao + 1,
      };
      const valores = objetoParaLinha(aba, novo);

      const naPlanilha = await this.deps.driver.lerLinha(this.tenantId, aba, achado.numero);
      if (naPlanilha[0] !== id || naPlanilha[indiceVersao] !== String(atual.versao)) continue; // mudou: tenta de novo

      await this.deps.driver.updateRow(this.tenantId, aba, achado.numero, valores);
      await this.deps.cache.invalidar(this.tenantId);
      return linhaParaObjeto(aba, valores);
    }
    throw new ErroApp("conflito", "Outra pessoa alterou este registro agora. Confira e tente de novo.");
  }

  /**
   * Edita VÁRIAS linhas de uma aba com conferência de versão, gravando tudo numa só requisição.
   * O mutador pode lançar erro para recusar (ex.: item que já foi resolvido). Se alguma linha mudou
   * entre a leitura e a gravação, nada é gravado e o erro é de conflito. Só cadastros (nunca livros).
   */
  async atualizarVarias<N extends NomeAba>(
    aba: N,
    ids: string[],
    mutador: (atual: Linha<N>) => Partial<Omit<Linha<N>, CamposAutomaticos>>,
  ): Promise<Linha<N>[]> {
    if (ABAS[aba].somenteAcrescimo) throw new ErroApp("proibido", "Este registro não pode ser alterado.");
    if (ids.length === 0) return [];
    const unicos = [...new Set(ids)];
    const indiceVersao = ABAS[aba].cabecalhos.indexOf("versao");
    const r = await this.deps.driver.batchGet(this.tenantId, [aba]); // leitura fresca
    const lidas = this.converter(aba, r[aba] ?? []);
    const grava: Array<{ numero: number; valores: string[]; id: string; versao: number }> = [];
    for (const id of unicos) {
      const achado = lidas.find(
        (x) => (x.linha as { id: string }).id === id && !(x.linha as { removidoEm?: string }).removidoEm,
      );
      if (!achado) throw new ErroApp("invalido", "Registro não encontrado.");
      const atual = achado.linha as Record<string, unknown> & { versao: number };
      const valores = objetoParaLinha(aba, {
        ...atual,
        ...(mutador(achado.linha) as Record<string, unknown>),
        id,
        criadoEm: atual.criadoEm,
        criadoPor: atual.criadoPor,
        versao: atual.versao + 1,
      });
      grava.push({ numero: achado.numero, valores, id, versao: atual.versao });
    }
    // confere a versão de cada linha logo antes de gravar
    for (const g of grava) {
      const naPlanilha = await this.deps.driver.lerLinha(this.tenantId, aba, g.numero);
      if (naPlanilha[0] !== g.id || naPlanilha[indiceVersao] !== String(g.versao)) {
        throw new ErroApp("conflito", "Outra pessoa alterou este registro agora. Confira e tente de novo.");
      }
    }
    await this.deps.driver.updateRows(this.tenantId, aba, grava.map((g) => ({ numero: g.numero, valores: g.valores })));
    await this.deps.cache.invalidar(this.tenantId);
    return grava.map((g) => linhaParaObjeto(aba, g.valores));
  }

  /** Exclusão lógica (nunca apaga linha). */
  remover<N extends NomeAba>(aba: N, id: string): Promise<Linha<N>> {
    return this.atualizar(aba, id, () => ({ removidoEm: agoraIso() }) as never);
  }
}
