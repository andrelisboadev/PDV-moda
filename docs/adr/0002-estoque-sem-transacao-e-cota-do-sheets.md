# ADR 0002 — Estoque sem transação e a cota do Google Sheets

**Data:** 2026-10-14 · **Status:** aceita (Fase 2) · **Pede decisão do dono do projeto** (item 4)

## Contexto
O Sheets não tem transação, e na Vercel há várias instâncias do servidor ao mesmo tempo. Uma trava em memória
não impede duas vendas da última peça M azul em instâncias diferentes. Além disso, a cota do Sheets (confirmada na
documentação do Google) é de **60 leituras e 60 escritas por minuto por usuário, por projeto**. A conta de serviço é
um único "usuário" para todas as lojas.

## Decisões
1. **Reservar e conferir** (`lib/moda/venda.ts`): confere o saldo; grava a saída em Movimentos (reserva);
   relê o livro e soma, por peça, os movimentos **até a minha linha** na ordem em que o Google gravou; se algum
   saldo ficar negativo, desfaz com movimentos de estorno e recusa a venda. A ordem das linhas é igual para todas as
   instâncias, então de duas vendas da última peça só a primeira fica. Pode recusar à toa em disputa pesada
   (conservador); nunca vende a mais.
2. **Fechamento atômico**: Vendas, VendaItens, Pagamentos, Caixa e Auditoria vão em **um** `spreadsheets.batchUpdate`
   (AppendCells), que o Google aplica "tudo ou nada" e conta como **uma** requisição. Se falhar, a reserva é desfeita.
3. **Custo por venda**: 2 leituras + 2 escritas (antes seriam ~6 escritas). Produtos, Variações e Config vêm do cache de 30 s.
   Com 60/min por conta, cabem cerca de 30 vendas por minuto por conta de serviço.
4. **Proposta (não implementada)**: para muitas lojas, usar **uma conta de serviço por grupo de lojas** (a cota é por usuário),
   guardando na planilha mestra qual conta atende cada loja. Quando uma loja passar de milhares de variações ou de
   ~30 vendas/min no total, migrar a camada de dados para Supabase com RLS (a camada já está isolada atrás de `SheetsDriver`).

## Limites conhecidos
- Se o servidor cair entre a reserva e o desfazer, sobra uma reserva órfã (movimento de venda sem Venda).
  Todo movimento leva `origemId`; a rotina de conferência (Fase 5) lista e corrige.
- Ajuste manual de estoque (só dono) usa trava em memória, sem a conferência no livro: é raro e de uma pessoa só.
- O caminho `appendCells` (stringValue) foi testado com o cliente simulado, **não contra o Google de verdade**. Validar na Fase 7.
