# Entrega (Fase 7)

## Antes de cobrar o primeiro cliente
- [ ] Repositório do GitHub **privado**.
- [ ] Vercel **Pro** (Hobby não permite uso comercial).
- [ ] `CRON_SECRET` na Vercel e backup funcionando no ambiente de teste (aba `bk-...` aparece na planilha de backup).
- [ ] Roteiro manual completo no ambiente de teste: produto e grade, venda no Pix, venda dividida, crediário e baixa, condicional, troca com vale, compra à vista e a prazo, fechamento do dia, resumo, etiqueta, visão do vendedor, LGPD.
- [ ] Contrato revisado por advogado; trocar os campos `[data limite]` e demais marcadores da proposta e do contrato.
- [ ] Chaves de teste que apareceram em tela ou conversa já foram trocadas (feito) e nenhuma chave está no repositório.
- [ ] `pnpm audit --prod` sem vulnerabilidades; `pnpm test` e `pnpm build` passando.

## Primeira loja (fundadora)
1. Combine data de início e quem será o dono dos acessos.
2. Siga `docs/IMPLANTACAO.md` (1 hora), usando as planilhas de `docs/modelo`.
3. Cadastre os produtos com o cliente (leve a lista; comece pelos 20 mais vendidos) e faça a contagem de saldo inicial.
4. Treinamento de 1 hora com `docs/MANUAL-LOJISTA.md`, vendedor junto.
5. Acompanhe a primeira semana: confira a aba `Auditoria` (ações `divergencia_*`) e o backup diário.
6. Dia 7 e dia 14: ligação curta (o que travou, o que falta). Teste gratuito de 14 dias, depois contrato.

## Rotina mensal de manutenção (por cliente)
- Conferir backup dos últimos dias e divergências.
- `pnpm audit --prod`; atualizar dependências com correção de segurança e fazer deploy.
- Conferir uso da cota do Google (se aparecer "muitas ações" com frequência, ver Upstash e conta de serviço dedicada).
- Revisar usuários ativos com o dono.
- Uma exportação manual da planilha (.xlsx) guardada fora do Google.

## Limites conhecidos
- Planilha como banco: indicada para lojas pequenas. Com centenas de vendas por dia, planejar migração para banco de dados.
- Uma venda ou compra por vez; não há emissão de nota fiscal nem integração com maquininha.
- Resumo mostra lucro bruto; despesas fixas ainda não são lançadas (só compras e contas pagas pelo caixa).
