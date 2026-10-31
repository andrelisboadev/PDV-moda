# Arquitetura do Balcão Moda

## Visão geral
- **App:** Next.js 15 (App Router), TypeScript estrito, Tailwind. Hospedado na Vercel.
- **Banco:** Google Sheets. Uma planilha por loja e uma planilha mestra. Só o servidor fala com o Google, por uma conta de serviço; o navegador nunca vê a planilha.
- **Login:** Google (Auth.js v5, sessão JWT de 12 h). Só entra quem está ativo na aba `Usuarios` da loja.
- **Uma instalação por cliente:** cada cliente tem o seu projeto na Vercel, a sua planilha de loja, a sua planilha mestra e (de preferência) a sua conta de serviço. Mesmo código, variáveis diferentes. Máximo combinado: 5 clientes por sistema.

## Camadas
```
app/          telas e rotas (Next.js). Telas só chamam funções de lib/ por Server Actions (executar()).
lib/core/     serve a qualquer comércio: sessão, perfis, camada do Sheets, cache, auditoria, limite, backup
lib/moda/     regras de moda: grade, estoque, venda, crediário, condicional, troca, compras, contas...
tests/        Vitest, com um Google Sheets simulado em memória (nenhum teste usa a internet)
```
`lib/core` não importa nada de `lib/moda`. Para outro tipo de comércio troca-se `lib/moda`.

## Como uma requisição é resolvida
1. O middleware barra quem não tem sessão e vendedor em rota do dono, e aplica o limite de requisições.
2. A tela ou ação chama `obterContexto()`: pega o e-mail da sessão, descobre a loja na planilha mestra (aba `Acessos`) e o perfil na aba `Usuarios` da loja. **A loja nunca vem de parâmetro, corpo ou URL.**
3. Toda ação começa com `ctx.exigir("permissão")`. O servidor decide; a tela só esconde botões.
4. `executar()` aplica o limite por usuário, roda a ação e devolve erro genérico para a tela (detalhe técnico só no log, sem dado pessoal).

## Dados
Abas da loja: Produtos, Variacoes, Movimentos, Clientes, Vendas, VendaItens, Pagamentos, Condicionais, CondicionalItens, Trocas, TrocaItens, CreditosLoja, Fornecedores, Compras, CompraItens, Contas, Caixa, Usuarios, Auditoria, Config.

Regras que o código garante:
- Dinheiro em **centavos inteiros**; percentuais em pontos-base (10% = 1000). Ids ULID.
- Escrita sempre `RAW`: texto começando com `=`, `+`, `-` ou `@` nunca vira fórmula.
- **Livros só de acréscimo:** Movimentos (estoque), CreditosLoja (vale-troca), Caixa e Auditoria nunca são editados. O saldo é a soma do livro.
- Cadastros têm `versao`; edição simultânea é detectada e a segunda pessoa recebe um aviso.
- Exclusão lógica (`removidoEm`), nunca apagar linha.
- Estoque e vale-troca sem transação: **reservar, conferir pela ordem do livro e fechar num lote atômico** (ADR 0002 e 0003).
- Preço, custo e limite de desconto vêm sempre do servidor.

## Limites do Google Sheets
60 leituras e 60 escritas por minuto por conta de serviço. Mitigações: cache de 30 s por loja, leitura de várias abas numa chamada, escrita em lote atômico, retry com espera quando a cota estoura. Uma conta de serviço por cliente evita que um atrapalhe o outro. Loja com muito movimento (centenas de vendas por dia) deve migrar para banco de dados; a camada `lib/core/sheets` foi isolada para isso.

## Rotinas automáticas
Vercel Cron chama `/api/cron/diario` às 3h (Brasília), com `CRON_SECRET`: backup das abas e conferência dos registros (ADR 0004).

## Decisões
`docs/adr/` guarda cada decisão importante com o motivo. Segurança: `docs/SEGURANCA.md`.
