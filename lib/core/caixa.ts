import type { Contexto } from "./contexto";
import { diaSP } from "./tempo";

export interface ResumoCaixa {
  dia: string;
  entradasPorForma: Record<string, number>;
  saidasPorForma: Record<string, number>;
  totalEntradasCentavos: number;
  totalSaidasCentavos: number;
  saldoCentavos: number;
  vendas: number;
}

/** Entradas e saídas do dia por forma de pagamento. Só o dono ("caixa.ver"). */
export async function resumoCaixaDoDia(ctx: Contexto, dia: string = diaSP()): Promise<ResumoCaixa> {
  ctx.exigir("caixa.ver");
  const [caixa, vendas] = await Promise.all([ctx.ler("Caixa"), ctx.ler("Vendas")]);
  const entradasPorForma: Record<string, number> = {};
  const saidasPorForma: Record<string, number> = {};
  for (const c of caixa) {
    if (!c.data.startsWith(dia)) continue;
    const alvo = c.tipo === "entrada" ? entradasPorForma : saidasPorForma;
    alvo[c.forma] = (alvo[c.forma] ?? 0) + c.valorCentavos;
  }
  const soma = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  const totalEntradasCentavos = soma(entradasPorForma);
  const totalSaidasCentavos = soma(saidasPorForma);
  return {
    dia,
    entradasPorForma,
    saidasPorForma,
    totalEntradasCentavos,
    totalSaidasCentavos,
    saldoCentavos: totalEntradasCentavos - totalSaidasCentavos,
    vendas: vendas.filter((v) => v.data.startsWith(dia) && v.status === "concluida").length,
  };
}
