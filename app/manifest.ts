import type { MetadataRoute } from "next";

/** Manifesto do app instalável (PWA): ícone na tela inicial, abre em tela cheia, sem barra do navegador. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Balcão Moda",
    short_name: "Balcão",
    description: "Gestão simples para a sua loja de roupas e variedades.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F4F8F7",
    theme_color: "#0B6E7F",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nova venda", url: "/vender", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Caixa", url: "/caixa", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Estoque", url: "/estoque", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
