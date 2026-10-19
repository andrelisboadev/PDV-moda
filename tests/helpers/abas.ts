import { ABAS, type NomeAba } from "@/lib/core/schema";

export { ABAS };
export type { NomeAba };
export const ABAS_NOMES = Object.keys(ABAS) as NomeAba[];
