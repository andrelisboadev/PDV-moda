import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        primaria: "rgb(var(--cor-primaria) / <alpha-value>)",
        fundo: "rgb(var(--cor-fundo) / <alpha-value>)",
        superficie: "rgb(var(--cor-superficie) / <alpha-value>)",
        texto: "rgb(var(--cor-texto) / <alpha-value>)",
        suave: "rgb(var(--cor-suave) / <alpha-value>)",
        borda: "rgb(var(--cor-borda) / <alpha-value>)",
        ok: "rgb(var(--cor-ok) / <alpha-value>)",
        atencao: "rgb(var(--cor-atencao) / <alpha-value>)",
        atraso: "rgb(var(--cor-atraso) / <alpha-value>)",
      },
      fontFamily: {
        titulo: ["var(--fonte-titulo)", "sans-serif"],
        texto: ["var(--fonte-texto)", "sans-serif"],
        valor: ["var(--fonte-valor)", "monospace"],
      },
      minHeight: { botao: "48px" },
    },
  },
  plugins: [],
};
export default config;
