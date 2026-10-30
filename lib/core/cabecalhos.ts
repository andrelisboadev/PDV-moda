/**
 * Cabeçalhos de segurança de toda resposta. Função pura para poder testar.
 *
 * CSP: o Next.js precisa de script inline para hidratar a página, então `script-src` leva
 * 'unsafe-inline' (em desenvolvimento também 'unsafe-eval'). O risco residual está em
 * docs/SEGURANCA.md. Todo o resto é fechado: sem frames, sem plugins, sem conexão externa.
 * `form-action` inclui o Google porque o login redireciona para accounts.google.com e o
 * Chrome aplica essa regra também ao redirecionamento depois do envio do formulário.
 */
export interface Cabecalho {
  key: string;
  value: string;
}

export function cabecalhosDeSeguranca(desenvolvimento: boolean): Cabecalho[] {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${desenvolvimento ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${desenvolvimento ? " ws: wss:" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self' https://accounts.google.com",
    ...(desenvolvimento ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  ];
}
