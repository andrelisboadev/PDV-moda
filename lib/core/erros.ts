/** Erros de domínio. A mensagem é segura para o usuário; detalhes técnicos vão só para o log. */
export class ErroApp extends Error {
  constructor(
    readonly codigo: "nao_autenticado" | "proibido" | "conflito" | "invalido" | "planilha_invalida" | "interno",
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export const MENSAGEM_GENERICA = "Não foi possível concluir. Tente de novo em instantes.";

/** Converte qualquer erro em mensagem para a tela, sem vazar detalhe técnico. */
export function mensagemSegura(e: unknown): string {
  return e instanceof ErroApp && e.codigo !== "interno" ? e.message : MENSAGEM_GENERICA;
}
