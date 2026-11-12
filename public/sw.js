/*
 * Service worker do Balcão Moda. Faz só duas coisas:
 *  1. guarda os arquivos estáticos do app (scripts, estilos, fontes, ícones) para abrir mais rápido;
 *  2. mostra uma tela "Sem internet" quando não há conexão.
 * NUNCA guarda páginas, respostas de API nem nada que venha da sessão: dados da loja (vendas, clientes,
 * caixa) só trafegam com internet e não ficam no aparelho, para não vazar em celular compartilhado.
 */
const VERSAO = "bm-v1";
const OFFLINE = "/offline.html";
const ESTATICO = /^\/(_next\/static\/|icons\/|favicon\.ico$)/;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.add(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // envios (POST) sempre direto na rede
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }

  if (ESTATICO.test(url.pathname)) {
    e.respondWith(
      caches.open(VERSAO).then(async (c) => {
        const guardado = await c.match(req);
        if (guardado) return guardado;
        const r = await fetch(req);
        if (r.ok) c.put(req, r.clone());
        return r;
      }),
    );
  }
});
