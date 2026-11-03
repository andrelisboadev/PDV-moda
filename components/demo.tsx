"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CHAVE_LOCAL } from "@/lib/demo/modo";

type Papel = "dono" | "vendedor";

interface Guardado {
  versao: number;
}

function lerLocal(): (Guardado & Record<string, unknown>) | null {
  try {
    const t = localStorage.getItem(CHAVE_LOCAL);
    if (!t) return null;
    const o = JSON.parse(t) as Guardado & Record<string, unknown>;
    return typeof o?.versao === "number" ? o : null;
  } catch {
    return null;
  }
}
function gravarLocal(snapshot: unknown) {
  try {
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify(snapshot));
  } catch {
    /* navegador sem armazenamento ou cheio: a demonstração segue funcionando, só não lembra depois */
  }
}
function apagarLocal() {
  try {
    localStorage.removeItem(CHAVE_LOCAL);
  } catch {
    /* ignora */
  }
}

/**
 * Faixa de demonstração + sincronização com o localStorage.
 * O navegador é o dono do estado: o servidor só guarda uma cópia de trabalho. Se o servidor perder a cópia
 * (reinício, outra instância), o navegador devolve o que guardou. Quem tem a versão maior vence.
 */
export function DemoBarra({ papel }: { papel: Papel }) {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  const ocupado = useRef(false);
  const [msg, setMsg] = useState("");

  const sincronizar = useCallback(async () => {
    if (ocupado.current) return;
    ocupado.current = true;
    try {
      const r = await fetch("/api/demo/estado?resumo=1", { cache: "no-store" });
      if (!r.ok) return;
      const { versao } = (await r.json()) as { versao: number };
      const local = lerLocal();
      if (local && local.versao > versao) {
        // O servidor voltou ao começo, mas o navegador lembra de mais: devolve o que lembra.
        const p = await fetch("/api/demo/estado", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(local) });
        if (p.ok) router.refresh();
        else apagarLocal(); // guardado estragado ou de versão antiga: recomeça
      } else if (!local || local.versao !== versao) {
        const c = await fetch("/api/demo/estado", { cache: "no-store" });
        if (c.ok) gravarLocal(((await c.json()) as { snapshot: unknown }).snapshot);
      }
    } catch {
      /* sem rede por um instante: tenta de novo no próximo ciclo */
    } finally {
      ocupado.current = false;
    }
  }, [router]);

  // ao abrir, a cada navegação, a cada poucos segundos e ao sair da aba
  useEffect(() => {
    void sincronizar();
  }, [sincronizar, caminho, params]);
  useEffect(() => {
    const t = setInterval(() => void sincronizar(), 6000);
    const v = () => document.visibilityState === "hidden" && void sincronizar();
    document.addEventListener("visibilitychange", v);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", v);
    };
  }, [sincronizar]);

  async function reiniciar() {
    setMsg("Reiniciando…");
    try {
      await fetch("/api/demo/reiniciar", { method: "POST" });
    } finally {
      apagarLocal();
      window.location.assign("/");
    }
  }

  return (
    <div role="note" className="print:hidden border-b border-atencao/40 bg-atencao/15 px-4 py-2 text-sm">
      <p>
        <strong>Demonstração.</strong> Loja fictícia. O que você fizer fica salvo só neste navegador.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-suave">Ver como:</span>
        {(["dono", "vendedor"] as const).map((p) => (
          <form key={p} method="post" action="/api/demo/papel">
            <input type="hidden" name="papel" value={p} />
            <button type="submit" className={`min-h-botao rounded-xl border px-4 text-sm ${papel === p ? "border-primaria bg-primaria font-semibold text-fundo" : "border-borda bg-superficie"}`} aria-pressed={papel === p}>
              {p === "dono" ? "Dona da loja" : "Vendedora"}
            </button>
          </form>
        ))}
        <button type="button" onClick={reiniciar} className="min-h-botao rounded-xl border border-borda bg-superficie px-4 text-sm">
          Reiniciar dados
        </button>
        {msg && <span role="status">{msg}</span>}
      </div>
    </div>
  );
}
