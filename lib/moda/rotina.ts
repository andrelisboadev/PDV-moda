/**
 * Rotina diária (Vercel Cron): para cada loja ativa, faz o backup e confere os registros.
 * Uma loja com problema nunca impede as outras. O resultado devolve só números e códigos.
 */
import { fazerBackup } from "@/lib/core/backup";
import { listarLojas, type DepsContexto } from "@/lib/core/contexto";
import { logErro } from "@/lib/core/log";
import { RepoTenant } from "@/lib/core/sheets/repo";
import { agoraSP, diaSP } from "@/lib/core/tempo";
import { conferirLoja } from "./reconciliacao";

export const CHAVE_BACKUP = "backupPlanilhaId";
export const MAX_DIVERGENCIAS_REGISTRADAS = 20;

export interface ResultadoLoja {
  loja: number; // posição na lista, sem expor ID nem nome
  backup: "feito" | "ja_feito" | "sem_planilha" | "erro";
  divergencias: number | null;
}

export async function rodarRotinaDiaria(deps: DepsContexto, agora: Date = new Date()): Promise<ResultadoLoja[]> {
  const hoje = diaSP(agora);
  const lojas = await listarLojas(deps);
  const out: ResultadoLoja[] = [];

  for (const [i, loja] of lojas.entries()) {
    const r: ResultadoLoja = { loja: i + 1, backup: "erro", divergencias: null };
    const repo = new RepoTenant(loja.planilhaId, deps);
    try {
      const config = await repo.lerFresco("Config");
      const backupId = config.find((c) => c.chave === CHAVE_BACKUP)?.valor.trim();
      if (!backupId) {
        r.backup = "sem_planilha";
      } else {
        const b = await fazerBackup(deps.driver, { origemId: loja.planilhaId, backupId, hoje });
        r.backup = b.jaFeito ? "ja_feito" : "feito";
      }
    } catch (e) {
      logErro(`rotina.backup.loja${i + 1}`, e);
    }
    try {
      const div = await conferirLoja(repo);
      r.divergencias = div.length;
      for (const d of div.slice(0, MAX_DIVERGENCIAS_REGISTRADAS)) {
        await repo.acrescentar(
          "Auditoria",
          { quando: agoraSP(agora), usuario: "sistema", acao: `divergencia_${d.regra}`, entidade: "Vendas", entidadeId: d.id },
          "sistema",
        );
      }
    } catch (e) {
      logErro(`rotina.conferencia.loja${i + 1}`, e);
    }
    out.push(r);
  }
  return out;
}
