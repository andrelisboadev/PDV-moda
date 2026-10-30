/**
 * Limite de requisições (rate limit) por janela fixa.
 *
 * Com UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN usa o Redis da Upstash (vale para todas as
 * instâncias do servidor). Sem eles, ou se a Upstash falhar, cai para a memória da instância:
 * protege menos (cada instância conta separado), mas nunca derruba o sistema por causa do limitador.
 *
 * Roda no middleware (edge) e no servidor: só usa `fetch`, sem dependência extra.
 */
export interface OpcoesLimite {
  /** Quem está sendo limitado, ex.: "ip:1.2.3.4:login". Nunca coloque dado pessoal aqui. */
  chave: string;
  max: number;
  janelaSeg: number;
  /** Só para teste. */
  agora?: number;
  env?: Record<string, string | undefined>;
  fetchFn?: typeof fetch;
}

export interface ResultadoLimite {
  ok: boolean;
  restante: number;
  /** Segundos até a janela virar. */
  esperarSeg: number;
}

const memoria = new Map<string, { n: number; fimMs: number }>();
let ultimaLimpeza = 0;

function contarNaMemoria(chave: string, janelaSeg: number, agora: number): number {
  if (agora - ultimaLimpeza > 60_000) {
    for (const [k, v] of memoria) if (v.fimMs <= agora) memoria.delete(k);
    ultimaLimpeza = agora;
  }
  const atual = memoria.get(chave);
  if (!atual || atual.fimMs <= agora) {
    memoria.set(chave, { n: 1, fimMs: agora + janelaSeg * 1000 });
    return 1;
  }
  atual.n += 1;
  return atual.n;
}

async function contarNaUpstash(
  url: string,
  token: string,
  chave: string,
  janelaSeg: number,
  fetchFn: typeof fetch,
): Promise<number> {
  const r = await fetchFn(`${url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", chave],
      ["EXPIRE", chave, String(janelaSeg), "NX"],
    ]),
    signal: AbortSignal.timeout(1500),
  });
  if (!r.ok) throw new Error(`upstash ${r.status}`);
  const corpo = (await r.json()) as Array<{ result?: unknown; error?: string }>;
  const n = Number(corpo?.[0]?.result);
  if (!Number.isFinite(n)) throw new Error("upstash resposta inválida");
  return n;
}

export async function limitar(o: OpcoesLimite): Promise<ResultadoLimite> {
  const agora = o.agora ?? Date.now();
  const janelaMs = o.janelaSeg * 1000;
  const bloco = Math.floor(agora / janelaMs);
  const chave = `rl:${o.chave}:${bloco}`;
  const esperarSeg = Math.max(1, Math.ceil(((bloco + 1) * janelaMs - agora) / 1000));
  const env = o.env ?? process.env;

  let n: number | undefined;
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      n = await contarNaUpstash(url, token, chave, o.janelaSeg, o.fetchFn ?? fetch);
    } catch {
      n = undefined; // Upstash fora do ar: usa a memória em vez de bloquear todo mundo
    }
  }
  n ??= contarNaMemoria(chave, o.janelaSeg, agora);

  return { ok: n <= o.max, restante: Math.max(0, o.max - n), esperarSeg };
}

/** IP do visitante. Na Vercel o x-forwarded-for é definido pela própria plataforma. */
export function ipDe(headers: Headers): string {
  const xff = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || headers.get("x-real-ip") || "desconhecido";
}

/** Limites do sistema, num lugar só. */
export const LIMITES = {
  /** Entrar, sair, qualquer rota do Auth.js, por IP. */
  login: { max: 20, janelaSeg: 60 },
  /** Qualquer envio (Server Action) por IP. */
  envioPorIp: { max: 240, janelaSeg: 60 },
  /** Ações de uma mesma pessoa logada. */
  acaoPorUsuario: { max: 120, janelaSeg: 60 },
  /** Rotas de dados pessoais (exportar/anonimizar): bem apertado. */
  lgpd: { max: 10, janelaSeg: 60 },
} as const;
