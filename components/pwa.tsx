"use client";

import { useEffect, useState } from "react";

interface EventoInstalar extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const CHAVE = "balcao-instalar-dispensado";
const guardado = () => {
  try {
    return localStorage.getItem(CHAVE) === "1";
  } catch {
    return false;
  }
};

/** Registra o service worker e oferece "Instalar app" (Android/Chrome) ou a dica de instalação no iPhone. */
export function Pwa() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [ios, setIos] = useState(false);
  const [oculto, setOculto] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    const instalado = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (instalado || guardado()) return;
    setOculto(false);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent));
    const aoOferecer = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalar);
    };
    const aoInstalar = () => setOculto(true);
    window.addEventListener("beforeinstallprompt", aoOferecer);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoOferecer);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  function dispensar() {
    setOculto(true);
    try {
      localStorage.setItem(CHAVE, "1");
    } catch {
      /* sem armazenamento: some só nesta visita */
    }
  }

  async function instalar() {
    if (!evento) return;
    await evento.prompt();
    const r = await evento.userChoice;
    setEvento(null);
    if (r.outcome === "accepted") setOculto(true);
  }

  if (oculto || (!evento && !ios)) return null;
  return (
    <div role="region" aria-label="Instalar o app" className="print:hidden flex flex-wrap items-center gap-2 border-b border-borda bg-primaria/10 px-4 py-2 text-sm">
      {evento ? (
        <>
          <span className="flex-1">Instale o Balcão Moda no celular e abra como um app.</span>
          <button type="button" onClick={instalar} className="botao !min-h-0 py-2 text-sm">
            Instalar app
          </button>
        </>
      ) : (
        <span className="flex-1">Para instalar no iPhone: toque em Compartilhar e depois em &quot;Adicionar à Tela de Início&quot;.</span>
      )}
      <button type="button" onClick={dispensar} className="min-h-botao px-3 text-suave">
        Agora não
      </button>
    </div>
  );
}
