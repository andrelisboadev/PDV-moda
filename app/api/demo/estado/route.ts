import { NextResponse } from "next/server";
import { lerCookiesDemo } from "@/lib/demo/contexto";
import { TAMANHO_MAX_SNAPSHOT, demoAtivo } from "@/lib/demo/modo";
import { exportar, obterSessao, restaurar, validarSnapshot } from "@/lib/demo/sessoes";

export const dynamic = "force-dynamic";

const semDemo = () => new NextResponse(null, { status: 404 });
const semSessao = () => NextResponse.json({ erro: "sem_sessao" }, { status: 401 });

/** ?resumo=1 devolve só a versão (barato, usado a cada poucos segundos); sem ele, o estado inteiro. */
export async function GET(req: Request) {
  if (!demoAtivo()) return semDemo();
  const { sid } = await lerCookiesDemo();
  if (!sid) return semSessao();
  const s = await obterSessao(sid);
  const resumo = new URL(req.url).searchParams.get("resumo") === "1";
  return NextResponse.json(resumo ? { versao: s.driver.versao } : { versao: s.driver.versao, snapshot: exportar(s) }, { headers: { "Cache-Control": "no-store" } });
}

/** O navegador devolve o estado que guardou (servidor reiniciado, outra instância...). Validado antes de aceitar. */
export async function POST(req: Request) {
  if (!demoAtivo()) return semDemo();
  const { sid } = await lerCookiesDemo();
  if (!sid) return semSessao();
  const texto = await req.text();
  if (texto.length > TAMANHO_MAX_SNAPSHOT) return NextResponse.json({ erro: "grande_demais" }, { status: 413 });
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return NextResponse.json({ erro: "invalido" }, { status: 400 });
  }
  const snap = validarSnapshot(bruto);
  if (!snap) return NextResponse.json({ erro: "invalido" }, { status: 400 });
  const s = restaurar(sid, snap);
  return NextResponse.json({ ok: true, versao: s.driver.versao });
}
