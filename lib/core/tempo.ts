/** Datas em ISO 8601 no fuso America/Sao_Paulo (ex.: 2026-10-14T08:31:00-03:00). */
const FUSO = "America/Sao_Paulo";

export function agoraSP(d: Date = new Date()): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: FUSO,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const off =
    new Intl.DateTimeFormat("en-US", { timeZone: FUSO, timeZoneName: "longOffset" })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value.replace("GMT", "") || "+00:00";
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}:${partes.second}${off === "" ? "+00:00" : off}`;
}

/** "2026-10-14" (dia no fuso de São Paulo). */
export const diaSP = (d: Date = new Date()): string => agoraSP(d).slice(0, 10);

/* ---------- datas de calendário (sem hora), para vencimentos e prazos ---------- */

const doDia = (dia: string) => {
  const [a = 0, m = 1, d = 1] = dia.split("-").map(Number);
  return { a, m, d };
};
const montar = (a: number, m: number, d: number) =>
  `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const diasNoMes = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();

/** "2026-10-31" + 1 dia -> "2026-11-01". */
export function somarDias(dia: string, n: number): string {
  const { a, m, d } = doDia(dia);
  const t = new Date(Date.UTC(a, m - 1, d + n));
  return montar(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** "2026-01-31" + 1 mês -> "2026-02-28" (o dia 31 vira o último dia do mês que não tem 31). */
export function somarMeses(dia: string, n: number): string {
  const { a, m, d } = doDia(dia);
  const idx = a * 12 + (m - 1) + n;
  const ano = Math.floor(idx / 12);
  const mes = (idx % 12) + 1;
  return montar(ano, mes, Math.min(d, diasNoMes(ano, mes)));
}

/** Diferença em dias inteiros entre dois dias "AAAA-MM-DD" (b - a). */
export function diasEntre(a: string, b: string): number {
  const x = doDia(a);
  const y = doDia(b);
  return Math.round((Date.UTC(y.a, y.m - 1, y.d) - Date.UTC(x.a, x.m - 1, x.d)) / 86_400_000);
}
