/**
 * Fila por chave dentro de UMA instância do servidor. Serve para não gerar disputa
 * desnecessária entre duas vendas que chegam à mesma instância.
 * NÃO é a garantia de estoque: com várias instâncias (Vercel) a garantia vem da
 * conferência no livro de movimentos (lib/moda/venda.ts). A trava só reduz o atrito.
 */
const filas = new Map<string, Promise<void>>();

export async function comTrava<T>(chave: string, fn: () => Promise<T>): Promise<T> {
  const anterior = filas.get(chave) ?? Promise.resolve();
  let liberar!: () => void;
  const minha = new Promise<void>((r) => (liberar = r));
  const cadeia = anterior.then(() => minha);
  filas.set(chave, cadeia);
  await anterior;
  try {
    return await fn();
  } finally {
    liberar();
    if (filas.get(chave) === cadeia) filas.delete(chave);
  }
}
