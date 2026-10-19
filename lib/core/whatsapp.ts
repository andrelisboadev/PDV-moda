/**
 * Links do WhatsApp (wa.me). Só montamos o link: quem toca no botão é a lojista, no aparelho dela.
 * Nenhum dado do cliente sai do servidor para terceiros e nada é enviado automaticamente.
 */

/** Telefone brasileiro -> só dígitos com DDI 55. Retorna null se não parecer um telefone. */
export function telefoneParaWhatsapp(telefone: string | null | undefined): string | null {
  const d = (telefone ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

export function linkWhatsapp(telefone: string | null | undefined, mensagem: string): string | null {
  const n = telefoneParaWhatsapp(telefone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(mensagem)}` : null;
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? "";

/** "25/10/2026" a partir de uma data ISO. */
export const dataBr = (iso: string): string => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

export const mensagemCondicional = (o: { cliente: string; loja: string; devolverAte: string }) =>
  `Oi, ${primeiroNome(o.cliente)}! Aqui é da ${o.loja}. Passando para lembrar das peças que você levou para experimentar em casa. ` +
  `Pode trazer o que não ficar até ${dataBr(o.devolverAte)}? Obrigada!`;

export const mensagemCobranca = (o: { cliente: string; loja: string; valor: string; vencimento: string }) =>
  `Oi, ${primeiroNome(o.cliente)}! Aqui é da ${o.loja}. Sua parcela de ${o.valor} vence em ${dataBr(o.vencimento)}. ` +
  `Qualquer dúvida é só responder aqui. Obrigada!`;
