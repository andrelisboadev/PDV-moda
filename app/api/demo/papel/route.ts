import { NextResponse } from "next/server";
import { COOKIE_PAPEL, demoAtivo, papelValido } from "@/lib/demo/modo";

/** Troca entre "Dona" e "Vendedora" na demonstração (para mostrar o que cada perfil enxerga). */
export async function POST(req: Request) {
  if (!demoAtivo()) return new NextResponse(null, { status: 404 });
  const papel = String((await req.formData()).get("papel") ?? "");
  const r = NextResponse.redirect(new URL("/", req.url), 303);
  if (papelValido(papel)) {
    r.cookies.set(COOKIE_PAPEL, papel, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30 });
  }
  return r;
}
