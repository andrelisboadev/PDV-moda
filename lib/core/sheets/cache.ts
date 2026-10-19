/**
 * Cache de leitura de 30 segundos, por loja. A chave sempre inclui o ID da planilha
 * (tenant), então uma loja nunca recebe o cache de outra. Toda escrita invalida a loja.
 * Em produção, `cacheNext` usa o cache do Next (unstable_cache + revalidateTag).
 * Nos testes, `cacheMemoria` faz o mesmo sem depender do Next.
 */
export const TTL_SEGUNDOS = 30;

export interface CacheLeitura {
  obter<T>(tenant: string, chave: string, carregar: () => Promise<T>): Promise<T>;
  invalidar(tenant: string): Promise<void> | void;
}

export const tagDoTenant = (tenant: string) => `tenant:${tenant}`;

export function cacheMemoria(agora: () => number = Date.now): CacheLeitura {
  const itens = new Map<string, { expira: number; valor: unknown }>();
  return {
    async obter<T>(tenant: string, chave: string, carregar: () => Promise<T>) {
      const k = `${tagDoTenant(tenant)}|${chave}`;
      const hit = itens.get(k);
      if (hit && hit.expira > agora()) return hit.valor as T;
      const valor = await carregar();
      itens.set(k, { expira: agora() + TTL_SEGUNDOS * 1000, valor });
      return valor;
    },
    invalidar(tenant: string) {
      const prefixo = `${tagDoTenant(tenant)}|`;
      for (const k of [...itens.keys()]) if (k.startsWith(prefixo)) itens.delete(k);
    },
  };
}
