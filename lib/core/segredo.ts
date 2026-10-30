import { timingSafeEqual } from "node:crypto";

/** Confere "Authorization: Bearer <segredo>" em tempo constante. Segredo curto demais nunca confere. */
export function bearerConfere(cabecalho: string | null, segredo: string | undefined): boolean {
  if (!segredo || segredo.length < 16 || !cabecalho) return false;
  const a = Buffer.from(cabecalho);
  const b = Buffer.from(`Bearer ${segredo}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
