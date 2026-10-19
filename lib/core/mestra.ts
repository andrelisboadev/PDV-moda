/**
 * Planilha mestra: liga e-mail -> planilha da loja -> plano.
 *  - Clientes: uma linha por loja (e-mail do dono, ID da planilha, plano).
 *  - Acessos: uma linha por e-mail que pode entrar (dono e vendedores) -> ID da planilha.
 *    Serve só para achar a loja de quem está entrando. Quem realmente pode entrar
 *    é decidido pela aba Usuarios da planilha da loja (fonte de verdade).
 */
import { z } from "zod";
import { aba, type DefAba } from "./schema";

const bool = z.preprocess((v) => v === true || v === "TRUE" || v === "true" || v === "1", z.boolean());

export const ABAS_MESTRA = {
  Clientes: aba("Clientes", {
    nomeLoja: z.string().max(120),
    emailDono: z.string().email().max(200),
    planilhaId: z.string().min(10).max(100),
    plano: z.string().max(40),
    ativo: bool,
  }),
  Acessos: aba("Acessos", {
    email: z.string().email().max(200),
    planilhaId: z.string().min(10).max(100),
    ativo: bool,
  }),
} as const;

export type NomeAbaMestra = keyof typeof ABAS_MESTRA;
export type LinhaMestra<N extends NomeAbaMestra> = z.infer<(typeof ABAS_MESTRA)[N]["schema"]>;
export const DEFS_MESTRA = Object.values(ABAS_MESTRA) as DefAba[];

/** Identificador do "tenant" usado só para o cache da planilha mestra. */
export const TENANT_MESTRA = "__mestra__";
