// Varre o que o navegador recebe (.next/static) e falha se achar algo do Google Sheets ou da chave.
// Uso: pnpm build && pnpm verificar:bundle
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = ".next/static";
const PROIBIDOS = [
  "sheets.googleapis.com",
  "googleapis.com/auth/spreadsheets",
  "@googleapis/sheets",
  "google-auth-library",
  "GOOGLE_SERVICE_ACCOUNT",
  "MASTER_SHEET_ID",
  "private_key",
  "BEGIN PRIVATE KEY",
  "AUTH_SECRET",
];

function arquivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : [p];
  });
}

const achados = [];
let total = 0;
for (const f of arquivos(RAIZ)) {
  if (!/\.(js|css|html|json|map)$/.test(f)) continue;
  total++;
  const conteudo = readFileSync(f, "utf8");
  for (const termo of PROIBIDOS) if (conteudo.includes(termo)) achados.push(`${f}: "${termo}"`);
}

console.log(`Arquivos do navegador verificados: ${total}`);
if (achados.length > 0) {
  console.error("FALHA — encontrado no código do navegador:\n" + achados.join("\n"));
  process.exit(1);
}
console.log("OK — nada do Google Sheets, da chave ou de segredos no código do navegador.");
