/**
 * Gera as planilhas da DEMONSTRAÇÃO (loja fictícia com dados realistas) usando lib/demo/semente.ts.
 * Só roda com GERAR_DEMO=1:
 *   GERAR_DEMO=1 DEMO_OUT=/caminho/demo.json DEMO_EMAIL_DONO=a@x.com DEMO_EMAIL_VEND=b@x.com npx vitest run tests/demo-gerar.test.ts
 * O JSON é convertido em .xlsx por scripts/demo-para-xlsx.py.
 */
import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { semearDemo } from "@/lib/demo/semente";
import { conferirLoja } from "@/lib/moda/reconciliacao";
import { DriverFalso } from "./helpers/fake-driver";

const LOJA = "COLE-AQUI-O-ID-DA-PLANILHA-DA-LOJA";
const MESTRA = "COLE-AQUI-O-ID-DA-PLANILHA-MESTRA";

it.skipIf(!process.env.GERAR_DEMO)("gera a loja de demonstração", async () => {
  const driver = new DriverFalso();
  const { dono, hoje } = await semearDemo(driver, {
    lojaId: LOJA,
    mestraId: MESTRA,
    emailDono: process.env.DEMO_EMAIL_DONO ?? "dono.demo@exemplo.com",
    emailVendedor: process.env.DEMO_EMAIL_VEND ?? "vendedor.demo@exemplo.com",
  });
  expect(await conferirLoja(dono.sistema)).toEqual([]);
  const saida = Object.fromEntries([...driver.planilhas.get(LOJA)!]);
  const mestra = Object.fromEntries([...driver.planilhas.get(MESTRA)!]);
  writeFileSync(process.env.DEMO_OUT ?? "/tmp/demo.json", JSON.stringify({ loja: saida, mestra, geradoEm: hoje }));
});
