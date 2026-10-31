# Implantação de um novo cliente

Tempo estimado: 1 hora. Faça com o cliente por perto para ele aprender a base. **Um projeto Vercel, uma planilha de loja, uma planilha mestra e uma conta de serviço por cliente.** Pré-requisito comercial: Vercel Pro (o plano Hobby não permite uso comercial) e repositório privado.

## 1. Google Cloud (uma vez por cliente)
1. Crie um projeto no Google Cloud (ex.: `balcao-<loja>`). Ative a **Google Sheets API**.
2. **Credenciais > Criar credenciais > ID do cliente OAuth** (aplicativo da Web). Origem: `https://<dominio>`. Redirecionamento: `https://<dominio>/api/auth/callback/google`. Anote ID e segredo.
3. **Contas de serviço > Criar**. Gere uma chave JSON. **Nunca** cole a chave em conversa, e-mail ou print.
4. Converta para base64 e confira (Linux): `base64 -w0 chave.json > chave.b64` e `base64 -d chave.b64 | python3 -c "import sys,json; json.load(sys.stdin); print('ARQUIVO OK')"`. Apague `chave.json` depois de colar na Vercel.

## 2. Planilhas
1. **Mestra:** copie o modelo (abas `Clientes` e `Acessos`). Em `Clientes`: nome da loja, e-mail do dono, ID da planilha da loja, plano, ativo = TRUE. Em `Acessos`: uma linha por e-mail que pode entrar (dono e vendedores), ativo = TRUE.
2. **Loja:** copie o modelo da loja (20 abas com cabeçalhos prontos). Em `Usuarios`: o dono (papel `dono`) e os vendedores (papel `vendedor`, comissão em pontos-base: 500 = 5%).
3. Compartilhe **as duas planilhas como Editor** com o e-mail da conta de serviço. Não compartilhe com mais ninguém além do dono.
4. **Backup:** crie uma planilha vazia "Backup <loja>" na sua conta, compartilhe como Editor com a conta de serviço e, na aba `Config` da loja, adicione `chave` = `backupPlanilhaId`, `valor` = ID da planilha de backup.

O ID da planilha é o trecho entre `/d/` e `/edit` no endereço.

## 3. Vercel
1. Importe o repositório como novo projeto. Domínio próprio ou `*.vercel.app`.
2. Variáveis de ambiente (Settings > Environment Variables, ambiente Production):

| Variável | Valor |
|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | do passo 1.2 (cuidado com digitação: o nome exato importa) |
| `AUTH_TRUST_HOST` | `true` |
| `GOOGLE_SERVICE_ACCOUNT_B64` | conteúdo de `chave.b64`, sem aspas nem quebra de linha |
| `MASTER_SHEET_ID` | ID da planilha mestra |
| `CRON_SECRET` | `openssl rand -base64 32` |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | opcional (recomendado com mais de uma loja) |

3. **Redeploy** depois de mexer em qualquer variável.

## 4. Conferência antes de entregar
- [ ] Dono entra com Google; vendedor entra e **não** vê Caixa, Contas, Compras, Resumo, Configurações.
- [ ] E-mail fora da planilha recebe "sem acesso".
- [ ] Configurações: taxas da maquininha, desconto máximo do vendedor, prazos. Salvar e reabrir.
- [ ] Novo produto com grade; ajuste de saldo inicial; busca por nome e por código de barras.
- [ ] Venda no Pix, venda dividida, venda no crediário (parcelas aparecem em Contas), condicional, troca, vale-troca.
- [ ] Caixa e Fechamento do dia batem com as vendas.
- [ ] Etiqueta imprime e o leitor de código de barras lê.
- [ ] Rotina diária: abra `/api/cron/diario` com o cabeçalho `Authorization: Bearer <CRON_SECRET>` (ou espere as 3h) e confira se apareceu a aba `bk-AAAA-MM-DD ...` na planilha de backup.
- [ ] Apague vendas e produtos de teste (ou use uma planilha limpa para produção).

## 5. Entrega ao cliente
Treinamento de 1 hora com o `docs/MANUAL-LOJISTA.md`. Combine: quem é o dono dos acessos, que ninguém compartilha a senha do Google, e que **nunca se apaga linha na planilha**: o sistema trata o que precisa ser desfeito.

## Desativar um cliente
Na mestra, `ativo = FALSE` na linha do cliente (bloqueia todos os acessos na hora). Guarde o backup por 30 dias, depois apague a planilha de backup e remova o projeto Vercel. Apague a chave da conta de serviço no Google Cloud.
