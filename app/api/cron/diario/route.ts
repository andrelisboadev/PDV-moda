import { NextResponse } from "next/server";
import { logErro } from "@/lib/core/log";
import { depsDeServidor } from "@/lib/core/deps";
import { bearerConfere } from "@/lib/core/segredo";
import { rodarRotinaDiaria } from "@/lib/moda/rotina";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!bearerConfere(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }
  try {
    const lojas = await rodarRotinaDiaria(depsDeServidor());
    return NextResponse.json({ lojas });
  } catch (e) {
    logErro("api/cron/diario", e);
    return NextResponse.json({ erro: "Falha na rotina." }, { status: 500 });
  }
}
