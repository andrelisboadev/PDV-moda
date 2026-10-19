/**
 * Definição ÚNICA de todas as abas da planilha.
 * Daqui saem: cabeçalhos, validação (Zod) e tipos TypeScript.
 * Dinheiro = inteiro em centavos. Percentual = pontos-base (10% = 1000).
 */
import { z } from "zod";

export const MAX_TEXTO = 500;

const texto = (max = MAX_TEXTO) => z.string().max(max);
const textoOpc = (max = MAX_TEXTO) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : v), z.string().max(max).optional());
const inteiro = z.coerce.number().int().safe();
const centavos = z.coerce.number().int().min(0).max(100_000_000_00); // até R$ 100 milhões
const centavosOpc = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().int().min(0).max(100_000_000_00).optional(),
);
const pontosBase = z.coerce.number().int().min(0).max(10_000); // 0% a 100%
const qtd = z.coerce.number().int().min(-100_000).max(100_000);
const iso = z.string().max(40);
const isoOpc = textoOpc(40);
const bool = z.preprocess((v) => v === true || v === "TRUE" || v === "true" || v === "1", z.boolean());

/** Campos que toda aba tem no começo. */
const inicio = {
  id: z.string().min(1).max(40),
  versao: z.coerce.number().int().min(1),
  criadoEm: iso,
  criadoPor: texto(120),
};
/** Campo que toda aba tem no fim (exclusão lógica). */
const fim = { removidoEm: isoOpc };

export interface DefAba {
  nome: string;
  /** Só acréscimo: nunca editar nem remover linhas. */
  somenteAcrescimo: boolean;
  schema: z.ZodTypeAny;
  cabecalhos: string[];
}

export function aba<S extends z.ZodRawShape>(
  nome: string,
  negocio: S,
  opts: { somenteAcrescimo?: boolean } = {},
) {
  const shape = { ...inicio, ...negocio, ...fim } as typeof inicio & S & typeof fim;
  return {
    nome,
    somenteAcrescimo: opts.somenteAcrescimo ?? false,
    shape,
    schema: z.object(shape).strict(),
    cabecalhos: Object.keys(shape),
  };
}

export const FORMAS = ["dinheiro", "pix", "debito", "credito", "crediario", "credito_loja"] as const;
export const PAPEIS = ["dono", "vendedor"] as const;

export const ABAS = {
  Produtos: aba("Produtos", {
    nome: texto(120),
    categoria: texto(80),
    marca: textoOpc(80),
    colecao: textoOpc(80),
    tipo: z.enum(["grade", "simples"]),
    custoCentavos: centavos,
    precoCentavos: centavos,
  }),
  Variacoes: aba("Variacoes", {
    produtoId: texto(40),
    sku: texto(60),
    tamanho: texto(20),
    cor: texto(40),
    codigoBarras: textoOpc(40),
    minimo: z.coerce.number().int().min(0).max(100_000),
    precoCentavos: centavosOpc,
  }),
  Movimentos: aba(
    "Movimentos",
    {
      variacaoId: texto(40),
      tipo: z.enum([
        "venda", "compra", "ajuste", "estorno", "troca", "condicional_saida", "condicional_retorno",
      ]),
      quantidade: qtd, // com sinal: saída negativa, entrada positiva
      origemId: textoOpc(40),
    },
    { somenteAcrescimo: true },
  ),
  Clientes: aba("Clientes", {
    nome: texto(120),
    telefone: textoOpc(30),
    bairro: textoOpc(80),
    aniversarioDia: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(1).max(31).optional()),
    aniversarioMes: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(1).max(12).optional()),
    limiteCrediarioCentavos: centavos,
    consentimentoEm: iso,
  }),
  Vendas: aba("Vendas", {
    data: iso,
    clienteId: textoOpc(40),
    vendedorId: texto(40),
    descontoCentavos: centavos,
    totalCentavos: centavos,
    /** Comissão do vendedor NO MOMENTO da venda (pontos-base). Mudar depois não altera o passado. */
    comissaoPontosBase: pontosBase,
    status: z.enum(["concluida", "estornada"]),
  }),
  VendaItens: aba("VendaItens", {
    vendaId: texto(40),
    variacaoId: texto(40),
    nomeNoMomento: texto(120),
    tamanho: texto(20),
    cor: texto(40),
    quantidade: z.coerce.number().int().min(1).max(10_000),
    precoCentavos: centavos,
    custoCentavos: centavos,
  }),
  Pagamentos: aba("Pagamentos", {
    vendaId: texto(40),
    forma: z.enum(FORMAS),
    valorCentavos: centavos,
    parcelas: z.coerce.number().int().min(1).max(24),
    taxaCentavos: centavos,
  }),
  Condicionais: aba("Condicionais", {
    clienteId: texto(40),
    vendedorId: texto(40),
    saidaEm: iso,
    devolverAte: iso,
    status: z.enum(["aberto", "finalizado", "vencido"]),
  }),
  CondicionalItens: aba("CondicionalItens", {
    condicionalId: texto(40),
    variacaoId: texto(40),
    quantidade: z.coerce.number().int().min(1).max(10_000),
    resultado: z.enum(["pendente", "comprou", "devolveu"]),
  }),
  Trocas: aba("Trocas", {
    vendaId: texto(40),
    clienteId: textoOpc(40),
    vendedorId: texto(40),
    comissaoPontosBase: pontosBase,
    tipo: z.enum(["troca", "credito", "devolucao"]),
    motivo: texto(200),
    /** Valor líquido (já com o desconto da venda) das peças devolvidas. */
    valorCentavos: centavos,
    /** Valor das peças levadas no lugar (zero se for só devolução). */
    novoTotalCentavos: centavos,
    /** O que aconteceu com a sobra a favor do cliente. */
    destino: z.enum(["nenhum", "vale", "dinheiro"]),
  }),
  TrocaItens: aba("TrocaItens", {
    trocaId: texto(40),
    variacaoId: texto(40),
    sentido: z.enum(["devolvido", "levado"]),
    quantidade: z.coerce.number().int().min(1).max(10_000),
    valorCentavos: centavos,
  }),
  CreditosLoja: aba(
    "CreditosLoja",
    {
      clienteId: texto(40),
      valorCentavos: inteiro, // com sinal: uso do vale é negativo
      origemId: textoOpc(40),
      motivo: z.enum(["emissao", "uso", "estorno"]),
    },
    { somenteAcrescimo: true },
  ),
  Fornecedores: aba("Fornecedores", {
    nome: texto(120),
    telefone: textoOpc(30),
    prazoPadraoDias: z.coerce.number().int().min(0).max(365),
  }),
  Compras: aba("Compras", {
    fornecedorId: texto(40),
    data: iso,
    pagamento: z.enum(["avista", "prazo"]),
    totalCentavos: centavos,
  }),
  CompraItens: aba("CompraItens", {
    compraId: texto(40),
    variacaoId: texto(40),
    quantidade: z.coerce.number().int().min(1).max(100_000),
    custoCentavos: centavos,
  }),
  Contas: aba("Contas", {
    tipo: z.enum(["pagar", "receber"]),
    descricao: texto(200),
    parceiroNome: textoOpc(120),
    parceiroId: textoOpc(40),
    refId: textoOpc(40),
    parcela: z.coerce.number().int().min(1).max(60),
    totalParcelas: z.coerce.number().int().min(1).max(60),
    vencimento: iso,
    valorCentavos: centavos,
    status: z.enum(["aberta", "paga"]),
    pagoEm: isoOpc,
  }),
  Caixa: aba(
    "Caixa",
    {
      data: iso,
      tipo: z.enum(["entrada", "saida"]),
      descricao: texto(200),
      categoria: texto(80),
      valorCentavos: centavos,
      forma: z.enum(FORMAS),
      origemId: textoOpc(40),
    },
    { somenteAcrescimo: true },
  ),
  Usuarios: aba("Usuarios", {
    email: z.string().email().max(200),
    nome: texto(120),
    papel: z.enum(PAPEIS),
    ativo: bool,
    comissaoPontosBase: pontosBase,
  }),
  Auditoria: aba(
    "Auditoria",
    {
      quando: iso,
      usuario: texto(200),
      acao: texto(80),
      entidade: texto(60),
      entidadeId: textoOpc(40),
    },
    { somenteAcrescimo: true },
  ),
  Config: aba("Config", {
    chave: texto(80),
    valor: texto(500),
  }),
} as const;

