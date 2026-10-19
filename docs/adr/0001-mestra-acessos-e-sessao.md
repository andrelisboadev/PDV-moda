# ADR 0001 — Aba Acessos na planilha mestra e sessão sem loja no token

**Data:** 2026-10-14 · **Status:** aceita (Fase 1) · **Pede revisão do dono do projeto**

## Contexto
O briefing diz que a planilha mestra liga o e-mail **do dono** à planilha e ao plano. Mas as vendedoras também entram
com o Google, e o sistema precisa descobrir a loja delas sem varrer todas as planilhas (a cota é de 60 leituras por minuto).

## Decisões
1. **Aba `Acessos` na mestra** (e-mail → ID da planilha), além de `Clientes`. Ela só serve para *achar* a loja.
   Quem pode entrar é decidido pela aba `Usuarios` da própria loja. Estar em `Acessos` sem estar ativo em `Usuarios` não dá acesso (há teste).
   E-mail em duas lojas é recusado, em vez de adivinhar.
2. **A loja não vai no cookie de sessão.** O token guarda só e-mail e papel (o papel serve ao middleware, que não alcança o Sheets).
   A loja e o papel reais são redescobertos no servidor a cada requisição (com cache de 30 s). Assim, quem sai da aba `Usuarios`
   perde o acesso em até 30 s, mesmo com o cookie ainda válido.
3. **Fontes hospedadas no app** (`@fontsource`), não no Google Fonts.

## Consequências e limites conhecidos
- Logout apaga o cookie, mas o JWT em si não pode ser revogado no servidor antes de expirar (12 h). O que mitiga: item 2.
  Revogação de verdade exige uma lista de sessões em Redis (Upstash entra na Fase 5) — fica como pendência.
- O papel no token pode ficar defasado (promoção/rebaixamento) até o próximo login. O servidor sempre confere de novo; o token só
  alimenta o bloqueio de rotas no middleware.
- O Sheets não tem compare-and-set. A conferência de `versao` antes de gravar reduz, mas não elimina, a corrida entre duas pessoas
  editando o mesmo cadastro. Por isso dinheiro e estoque são só de acréscimo (Fase 2).
