import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { TTL_SEGUNDOS, tagDoTenant, type CacheLeitura } from "./cache";

/** Cache de produção: 30 s, etiquetado por loja, invalidado a cada escrita. */
export const cacheNext: CacheLeitura = {
  obter<T>(tenant: string, chave: string, carregar: () => Promise<T>) {
    return unstable_cache(carregar, [tagDoTenant(tenant), chave], {
      revalidate: TTL_SEGUNDOS,
      tags: [tagDoTenant(tenant)],
    })();
  },
  invalidar(tenant: string) {
    revalidateTag(tagDoTenant(tenant));
  },
};
