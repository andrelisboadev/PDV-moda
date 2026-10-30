/**
 * Backup diário: copia as abas da loja para uma planilha de backup (do André) e apaga as cópias
 * com mais de `retencaoDias` dias. As abas de backup se chamam "bk-AAAA-MM-DD <aba>".
 *
 * Por que copiar abas e não a planilha inteira: conta de serviço não tem espaço no Drive, então não
 * consegue criar arquivos; copiar abas para uma planilha que já existe (e foi compartilhada com ela)
 * funciona sem Drive. Só lógica; o driver faz as chamadas.
 */
import { ABAS, type NomeAba } from "./schema";
import type { SheetsDriver } from "./sheets/driver";
import { somarDias } from "./tempo";

export const PREFIXO_BACKUP = "bk-";
export const RETENCAO_PADRAO_DIAS = 7;

const DATA_NA_ABA = /^bk-(\d{4}-\d{2}-\d{2}) /;

export interface ResultadoBackup {
  copiadas: number;
  apagadas: number;
  jaFeito: boolean;
}

export async function fazerBackup(
  driver: SheetsDriver,
  o: { origemId: string; backupId: string; hoje: string; retencaoDias?: number; abas?: NomeAba[] },
): Promise<ResultadoBackup> {
  if (o.origemId === o.backupId) throw new Error("backup igual à origem");
  const abas = o.abas ?? (Object.keys(ABAS) as NomeAba[]);
  const prefixo = `${PREFIXO_BACKUP}${o.hoje}`;
  const retencao = Math.max(1, o.retencaoDias ?? RETENCAO_PADRAO_DIAS);

  const existentes = await driver.titulosDeAbas(o.backupId);
  const deHoje = existentes.filter((t) => t.startsWith(`${prefixo} `));
  const jaFeito = deHoje.length >= abas.length;
  let copiadas = 0;
  if (!jaFeito) {
    // cópia anterior incompleta: recomeça do zero para não misturar
    if (deHoje.length > 0) await driver.apagarAbas(o.backupId, deHoje);
    await driver.copiarAbas(o.origemId, o.backupId, abas, prefixo);
    copiadas = abas.length;
  }

  // retenção: só depois de ter a cópia de hoje, nunca antes
  const limite = somarDias(o.hoje, -(retencao - 1));
  const velhas = existentes.filter((t) => {
    const d = DATA_NA_ABA.exec(t)?.[1];
    return d !== undefined && d < limite;
  });
  if (velhas.length > 0) await driver.apagarAbas(o.backupId, velhas);

  return { copiadas, apagadas: velhas.length, jaFeito };
}
