import type { BlocoAppend, SheetsDriver } from "@/lib/core/sheets/driver";

export interface Chamada {
  tipo: "batchGet" | "cabecalhos" | "lerLinha" | "append" | "updateRow" | "updateRows" | "appendMultiplo";
  planilha: string;
  aba: string;
}

/** Google Sheets simulado em memória: várias planilhas, cada uma com abas (matriz de strings). */
export class DriverFalso implements SheetsDriver {
  readonly planilhas = new Map<string, Map<string, string[][]>>();
  readonly chamadas: Chamada[] = [];
  /** Faz a próxima chamada de appendMultiplo falhar (simula erro de rede/cota no lote final). */
  falharProximoLote = false;
  /** Gancho para simular outra pessoa gravando entre a leitura e a escrita. */
  antesDeLerLinha?: (planilha: string, aba: string, numero: number) => void;

  criarPlanilha(id: string, abas: Record<string, string[][]>) {
    this.planilhas.set(id, new Map(Object.entries(abas).map(([k, v]) => [k, v.map((l) => [...l])])));
  }

  private aba(planilha: string, aba: string): string[][] {
    const p = this.planilhas.get(planilha);
    if (!p) throw new Error("planilha inexistente");
    let m = p.get(aba);
    if (!m) {
      m = [];
      p.set(aba, m);
    }
    return m;
  }

  async batchGet(planilha: string, abas: string[]) {
    abas.forEach((a) => this.chamadas.push({ tipo: "batchGet", planilha, aba: a }));
    return Object.fromEntries(abas.map((a) => [a, this.aba(planilha, a).map((l) => [...l])]));
  }
  async cabecalhos(planilha: string, abas: string[]) {
    abas.forEach((a) => this.chamadas.push({ tipo: "cabecalhos", planilha, aba: a }));
    return Object.fromEntries(abas.map((a) => [a, [...(this.aba(planilha, a)[0] ?? [])]]));
  }
  async lerLinha(planilha: string, aba: string, numero: number) {
    this.chamadas.push({ tipo: "lerLinha", planilha, aba });
    this.antesDeLerLinha?.(planilha, aba, numero);
    return [...(this.aba(planilha, aba)[numero - 1] ?? [])];
  }
  async append(planilha: string, aba: string, linhas: string[][]) {
    this.chamadas.push({ tipo: "append", planilha, aba });
    this.aba(planilha, aba).push(...linhas.map((l) => [...l]));
  }
  async appendMultiplo(planilha: string, blocos: BlocoAppend[]) {
    blocos.forEach((b) => this.chamadas.push({ tipo: "appendMultiplo", planilha, aba: b.aba }));
    if (this.falharProximoLote) {
      this.falharProximoLote = false;
      throw new Error("falha simulada");
    }
    // atômico: confere todas as abas antes de gravar qualquer uma
    const p = this.planilhas.get(planilha);
    if (!p || blocos.some((b) => !p.has(b.aba))) throw new Error("aba inexistente");
    for (const b of blocos) this.aba(planilha, b.aba).push(...b.linhas.map((l) => [...l]));
  }
  async titulosDeAbas(planilha: string) {
    const p = this.planilhas.get(planilha);
    if (!p) throw new Error("planilha inexistente");
    return [...p.keys()];
  }
  async copiarAbas(origem: string, destino: string, abas: string[], prefixo: string) {
    const o = this.planilhas.get(origem);
    const d = this.planilhas.get(destino);
    if (!o || !d) throw new Error("planilha inexistente");
    for (const a of abas) {
      const m = o.get(a);
      if (!m) throw new Error("aba inexistente");
      d.set(`${prefixo} ${a}`, m.map((l) => [...l]));
    }
  }
  async apagarAbas(planilha: string, titulos: string[]) {
    const p = this.planilhas.get(planilha);
    if (!p) throw new Error("planilha inexistente");
    if (titulos.filter((t) => p.has(t)).length >= p.size) throw new Error("não apaga todas as abas");
    for (const t of titulos) p.delete(t);
  }
  async updateRows(planilha: string, aba: string, linhas: Array<{ numero: number; valores: string[] }>) {
    this.chamadas.push({ tipo: "updateRows", planilha, aba });
    for (const l of linhas) this.aba(planilha, aba)[l.numero - 1] = [...l.valores];
  }
  async updateRow(planilha: string, aba: string, numero: number, valores: string[]) {
    this.chamadas.push({ tipo: "updateRow", planilha, aba });
    this.aba(planilha, aba)[numero - 1] = [...valores];
  }

  /** IDs de planilha tocados por escritas. */
  planilhasEscritas(): Set<string> {
    return new Set(this.chamadas.filter((c) => c.tipo === "append" || c.tipo === "updateRow" || c.tipo === "updateRows" || c.tipo === "appendMultiplo").map((c) => c.planilha));
  }
}
