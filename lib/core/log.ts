import { ZodError } from "zod";
import { ErroApp } from "./erros";

/**
 * Log técnico sem dados pessoais: só o tipo do erro e, para erros de validação,
 * o caminho dos campos (nunca os valores). Nunca registra a chave da conta de serviço.
 */
export function logErro(onde: string, e: unknown): void {
  let detalhe: string;
  if (e instanceof ZodError) {
    detalhe = e.issues.map((i) => `${i.path.join(".")}:${i.code}`).join(", ");
  } else if (e instanceof ErroApp) {
    detalhe = `${e.codigo}: ${e.message}`;
  } else if (e instanceof Error) {
    detalhe = e.name;
  } else {
    detalhe = typeof e;
  }
  console.error(`[balcao-moda] ${onde} — ${detalhe}`);
}
