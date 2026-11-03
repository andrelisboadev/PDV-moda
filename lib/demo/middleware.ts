import { NextResponse, type NextRequest } from "next/server";
import { LIMITES, ipDe, limitar } from "@/lib/core/limite";
import { rotaSoDono } from "@/lib/core/permissoes";
import { COOKIE_PAPEL, COOKIE_SESSAO, papelValido, sessaoValida } from "./modo";

const UM_MES = 60 * 60 * 24 * 30;

/** Middleware do modo demonstração (roda no edge): entra com ?demo=true e não pede login. */
export async function middlewareDemo(req: NextRequest): Promise<NextResponse> {
  const { pathname, searchParams } = req.nextUrl;

  if (req.method === "POST") {
    const l = await limitar({ chave: `ip:${ipDe(req.headers)}:envio`, ...LIMITES.envioPorIp });
    if (!l.ok) return new NextResponse("Muitas tentativas. Aguarde um instante e tente de novo.", { status: 429, headers: { "Retry-After": String(l.esperarSeg) } });
  }

  const seguro = process.env.NODE_ENV === "production";
  const opcoes = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: seguro, maxAge: UM_MES };
  const sid = req.cookies.get(COOKIE_SESSAO)?.value;
  const papel = req.cookies.get(COOKIE_PAPEL)?.value;

  if (searchParams.get("demo") === "true") {
    const url = req.nextUrl.clone();
    url.searchParams.delete("demo");
    url.searchParams.set("d", "1"); // marca que já tentamos criar os cookies (evita laço se estiverem bloqueados)
    const r = NextResponse.redirect(url);
    r.cookies.set(COOKIE_SESSAO, sessaoValida(sid) ? sid : crypto.randomUUID(), opcoes);
    if (!papelValido(papel)) r.cookies.set(COOKIE_PAPEL, "dono", opcoes);
    return r;
  }

  if (!sessaoValida(sid)) {
    if (searchParams.get("d") === "1") {
      return new NextResponse("Para ver a demonstração, deixe os cookies ativados no navegador e abra o link de novo.", { status: 400 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "?demo=true";
    return NextResponse.redirect(url);
  }

  if (pathname === "/login") return NextResponse.redirect(new URL("/", req.nextUrl));
  if (rotaSoDono(pathname) && papel !== "dono") return NextResponse.redirect(new URL("/", req.nextUrl));
  return NextResponse.next();
}
