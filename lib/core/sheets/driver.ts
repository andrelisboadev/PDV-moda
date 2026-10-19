/**
 * Contrato mínimo com o Google Sheets. Toda a aplicação fala com esta interface,
 * nunca com a biblioteca do Google. Isso permite simular nos testes e, se um dia
 * o Sheets não aguentar, trocar a camada de dados (ex.: Supabase) sem mexer nas regras.
 */
export interface SheetsDriver {
  /** Lê abas inteiras (inclui a linha 1). */
  batchGet(spreadsheetId: string, abas: string[]): Promise<Record<string, string[][]>>;
  /** Lê só a linha 1 (cabeçalho) de cada aba. */
  cabecalhos(spreadsheetId: string, abas: string[]): Promise<Record<string, string[]>>;
  /** Lê uma única linha (número 1-based da planilha). Usada para conferir a versão antes de gravar. */
  lerLinha(spreadsheetId: string, aba: string, numeroLinha: number): Promise<string[]>;
  /** Acrescenta linhas ao fim da aba. SEMPRE com valueInputOption=RAW. */
  append(spreadsheetId: string, aba: string, linhas: string[][]): Promise<void>;
  /** Substitui uma linha inteira (número 1-based da planilha). SEMPRE RAW. */
  updateRow(spreadsheetId: string, aba: string, numeroLinha: number, valores: string[]): Promise<void>;
  /** Substitui várias linhas de uma aba numa só chamada (conta como uma requisição). SEMPRE RAW. */
  updateRows(spreadsheetId: string, aba: string, linhas: Array<{ numero: number; valores: string[] }>): Promise<void>;
  /**
   * Acrescenta linhas em VÁRIAS abas numa única chamada ATÔMICA (tudo grava ou nada grava) e que
   * conta como uma só requisição na cota. Texto sempre como texto, nunca como fórmula.
   */
  appendMultiplo(spreadsheetId: string, blocos: BlocoAppend[]): Promise<void>;
}

export interface BlocoAppend {
  aba: string;
  linhas: string[][];
}

export class ErroCota extends Error {
  readonly status = 429;
  constructor() {
    super("Cota do Google Sheets excedida");
  }
}

export interface OpcoesRetry {
  tentativas?: number;
  baseMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function eCota(e: unknown): boolean {
  if (e instanceof ErroCota) return true;
  const x = e as { status?: number; code?: number } | null;
  return x?.status === 429 || x?.code === 429;
}

/** Espera exponencial para erro 429 (cota). Outros erros sobem direto. */
export async function comRetryCota<T>(fn: () => Promise<T>, o: OpcoesRetry = {}): Promise<T> {
  const max = o.tentativas ?? 5;
  const base = o.baseMs ?? 500;
  const sleep = o.sleep ?? dormir;
  let ultimo: unknown;
  for (let i = 0; i < max; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!eCota(e)) throw e;
      ultimo = e;
      if (i < max - 1) await sleep(base * 2 ** i + Math.floor(Math.random() * 100));
    }
  }
  throw ultimo;
}

/** Envolve um driver com retry de cota. */
export function driverComRetry(inner: SheetsDriver, o: OpcoesRetry = {}): SheetsDriver {
  return {
    batchGet: (id, abas) => comRetryCota(() => inner.batchGet(id, abas), o),
    cabecalhos: (id, abas) => comRetryCota(() => inner.cabecalhos(id, abas), o),
    lerLinha: (id, aba, n) => comRetryCota(() => inner.lerLinha(id, aba, n), o),
    append: (id, aba, l) => comRetryCota(() => inner.append(id, aba, l), o),
    updateRow: (id, aba, n, v) => comRetryCota(() => inner.updateRow(id, aba, n, v), o),
    updateRows: (id, aba, l) => comRetryCota(() => inner.updateRows(id, aba, l), o),
    appendMultiplo: (id, blocos) => comRetryCota(() => inner.appendMultiplo(id, blocos), o),
  };
}
