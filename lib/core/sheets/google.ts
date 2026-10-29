import "server-only";
import { sheets, type sheets_v4 } from "@googleapis/sheets";
import { GoogleAuth } from "google-auth-library";
import { driverComRetry, type SheetsDriver } from "./driver";

/**
 * Driver real. Só roda no servidor ("server-only" quebra o build se importado
 * em código do navegador). A chave vem de variável de ambiente (JSON em base64)
 * e nunca é registrada em log.
 */
/**
 * Aceita o JSON em base64 (o recomendado) ou o JSON puro, ignorando espaços, quebras de linha
 * e aspas coladas por engano. Em caso de erro, diz QUAL variável está errada, nunca o conteúdo.
 */
function lerCredenciais(bruto: string): Record<string, unknown> {
  const v = bruto.trim().replace(/^["']|["']$/g, "").trim();
  const texto = v.startsWith("{") ? v : Buffer.from(v.replace(/\s+/g, ""), "base64").toString("utf8");
  try {
    const c = JSON.parse(texto) as Record<string, unknown>;
    if (typeof c.client_email !== "string" || typeof c.private_key !== "string") throw new Error("campos");
    return c;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_B64 inválida: precisa ser o JSON da conta de serviço em base64");
  }
}

function criarCliente(): sheets_v4.Sheets {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  if (!b64) throw new Error("Configuração do servidor incompleta");
  const credentials = lerCredenciais(b64);
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return sheets({ version: "v4", auth });
}

let cliente: sheets_v4.Sheets | undefined;
const api = () => (cliente ??= criarCliente());

/** Nome de aba entre aspas simples, como o Sheets exige. */
const aspas = (aba: string) => `'${aba.replace(/'/g, "''")}'`;
const texto = (c: unknown) => (c == null ? "" : String(c));

/** ID numérico de cada aba (o batchUpdate precisa dele). Estável, então guardamos na instância. */
const idsDeAbas = new Map<string, Map<string, number>>();

async function idsDasAbas(spreadsheetId: string): Promise<Map<string, number>> {
  const guardado = idsDeAbas.get(spreadsheetId);
  if (guardado) return guardado;
  const r = await api().spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" });
  const mapa = new Map<string, number>();
  for (const s of r.data.sheets ?? []) {
    const { sheetId, title } = s.properties ?? {};
    if (sheetId != null && title) mapa.set(title, sheetId);
  }
  idsDeAbas.set(spreadsheetId, mapa);
  return mapa;
}

const driverBruto: SheetsDriver = {
  async batchGet(spreadsheetId, abas) {
    const r = await api().spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: abas.map(aspas),
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    const out: Record<string, string[][]> = {};
    abas.forEach((nome, i) => {
      out[nome] = (r.data.valueRanges?.[i]?.values ?? []).map((l) => l.map(texto));
    });
    return out;
  },
  async cabecalhos(spreadsheetId, abas) {
    const r = await api().spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: abas.map((a) => `${aspas(a)}!1:1`),
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    const out: Record<string, string[]> = {};
    abas.forEach((nome, i) => {
      out[nome] = (r.data.valueRanges?.[i]?.values?.[0] ?? []).map(texto);
    });
    return out;
  },
  async lerLinha(spreadsheetId, aba, numeroLinha) {
    const r = await api().spreadsheets.values.get({
      spreadsheetId,
      range: `${aspas(aba)}!${numeroLinha}:${numeroLinha}`,
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    return (r.data.values?.[0] ?? []).map(texto);
  },
  async append(spreadsheetId, aba, linhas) {
    await api().spreadsheets.values.append({
      spreadsheetId,
      range: aspas(aba),
      valueInputOption: "RAW", // nunca interpreta =, +, -, @ como fórmula
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: linhas },
    });
  },
  async appendMultiplo(spreadsheetId, blocos) {
    const ids = await idsDasAbas(spreadsheetId);
    const requests = blocos.map((b) => {
      const sheetId = ids.get(b.aba);
      if (sheetId === undefined) throw new Error("Aba inexistente na planilha");
      return {
        appendCells: {
          sheetId,
          fields: "userEnteredValue",
          rows: b.linhas.map((l) => ({
            // stringValue grava TEXTO (nunca fórmula); célula vazia fica em branco.
            values: l.map((c) => (c === "" ? {} : { userEnteredValue: { stringValue: c } })),
          })),
        },
      };
    });
    // Uma requisição, atômica: se qualquer parte for inválida, nada é gravado.
    await api().spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  },
  async updateRows(spreadsheetId, aba, linhas) {
    if (linhas.length === 0) return;
    await api().spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: linhas.map((l) => ({ range: `${aspas(aba)}!A${l.numero}`, values: [l.valores] })),
      },
    });
  },
  async updateRow(spreadsheetId, aba, numeroLinha, valores) {
    await api().spreadsheets.values.update({
      spreadsheetId,
      range: `${aspas(aba)}!A${numeroLinha}`,
      valueInputOption: "RAW",
      requestBody: { values: [valores] },
    });
  },
};

export const driverGoogle: SheetsDriver = driverComRetry(driverBruto);
