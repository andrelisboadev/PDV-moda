"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface ItemNav {
  href: string;
  rotulo: string;
}

/** Barra inferior (celular) e lateral (computador). Os itens já chegam filtrados pelo perfil. */
export function Navegacao({ itens }: { itens: ItemNav[] }) {
  const atual = usePathname();
  const ativo = (href: string) => (href === "/" ? atual === "/" : atual.startsWith(href));
  return (
    <>
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-10 flex gap-1 overflow-x-auto border-t border-borda bg-superficie px-2 py-1 md:hidden"
      >
        {itens.map((i) => (
          <Link key={i.href} href={i.href} className="nav-item shrink-0" aria-current={ativo(i.href) ? "page" : undefined}>
            {i.rotulo}
          </Link>
        ))}
      </nav>
      <nav
        aria-label="Principal"
        className="fixed inset-y-0 left-0 hidden w-56 flex-col gap-1 border-r border-borda bg-superficie p-3 md:flex"
      >
        <p className="px-3 py-4 font-titulo text-xl font-bold text-primaria">Balcão Moda</p>
        {itens.map((i) => (
          <Link key={i.href} href={i.href} className="nav-item !flex-row !justify-start !text-sm" aria-current={ativo(i.href) ? "page" : undefined}>
            {i.rotulo}
          </Link>
        ))}
      </nav>
    </>
  );
}
