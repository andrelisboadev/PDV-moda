import type { NextConfig } from "next";
import { cabecalhosDeSeguranca } from "./lib/core/cabecalhos";

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: cabecalhosDeSeguranca(process.env.NODE_ENV !== "production") }];
  },
};

export default config;
