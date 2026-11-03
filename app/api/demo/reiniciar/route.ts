import { NextResponse } from "next/server";
import { lerCookiesDemo } from "@/lib/demo/contexto";
import { demoAtivo } from "@/lib/demo/modo";
import { reiniciarSessao } from "@/lib/demo/sessoes";

/** Volta a loja de exemplo ao começo (o navegador também apaga o que guardou). */
export async function POST() {
  if (!demoAtivo()) return new NextResponse(null, { status: 404 });
  const { sid } = await lerCookiesDemo();
  if (sid) reiniciarSessao(sid);
  return NextResponse.json({ ok: true });
}
