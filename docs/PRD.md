# PRD: Balcão Moda

Sistema de gestão para pequenas lojas de roupas e variedades. Versão 1.0 (Fases 1 a 7 entregues).

## 1. Problema
Lojas pequenas de roupa controlam estoque por tamanho e cor, fiado, condicional e troca em caderno, WhatsApp e planilha solta. Resultado: peça que some do estoque, fiado esquecido, troca sem registro, caixa que não fecha e nenhuma visão de lucro.

## 2. Público
- **Cliente (comprador):** dona ou dono de loja de roupas e variedades com 1 a 5 funcionários, no Pará e região, pouco familiarizado com sistemas.
- **Usuários:** dono (tudo) e vendedor (vende, atende, não vê custo, caixa nem contas).
- **Operador:** Bragança Digital (implanta, dá suporte, mantém).

## 3. Objetivos
1. Vender no celular em poucos toques, com estoque baixando sozinho.
2. Controlar o que a loja de roupa tem de particular: grade (tamanho × cor), crediário, condicional, troca e vale-troca.
3. Dar ao dono o caixa fechado e o lucro do mês sem ele fazer conta.
4. Custo de operação baixo e dados nas mãos da loja (planilha Google dela).
5. Segurança e LGPD tratadas desde o início.

**Fora de escopo (v1):** nota fiscal, integração com maquininha, loja virtual, múltiplas filiais por cliente, app nativo, despesas fixas (aluguel, salários), relatórios contábeis.

## 4. Requisitos funcionais
| Área | Requisito | Perfil |
|---|---|---|
| Acesso | Login com Google; só entra quem está ativo na planilha da loja | todos |
| Estoque | Produto com grade tamanho × cor, SKU e código de barras próprios, mínimo por peça, alerta de estoque baixo, ajuste (saldo inicial, contagem, perda, avaria) | dono (ver: todos, sem custo) |
| Venda | Busca por nome ou código de barras, desconto com teto do vendedor, pagamento dividido (dinheiro, Pix, débito, crédito em até 12x, crediário, vale-troca), taxa da maquininha por forma | todos |
| Crediário | Limite por cliente, parcelas mês a mês, cobrança por WhatsApp, baixa de parcela no caixa | dono define limite e baixa |
| Condicional | Saída com prazo, reserva de estoque, resolução peça a peça (comprou/devolveu), alerta de vencido | todos |
| Troca e devolução | Dentro do prazo, troca por outra peça, vale-troca ou dinheiro (só dono) | todos (dinheiro: dono) |
| Comissão | % por vendedor, congelada no momento da venda | cada um vê a sua; dono vê todas |
| Clientes | Cadastro com consentimento, aniversário, saldo, WhatsApp | todos |
| Compras | Compra por grade, à vista (saída do caixa) ou a prazo (contas a pagar), atualização de custo opcional | dono |
| Contas | A pagar e a receber, situação (atrasada, hoje, a vencer), baixa com lançamento no caixa | dono |
| Caixa | Entradas e saídas do dia por forma; fechamento com conferência da gaveta | dono |
| Resumo | Faturamento, custo, taxas, lucro bruto, margem, mais vendidos, por vendedor, a receber e a pagar | dono |
| Etiquetas | Impressão com preço e EAN-13, sem custo | todos |
| Painel | Vendas do dia, atrasos, estoque baixo, condicionais vencidos, aniversariantes | todos (dono vê mais) |
| Configurações | Taxas, desconto máximo, prazos, parcelas | dono |
| LGPD | Exportar e anonimizar dados de um cliente | dono |
| Operação | Backup diário (7 dias) e conferência automática dos registros | automático |

## 5. Requisitos não funcionais
- **Segurança:** OWASP Top 10 revisado (`docs/SEGURANCA.md`); isolamento entre lojas; escrita RAW; cabeçalhos e CSP; limite de requisições; dependências sem vulnerabilidades conhecidas.
- **Integridade:** dinheiro em centavos inteiros; livros (estoque, vale, caixa, auditoria) só de acréscimo; reserva-e-conferência contra venda dupla; edição concorrente detectada.
- **Usabilidade:** celular primeiro, botões grandes, linguagem simples em português, acessibilidade básica (rótulos, foco, contraste).
- **Desempenho:** cache de 30 s e leitura em lote por causa da cota do Sheets (60 leituras e 60 escritas/min por conta de serviço).
- **Disponibilidade:** Vercel; backup diário; recuperação manual a partir do backup.
- **Qualidade:** 149 testes automatizados (isolamento entre lojas, perfis, vendas, crediário, compras, contas, LGPD, backup), sem depender de internet.

## 6. Modelo comercial
Máximo de 5 clientes por sistema, uma instalação independente por cliente. Implantação R$ 450 + mensalidade R$ 149. Oferta de lançamento para 5 lojas fundadoras: R$ 225 + R$ 99 por 3 meses. Teste de 14 dias. Custo fixo: Vercel Pro (US$ 20 por assento, cobre todos os projetos).

## 7. Métricas de sucesso
- Primeira venda feita no sistema no dia da implantação.
- Zero divergências na conferência diária na primeira semana.
- Caixa fechado todo dia em 4 de 5 dias úteis.
- Dono consegue ver o resumo do mês sem ajuda do suporte.
- Retenção: 4 das 5 lojas fundadoras pagando após o teste.

## 8. Riscos
| Risco | Mitigação |
|---|---|
| Cota do Google Sheets | cache, lote, uma conta de serviço por cliente, Upstash |
| Mexer à mão na planilha | conferência diária, manual com aviso, planilha compartilhada só com o dono |
| Perda da conta Google do backup | exportação manual mensal |
| Loja crescer além da planilha | camada `lib/core/sheets` isolada para migrar a banco de dados |
| Obrigações legais (LGPD, contrato) | `docs/LGPD.md`, revisão de advogado |
| Uso comercial no plano Hobby | Vercel Pro antes do primeiro cliente |

## 9. Fases (todas entregues)
1 Fundação · 2 Núcleo de moda · 3 Vendas avançadas · 4 Gestão · 5 Endurecimento · 6 Documentação · 7 Entrega. Pendente: teste manual completo e primeira implantação (`docs/ENTREGA.md`).

## 10. Backlog (v2)
Despesas fixas e DRE simples; metas por vendedor; histórico do cliente com compras; importação de produtos por planilha; recibo em PDF; fidelidade por pontos; migração opcional para banco de dados.
