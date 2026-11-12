import type { Metadata, Viewport } from "next";
// Fontes hospedadas no próprio app (nada é buscado no Google em tempo de uso).
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Balcão Moda",
  description: "Gestão simples para a sua loja de roupas e variedades.",
  applicationName: "Balcão Moda",
  appleWebApp: { capable: true, title: "Balcão", statusBarStyle: "default" },
  icons: { icon: "/favicon.ico", apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // usa a tela toda (com o entalhe do iPhone); o app respeita as áreas seguras
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0B6E7F" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1414" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh font-texto antialiased">{children}</body>
    </html>
  );
}
