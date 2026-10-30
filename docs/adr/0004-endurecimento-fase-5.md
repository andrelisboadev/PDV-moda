# ADR 0004: Endurecimento (Fase 5)

## Decisões
1. **Cabeçalhos e CSP em `next.config.ts`** (função pura `cabecalhosDeSeguranca`, testada). `script-src` leva `'unsafe-inline'` porque o Next.js hidrata a página com script inline; o resto é fechado. Alternativa (nonce por requisição) obriga todas as páginas a serem dinâmicas e foi adiada.
2. **Limite de requisições por janela fixa**, no middleware (por IP: login e envios) e em `executar` (por usuário). Usa Upstash REST se configurado; senão memória da instância. Se a Upstash falhar, cai para a memória: o limitador nunca derruba o sistema.
3. **Backup por cópia de abas** (`sheets.copyTo`) para uma planilha de backup do dono do negócio, guardando 7 dias (`bk-AAAA-MM-DD <aba>`). Conta de serviço não tem espaço no Drive, então não consegue criar arquivos; copiar abas para planilha existente funciona. Cada loja aponta a sua planilha de backup em `Config` (`backupPlanilhaId`). A retenção só apaga depois de a cópia do dia ter dado certo.
4. **Conferência automática** (`lib/moda/reconciliacao.ts`): pagamentos = total, itens − desconto = total, baixa de estoque = itens, caixa = pagamentos em dinheiro real, vale nunca negativo. Só lê; divergências vão para a Auditoria (usuário `sistema`) com a regra e o ID, nunca dados pessoais.
5. **Rotina diária** em Vercel Cron (`0 6 * * *` UTC = 03h em Brasília), protegida por `CRON_SECRET` (comparação em tempo constante). Fica fora do middleware de login; cada loja é isolada das outras.
6. **LGPD**: exportar e anonimizar cliente, só o dono, com auditoria. Anonimizar mantém vendas e parcelas (obrigação contábil) sem identificar a pessoa.
7. **Login de teste (Playwright)**: provedor `e2e` só existe se `E2E_LOGIN_SECRET` (24+) estiver definido E nenhuma variável `VERCEL*` existir. O e-mail ainda precisa estar ativo na planilha.
8. **Dependências**: Next 15.5.28 e Zod 4 (correções de segurança); `qs` fixado em `>=6.16.1` por override.
