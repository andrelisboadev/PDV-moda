import "server-only";
import { auth } from "@/auth";
import { criarContexto, type Contexto, type DepsContexto } from "./contexto";
import { ErroApp } from "./erros";
import { cacheNext } from "./sheets/cache-next";
import { driverGoogle } from "./sheets/google";

function deps(): DepsContexto {
  const masterId = process.env.MASTER_SHEET_ID;
  if (!masterId) throw new ErroApp("interno", "Configuração do servidor incompleta");
  return { driver: driverGoogle, cache: cacheNext, masterId };
}

/**
 * Único jeito de uma página, Server Action ou rota obter acesso a dados.
 * Loja e perfil vêm da sessão (e-mail do Google) + planilha mestra + aba Usuarios.
 */
export async function obterContexto(): Promise<Contexto> {
  const sessao = await auth();
  const email = sessao?.user?.email;
  if (!email) throw new ErroApp("nao_autenticado", "Entre para continuar.");
  return criarContexto(deps(), email);
}

/** Usado pelo login: o e-mail tem acesso ativo a alguma loja? Retorna o perfil ou null. */
export async function resolverAcesso(email: string) {
  try {
    const ctx = await criarContexto(deps(), email);
    return { papel: ctx.usuario.papel };
  } catch {
    return null;
  }
}
