# Demonstração para o cliente testar

Uma loja fictícia ("Loja Demonstração") com 8 produtos em grade, 4 clientes, 13 vendas dos últimos dias, 3 condicionais, 1 troca com vale, compras e contas. O cliente testa tudo sem mexer em dados reais. Todos os números foram gerados pelas regras do próprio sistema e passam na conferência automática.

Arquivos em `docs/demo/`: `demo-loja.xlsx`, `demo-mestra.xlsx`, `guia-de-teste-cliente.pdf` (este é o que você manda ao cliente).

## Montar (30 minutos)
1. **Planilhas.** No Google Drive: Novo > Upload de arquivo > `demo-loja.xlsx` e `demo-mestra.xlsx`; abra cada uma e escolha "Abrir com Planilhas Google" (ou Arquivo > Salvar como Planilhas Google).
2. **IDs.** Copie o ID de cada planilha (trecho entre `/d/` e `/edit`). Na **mestra**, aba `Clientes` e aba `Acessos`, troque `COLE-AQUI-O-ID-DA-PLANILHA-DA-LOJA` pelo ID da planilha da **loja** (3 células).
3. **E-mails.** Troque `dono.demo@exemplo.com` pelo Gmail do cliente (dono) em: mestra `Clientes` (emailDono), mestra `Acessos` e loja `Usuarios`. Para ele testar a visão do vendedor, troque `vendedor.demo@exemplo.com` pelo segundo e-mail dele (ou o seu), em `Acessos` e `Usuarios`. Se não houver, deixe como está.
4. **Compartilhar** as duas planilhas como Editor com o e-mail da conta de serviço da demonstração (use uma conta de serviço separada da dos clientes pagantes).
5. **Vercel.** Novo projeto a partir do mesmo repositório (ex.: `balcao-demo`), com as variáveis do `docs/IMPLANTACAO.md`: `MASTER_SHEET_ID` = ID da mestra da demonstração, `GOOGLE_SERVICE_ACCOUNT_B64` da conta da demonstração, `AUTH_SECRET` novo, `AUTH_TRUST_HOST=true`, `CRON_SECRET`. Não configure `backupPlanilhaId` (demo não precisa de backup).
6. **Login do Google.** No cliente OAuth, adicione `https://<endereco-da-demo>/api/auth/callback/google` em "URIs de redirecionamento". Se a tela de consentimento estiver em **modo de teste**, adicione o Gmail do cliente em "Usuários de teste" (senão o Google bloqueia o login dele).
7. **Teste você mesmo** com o guia antes de enviar. Envie ao cliente: o endereço + o PDF.

## Reiniciar depois do teste
As datas das vendas são relativas ao dia em que a demonstração foi gerada. Para gerar de novo, com dados frescos (aniversariantes da semana, atrasos e vencimentos corretos):
```
GERAR_DEMO=1 DEMO_OUT=/tmp/demo.json npx vitest run tests/demo-gerar.test.ts
python3 scripts/demo-para-xlsx.py /tmp/demo.json docs/demo
```
Defina `DEMO_EMAIL_DONO` e `DEMO_EMAIL_VEND` antes do primeiro comando para já sair com os e-mails certos. Depois repita os passos 1 a 3 (ou cole as abas novas nas planilhas existentes).

## Cuidados
- Telefones e nomes são de exemplo. Não coloque dado real de cliente na demonstração.
- Depois do teste, remova o e-mail do cliente de `Acessos` e `Usuarios` (ou marque `ativo` = FALSE).

---

## Link de demonstração online (`?demo=true`)

O próprio app tem um modo demonstração: abre sem login Google e sem planilha, com a loja fictícia, e **guarda tudo no `localStorage` do navegador** de quem testa.

**Como publicar (projeto Vercel separado dos clientes)**
1. Novo projeto Vercel apontando para o mesmo repositório.
2. Variáveis: `DEMO_ATIVO=1` e `AUTH_SECRET` (qualquer texto longo). **Não** coloque `MASTER_SHEET_ID` nem `GOOGLE_SERVICE_ACCOUNT_B64`.
3. Depois do deploy, o link é `https://SEU-PROJETO.vercel.app/?demo=true`.

**Como funciona**
- O navegador é o dono do estado. O servidor mantém uma cópia de trabalho por visitante (memória, 3 h sem uso).
- A cada poucos segundos e a cada navegação o navegador confere a versão. Se o servidor perdeu a cópia (reinício, outra instância), o navegador devolve o que guardou, e o servidor valida antes de aceitar (só as abas e cabeçalhos do sistema, só texto, tamanho limitado).
- Faixa no topo: trocar entre Dona e Vendedora e "Reiniciar dados".
- Dados datados de hoje ficam como estavam no dia do uso; "Reiniciar dados" recalcula a partir da data atual.

**Segurança**
- Trava: se o projeto tiver planilha mestra ou conta de serviço, o modo se desliga mesmo com `DEMO_ATIVO=1`. Um projeto de cliente nunca abre sem login por engano.
- Nenhum dado real entra: tudo é fictício e fica só no navegador de quem testa.