export type NomeAba = keyof typeof ABAS;
export type Linha<N extends NomeAba> = z.infer<(typeof ABAS)[N]["schema"]>;

export const NOMES_SOMENTE_ACRESCIMO = (Object.values(ABAS) as DefAba[])
  .filter((a) => a.somenteAcrescimo)
  .map((a) => a.nome);

/** Cabeçalho esperado de uma aba (linha 1). */
export function cabecalhoDe(nome: NomeAba): string[] {
  return [...ABAS[nome].cabecalhos];
}

/* ---------- versões genéricas (servem às abas da loja e às da planilha mestra) ---------- */

/** Linha crua do Sheets (strings) -> objeto validado. Lança se inválida. */
export function lerLinhaDef(def: DefAba, valores: unknown[]): Record<string, unknown> {
  const bruto: Record<string, unknown> = {};
  def.cabecalhos.forEach((c, i) => {
    bruto[c] = valores[i] ?? "";
  });
  return def.schema.parse(bruto) as Record<string, unknown>;
}

/** Objeto -> linha (strings) na ordem dos cabeçalhos. Valida antes (strict: campo extra é erro). */
export function escreverLinhaDef(def: DefAba, obj: Record<string, unknown>): string[] {
  const validado = def.schema.parse(obj) as Record<string, unknown>;
  return def.cabecalhos.map((c) => {
    const v = validado[c];
    if (v === undefined || v === null) return "";
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    return String(v);
  });
}

/** Confere se a linha 1 lida da planilha bate com o esperado. Retorna lista de problemas. */
export function conferirCabecalhosDef(def: DefAba, lido: unknown[] | undefined): string[] {
  const esperado = def.cabecalhos;
  if (!lido || lido.length === 0) return [`Aba ${def.nome}: cabeçalho ausente`];
  const problemas: string[] = [];
  esperado.forEach((c, i) => {
    if (lido[i] !== c) {
      problemas.push(`Aba ${def.nome}: coluna ${i + 1} deveria ser "${c}" e está "${String(lido[i] ?? "")}"`);
    }
  });
  if (lido.length > esperado.length && lido.slice(esperado.length).some((x) => x !== "")) {
    problemas.push(`Aba ${def.nome}: colunas extras no cabeçalho`);
  }
  return problemas;
}

/* ---------- atalhos tipados para as abas da loja ---------- */

export function linhaParaObjeto<N extends NomeAba>(nome: N, valores: unknown[]): Linha<N> {
  return lerLinhaDef(ABAS[nome], valores) as Linha<N>;
}
export function objetoParaLinha<N extends NomeAba>(nome: N, obj: Record<string, unknown>): string[] {
  return escreverLinhaDef(ABAS[nome], obj);
}
export function conferirCabecalhos(nome: NomeAba, lido: unknown[] | undefined): string[] {
  return conferirCabecalhosDef(ABAS[nome], lido);
}
