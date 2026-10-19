# ADR 0003 — Vendas avançadas (Fase 3)

**Status:** aceita · **Data:** 2026-10-16

## Decisões
1. **Reserva e conferência para qualquer saldo** (`lib/moda/reserva.ts`): vale em peças (venda, troca, condicional) e em vale-troca do cliente. Linha do livro decide quem ficou com o saldo; quem perdeu é estornado.
2. **Condicional**: a saída já baixa o estoque; "comprou" vira venda sem baixar de novo (`baixaPrevia`); "devolveu" repõe no mesmo lote. Cada peça é resolvida uma vez (conferência de versão em lote). "Vencido" é calculado pela data.
3. **Troca**: valor devolvido = valor líquido pago (desconto rateado, soma exata). Sobra vira vale-troca ou dinheiro (só o dono, limitado ao que entrou em dinheiro). Diferença paga em Caixa.
4. **Comissão**: percentual gravado em cada venda/troca; devolução abate de quem vendeu; relatório = soma das parcelas arredondadas.
5. **Cliente**: só o dono define limite de crediário; cadastro exige consentimento (LGPD).

## Limites conhecidos
- Devolução de venda no crediário não abate as parcelas abertas (ajuste manual até a Fase 4, Contas a receber).
- Dupla devolução simultânea da mesma peça em instâncias diferentes só é barrada por trava em memória + conferência na leitura; risco baixo (botão único), a conferência de movimentos da Fase 5 detecta.
- Limite de crediário não é conferido com ordem de livro (duas vendas simultâneas no crediário do mesmo cliente podem passar do limite por um instante).
- Condicional: uma forma de pagamento por confirmação.
