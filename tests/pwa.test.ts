import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("app instalável (PWA)", () => {
  const m = manifest();
  it("manifesto completo, em tela cheia e com ícone maskable", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.lang).toBe("pt-BR");
    const icones = m.icons ?? [];
    expect(icones.some((i) => i.sizes === "192x192")).toBe(true);
    expect(icones.some((i) => i.sizes === "512x512" && i.purpose === "any")).toBe(true);
    expect(icones.some((i) => i.purpose === "maskable")).toBe(true);
    for (const i of icones) expect(existsSync(`public${i.src}`)).toBe(true);
  });

  it("o service worker só guarda arquivos estáticos e nunca páginas nem API", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    expect(sw).toContain('req.method !== "GET"');
    expect(sw).toMatch(/ESTATICO = \/\^\\\/\(_next\\\/static\\\/\|icons\\\/\|favicon\\\.ico\$\)\//);
    expect(sw).not.toMatch(/\/api/);
    // navegação: rede primeiro, sem gravar a página no cache
    const nav = sw.slice(sw.indexOf('req.mode === "navigate"'), sw.indexOf("ESTATICO.test"));
    expect(nav).not.toContain("put(");
  });

  it("manifesto, service worker e tela offline ficam fora do login (o navegador os busca sem cookie)", () => {
    const mw = readFileSync("middleware.ts", "utf8");
    for (const p of ["manifest.webmanifest", "sw.js", "offline.html"]) expect(mw).toContain(p);
  });
});
