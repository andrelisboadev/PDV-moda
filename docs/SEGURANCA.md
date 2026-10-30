# Segurança do Balcão Moda

Revisão contra o OWASP Top 10 (2021). Última atualização: Fase 5.

| Risco | Como o sistema trata | Onde / teste |
|---|---|---|
| A01 Controle de acesso quebrado | Loja e perfil vêm da sessão + planilha mestra + aba `Usuarios`, a cada requisição. Nenhuma função recebe ID de planilha. Toda ação chama `ctx.exigir(...)`. Middleware só reforça. | `contexto.ts`, `permissoes.ts`, `tests/isolamento`, `tests/permissoes` |
| A02 Falhas criptográficas | Sem senhas guardadas (login Google). Sessão JWT em cookie `httpOnly`, `secure`, `sameSite=lax`, 12 h. HSTS de 1 ano. Chave da conta de serviço só em variável de ambiente. | `auth.config.ts`, `cabecalhos.ts` |
| A03 Injeção | Escrita sempre `RAW` (texto com `=`, `+`, `-`, `@` não vira fórmula). Entrada validada com Zod `.strict()`. Não há SQL. | `tests/sheets`, `schema.ts` |
| A04 Design inseguro | Preço, custo e limite de desconto vêm só do servidor. Estoque e vale-troca: reservar, conferir pela ordem do livro e fechar em lote atômico. Livros de registro são só de acréscimo. | ADR 0002 e 0003 |
| A05 Configuração insegura | CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP. `X-Powered-By` removido. Rotina diária exige segredo. Login de teste não existe na Vercel. | `next.config.ts`, `tests/fase5` |
| A06 Componentes vulneráveis | `pnpm audit --prod` sem vulnerabilidades (Next 15.5.28, Zod 4.6, `qs` por override). Rodar a cada mudança de dependência. | `package.json` |
| A07 Falhas de autenticação | Só Google com e-mail verificado e ativo na planilha. Limite de 20 req/min por IP nas rotas de login; 240/min em envios; 120 ações/min por usuário. | `limite.ts`, `auth.config.ts`, `acao.ts` |
| A08 Integridade de dados | Versão por linha (edição simultânea é detectada). Conferência diária de pagamentos, estoque, caixa e vales. | `reconciliacao.ts` |
| A09 Registro e monitoramento | Auditoria de vendas, trocas, limites, configurações, LGPD e divergências. Log técnico só com tipo de erro, nunca dado pessoal ou chave. | `log.ts`, aba `Auditoria` |
| A10 SSRF | O servidor só chama a API do Google Sheets (e a Upstash, se configurada), com URLs fixas. Nenhuma URL vem do usuário. | `google.ts`, `limite.ts` |

## Riscos que aceitamos (e por quê)
- **`'unsafe-inline'` em `script-src`**: o Next.js precisa para hidratar. Mitigação: sem conteúdo de usuário renderizado como HTML, resto da CSP fechado. Reavaliar com nonce se o sistema ganhar páginas públicas.
- **Limite em memória sem Upstash**: cada instância conta separado, então o limite real é maior. Configure a Upstash quando tiver mais de uma loja ou tráfego.
- **Cota do Google Sheets** (60 leituras e 60 escritas por minuto por conta de serviço): por isso uma conta de serviço por cliente. Cache de 30 s e escritas em lote reduzem o uso.
- **Backup no Google**: se a conta Google do dono do backup for perdida, o backup também. Faça uma exportação manual mensal (Arquivo > Baixar > .xlsx).

## Rotina operacional
1. **Backup**: crie uma planilha vazia "Backup <loja>", compartilhe como Editor com o e-mail da conta de serviço e coloque o ID dela na aba `Config` da loja (`backupPlanilhaId`). A rotina roda todo dia às 03h (Brasília).
2. **Conferência**: divergências aparecem na aba `Auditoria` com ação `divergencia_*`. Qualquer uma exige olhar no mesmo dia.
3. **Chaves**: se uma chave vazar, apague no Google Cloud, crie outra, atualize a variável na Vercel e faça novo deploy.
4. **LGPD**: pedido de cópia ou exclusão pelo menu "Dados (LGPD)", em até 15 dias. Anonimizar não pode ser desfeito.
5. **Incidente**: anote data e hora, tire o acesso da pessoa em `Usuarios` (ativo = FALSE), troque as chaves e avise os clientes afetados.
