# Balcão Moda

Gestão de produção para lojas de roupas e variedades. Google Sheets como banco (uma planilha por loja),
Next.js 15 + TypeScript, login com Google. **Estado: Fase 3 (vendas avançadas: crediário, condicional, troca, vale-troca, comissão) concluída.** Fase 4 (gestão) é a próxima.

## Rodar localmente

```bash
pnpm install
cp .env.example .env.local      # preencha os valores (veja abaixo)
pnpm test                       # 113 testes, não precisam de internet nem de credenciais
pnpm dev                        # http://localhost:3000
pnpm build && pnpm verificar:bundle
```

## Variáveis de ambiente

| Variável | O que é |
|---|---|
| `AUTH_SECRET` | segredo do Auth.js (`openssl rand -base64 32`) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | cliente OAuth "Entrar com Google" |
| `GOOGLE_SERVICE_ACCOUNT_B64` | JSON da conta de serviço em base64 (`base64 -w0 chave.json`). Só no servidor |
| `MASTER_SHEET_ID` | ID da planilha mestra (abas `Clientes` e `Acessos`) |

## Estrutura

```
lib/core/    login, sessão, perfis, camada do Sheets, cache, auditoria (serve a qualquer comércio)
lib/moda/    regras de moda: grade, estoque, venda, configuração (condicional, crediário, trocas, comissão na Fase 3)
app/         telas e rotas (Next.js App Router)
tests/       Vitest (loja A x loja B, perfis, RAW, cota 429, cache, versão)
docs/adr/    decisões importantes
```

## Regras que o código garante
- O navegador nunca fala com o Google; só o servidor, com a conta de serviço.
- A loja vem sempre da sessão. Nenhuma função recebe ID de planilha.
- Escrita sempre `RAW` (texto que começa com `=`, `+`, `-`, `@` nunca vira fórmula).
- Dinheiro em centavos inteiros. Abas de registro são só de acréscimo.
- Vendedor não recebe custo, caixa, contas nem comissões alheias (o servidor remove/recusa).
- Estoque é a soma de um livro só de acréscimo. Venda = reservar, conferir pela ordem do livro e fechar num lote atômico (ADR 0002).
- Preço, custo e limite de desconto vêm sempre do servidor, nunca do navegador.

Documentação completa (arquitetura, segurança, implantação, LGPD, manual da lojista) entra na Fase 6.
