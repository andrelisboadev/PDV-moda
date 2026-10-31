# LGPD no Balcão Moda

A loja é a **controladora** dos dados dos seus clientes; o suporte (Bragança Digital) é a **operadora** que mantém o sistema.

## Dados guardados
Cliente: nome, telefone, bairro, dia e mês do aniversário, data da autorização. Operações: vendas, parcelas, vales, condicionais, trocas. Usuários da loja: e-mail, nome, perfil.
Não guardamos CPF, endereço completo, dado de cartão, senha nem dado sensível.

## Finalidade e base legal
Atender o cliente (crediário, condicional, troca), cobrar parcelas, avisar aniversário. Base: execução do contrato e **consentimento** para avisos e aniversário. O cadastro **só é salvo com a caixinha de autorização marcada**; a data fica registrada.

## Direitos do titular (menu "Dados (LGPD)", só o dono)
- **Cópia dos dados:** botão "Baixar os dados": gera um arquivo com cadastro, vendas, parcelas, vales, condicionais e trocas do cliente.
- **Eliminação:** botão "Apagar dados": nome, telefone, bairro e aniversário somem e o limite zera. Vendas e parcelas permanecem sem identificar a pessoa (obrigação contábil e fiscal). **Não dá para desfazer.** O backup de até 7 dias ainda contém os dados antigos e expira sozinho.
- Prazo de resposta ao titular: até 15 dias. Cada pedido fica na `Auditoria` (`lgpd_exportar`, `lgpd_anonimizar`), só com o ID do cliente.

## Segurança
Ver `docs/SEGURANCA.md`. Acesso por login Google e perfil; dados só no servidor; HTTPS e cabeçalhos de segurança; logs sem dado pessoal; limite de acessos.

## Incidente
1. Anote data, hora e o que aconteceu. 2. Tire o acesso suspeito (`Usuarios`, ativo = FALSE) e troque as chaves. 3. A loja avisa os clientes afetados e, se houver risco relevante, a ANPD, em prazo razoável. 4. Registre a causa e a correção.

## Contrato
O contrato com a loja deve prever: papéis (controladora e operadora), finalidade, prazo de guarda (enquanto o contrato durar + 30 dias para devolução dos dados), subcontratados (Google, Vercel) e o contato do encarregado. **Peça a um advogado para revisar.**
