import type { NextConfig } from "next";
import { cabecalhosDeSeguranca } from "./lib/core/cabecalhos";

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/:path*", headers: cabecalhosDeSeguranca(process.env.NODE_ENV !== "production") },
      // O service worker nunca fica em cache do navegador: atualizações chegam na hora.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] },
    ];
  },
};

export default config;
