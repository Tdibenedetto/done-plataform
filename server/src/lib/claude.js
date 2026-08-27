import Anthropic from "@anthropic-ai/sdk";

let client = null;
if (process.env.ANTHROPIC_API_KEY) {
  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
} else {
  console.warn("[claude] ANTHROPIC_API_KEY não configurada — upload inteligente vai exigir planilha no formato exato.");
}

const FIELDS = ["mes", "categoria", "produto", "sku", "valor", "margem", "estoque"];

/**
 * Recebe os cabeçalhos e algumas linhas de exemplo de uma planilha qualquer
 * e devolve um mapeamento { campoPadrao: nomeDaColunaOriginal }.
 * Retorna null se a IA não estiver configurada ou a resposta não puder ser lida.
 */
export async function mapSpreadsheetColumns(headers, sampleRows) {
  if (!client) return null;

  const prompt = `Você mapeia colunas de planilhas de vendas/estoque de PMEs para um formato padrão.

Campos padrão que precisamos identificar:
- mes: mês ou período da venda
- categoria: categoria/departamento do produto
- produto: nome do produto
- sku: código/id do produto
- valor: faturamento/valor de venda (número)
- margem: percentual de margem/lucro (número)
- estoque: status do estoque (ex: ok, ruptura/falta, excesso/sobra)

Cabeçalhos da planilha enviada: ${JSON.stringify(headers)}
Três linhas de exemplo: ${JSON.stringify(sampleRows)}

Responda APENAS com um JSON, sem markdown, sem texto antes ou depois, no formato:
{"mes": "NomeDaColunaOriginal", "categoria": "...", "produto": "...", "sku": "...", "valor": "...", "margem": "...", "estoque": "..."}

Use null para qualquer campo que não tenha correspondência clara na planilha. Não invente nomes de coluna que não existem na lista de cabeçalhos.`;

  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content.find((b) => b.type === "text")?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const mapping = JSON.parse(clean);

    const result = {};
    for (const field of FIELDS) {
      result[field] = mapping[field] && headers.includes(mapping[field]) ? mapping[field] : null;
    }
    return result;
  } catch (e) {
    console.error("[claude] falha ao mapear colunas:", e.message);
    return null;
  }
}

const MES_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MES_FULL_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function normalizeMes(raw) {
  if (raw === undefined || raw === null) return "";
  const val = String(raw).trim();

  // já é uma abreviação conhecida ("Mar", "mar", "MAR")
  const abrevMatch = MES_ABBR.find((m) => m.toLowerCase() === val.slice(0, 3).toLowerCase());
  if (abrevMatch && val.length <= 4) return abrevMatch;

  // nome completo em português ("Março", "marco")
  const fullIdx = MES_FULL_PT.findIndex((m) => val.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === m.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  if (fullIdx >= 0) return MES_ABBR[fullIdx];

  // número do mês ("3", "03")
  const num = Number(val);
  if (!Number.isNaN(num) && num >= 1 && num <= 12) return MES_ABBR[num - 1];

  // data completa ("2026-03-15", "15/03/2026")
  const asDate = new Date(val);
  if (!Number.isNaN(asDate.getTime())) return MES_ABBR[asDate.getMonth()];

  return val; // não reconhecido — mantém como veio, melhor que perder o dado
}

export function normalizeMargem(raw) {
  if (raw === undefined || raw === null || raw === "") return 0;
  const val = String(raw).replace("%", "").replace(",", ".").trim();
  const num = Number(val);
  if (Number.isNaN(num)) return 0;
  return num > 0 && num <= 1 ? Math.round(num * 100) : Math.round(num);
}

export function normalizeEstoque(raw) {
  const val = String(raw || "").toLowerCase();
  if (/(ruptur|falta|zerad|esgot|indispon)/.test(val)) return "ruptura";
  if (/(excess|sobra|alto|encalh)/.test(val)) return "excesso";
  return "ok";
}

const DRE_FIELDS = ["mes", "tipo", "categoria", "valor"];

/**
 * Igual a mapSpreadsheetColumns, mas para o formato do DRE (mes, tipo de
 * lançamento, categoria, valor) em vez do formato de vendas/estoque da Gestão.
 */
export async function mapDreColumns(headers, sampleRows) {
  if (!client) return null;

  const prompt = `Você mapeia colunas de planilhas financeiras (DRE / fluxo de caixa) de PMEs para um formato padrão.

Campos padrão que precisamos identificar:
- mes: mês/período do lançamento (pode ser uma data completa, "Agosto/2026", "08/2026", etc.)
- tipo: tipo do lançamento — normalmente algo como receita, custo/CMV, despesa, imposto/tributo
- categoria: descrição/categoria do lançamento (ex: "Aluguel", "Vendas de produtos", "Simples Nacional")
- valor: valor em reais do lançamento (número)

Cabeçalhos da planilha enviada: ${JSON.stringify(headers)}
Três linhas de exemplo: ${JSON.stringify(sampleRows)}

Responda APENAS com um JSON, sem markdown, sem texto antes ou depois, no formato:
{"mes": "NomeDaColunaOriginal", "tipo": "...", "categoria": "...", "valor": "..."}

Use null para qualquer campo que não tenha correspondência clara na planilha. Não invente nomes de coluna que não existem na lista de cabeçalhos.`;

  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content.find((b) => b.type === "text")?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const mapping = JSON.parse(clean);

    const result = {};
    for (const field of DRE_FIELDS) {
      result[field] = mapping[field] && headers.includes(mapping[field]) ? mapping[field] : null;
    }
    return result;
  } catch (e) {
    console.error("[claude] falha ao mapear colunas do DRE:", e.message);
    return null;
  }
}

/**
 * Como normalizeMes, mas devolve "AAAA-MM" (com ano) em vez de só a abreviação —
 * o DRE precisa do ano porque acompanha caixa ao longo de vários anos.
 * Quando não há ano identificável na célula, assume o ano corrente.
 */
export function normalizeMesAno(raw) {
  if (raw === undefined || raw === null) return "";
  const val = String(raw).trim();
  const currentYear = new Date().getFullYear();

  // data completa reconhecida pelo JS ("2026-08-15", "15/08/2026" em alguns locales)
  const asDate = new Date(val);
  if (!Number.isNaN(asDate.getTime()) && /\d{4}/.test(val)) {
    return `${asDate.getFullYear()}-${String(asDate.getMonth() + 1).padStart(2, "0")}`;
  }

  // "AAAA-MM" ou "MM/AAAA" já prontos
  let m = val.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = val.match(/^(\d{1,2})[\/-](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;

  // nome do mês por extenso, com ou sem ano ("Agosto/2026", "agosto")
  const yearMatch = val.match(/\d{4}/);
  const year = yearMatch ? yearMatch[0] : String(currentYear);
  const fullIdx = MES_FULL_PT.findIndex((mo) => val.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(mo.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
  if (fullIdx >= 0) return `${year}-${String(fullIdx + 1).padStart(2, "0")}`;

  // abreviação de 3 letras, com ou sem ano ("Ago/2026", "ago")
  const abrevIdx = MES_ABBR.findIndex((mo) => mo.toLowerCase() === val.slice(0, 3).toLowerCase());
  if (abrevIdx >= 0) return `${year}-${String(abrevIdx + 1).padStart(2, "0")}`;

  // só o número do mês ("8", "08")
  const num = Number(val);
  if (!Number.isNaN(num) && num >= 1 && num <= 12) return `${currentYear}-${String(num).padStart(2, "0")}`;

  return "";
}

/**
 * Normaliza texto livre de "tipo de lançamento" para os 4 tipos canônicos do DRE.
 */
export function normalizeDreType(raw) {
  const val = String(raw || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/receit|faturam|venda/.test(val)) return "receita";
  if (/cmv|custo.*vari|custo.*mercadori/.test(val)) return "cmv";
  if (/imposto|tribut|simples|icms|iss|pis|cofins/.test(val)) return "imposto";
  return "despesa";
}

const PLATFORM_KNOWLEDGE = `Você é o assistente de suporte da plataforma D.O.N.E (Commercial Operating System), respondendo dúvidas de usuários dentro do próprio produto.

Sobre a plataforma:
- Comercial Coach: questionário de diagnóstico comercial (triagem B2B vs Varejo Especializado + 4 dimensões: Processo Comercial, Precificação & Margem, Time & Performance, Pipeline/Estoque) que gera uma Nota Comercial de 0 a 100 e um plano de ação. O relatório resumido é gratuito; a análise completa por dimensão é paga (checkout via Stripe).
- Ferramenta de Vendas: pipeline Kanban de leads (etapas: Novo Lead, Qualificação, Proposta, Negociação, Fechado, Carteira, Faturado Total, Perdido), metas mensais e anuais por vendedor, notas/histórico por lead, métricas de conversão (taxa, ticket médio, ciclo de venda), e faturamento/carteira por vendedor.
- Ferramenta de Gestão: upload de planilha de vendas/estoque (aceita qualquer formato — a IA identifica as colunas automaticamente), dashboard de faturamento por mês, margem por categoria, alertas de estoque (ruptura/excesso), drill-down por SKU, e cruzamento de vendas fechadas com margem por vendedor. Exclusiva do usuário Master.
- Análise de Crédito: consulta básica de CNPJ na Receita Federal (gratuita) e análise avançada com upload de balanço/DRE em PDF, que a IA lê e aplica regras de crédito (liquidez, endividamento, margem) sugerindo limite ou recusa. Não é um birô de crédito oficial.
- Contas: cada assinatura dá direito a 3 usuários (1 Master + 2 adicionais). O Master convida vendedores por e-mail, define metas e vê o pipeline de todos; vendedores adicionais só veem/gerenciam seus próprios leads. Só o Master acessa a Ferramenta de Gestão e a Análise de Crédito completa.
- Planos: Vendas, Gestão e Completo, cobrados via Stripe; o Comercial Coach completo é cobrado à parte mesmo no plano Completo.

Responda em português, de forma direta e curta (2 a 4 frases na maioria dos casos), como um atendente de suporte experiente do produto — sem inventar recursos que não existem. Se a dúvida for sobre algo fora da plataforma (preços não confirmados, bugs específicos da conta do usuário, pedidos de reembolso, ou qualquer coisa que você não tem certeza) diga claramente que não tem essa informação e sugira usar o botão "Falar com alguém do time de suporte" desta mesma conversa.`;

/**
 * Responde a uma dúvida de usuário dentro do chat de suporte da plataforma,
 * usando o histórico da conversa como contexto.
 */
export async function chatReply(history) {
  if (!client) {
    return "O suporte por IA não está configurado no momento. Toque em \"Falar com alguém do time de suporte\" que alguém vai te responder por aqui.";
  }
  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: PLATFORM_KNOWLEDGE,
      messages: history.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
    });
    return res.content.find((b) => b.type === "text")?.text?.trim() || "Não consegui gerar uma resposta agora. Tente de novo ou fale com o time de suporte.";
  } catch (e) {
    console.error("[claude] falha no chat de suporte:", e.message);
    return "Tive um problema para responder agora. Tente de novo em instantes, ou toque em \"Falar com alguém do time de suporte\".";
  }
}
/**
 * Gera a análise detalhada do relatório completo do Comercial Coach, em cima
 * das respostas reais do questionário (não um texto genérico por faixa de nota).
 * Retorna null se a IA não estiver configurada ou a resposta não puder ser lida —
 * quem chama deve ter um fallback (texto estático) para esse caso.
 */
export async function generateCoachAnalysis({ segment, dims, final, answersWithLabels, previous }) {
  if (!client) return null;

  const dimsText = Object.entries(dims)
    .map(([key, score]) => {
      const label = DIMENSION_LABEL_PT[key];
      const qas = (answersWithLabels[key] || [])
        .map((a) => `  - "${a.q}" → respondeu: "${a.label}"`)
        .join("\n");
      return `${label} (nota ${Math.round(score)}/100):\n${qas}`;
    })
    .join("\n\n");

  const trendText = previous
    ? `\nEssa empresa já fez esse diagnóstico antes: nota anterior foi ${previous.final}/100 em ${new Date(previous.createdAt).toLocaleDateString("pt-BR")}. Comente brevemente a evolução (ou piora) no resumo executivo.`
    : "";

  const prompt = `Você é um consultor comercial sênior escrevendo a análise de um relatório pago (R$ 147) de diagnóstico comercial para uma PME brasileira do segmento "${segment === "b2b" ? "B2B/Atacado" : "Varejo Especializado"}".

Nota comercial final: ${final}/100.

Respostas do questionário, por dimensão:

${dimsText}
${trendText}

Escreva uma análise honesta, específica e prática — nada de generalidades que serviriam para qualquer empresa. Cite as respostas reais que a empresa deu para justificar cada ponto. Tom de consultor experiente, direto, sem enrolação, mas sem soar agressivo.

Responda APENAS com um JSON válido, sem markdown, sem texto antes ou depois, no formato exato:
{
  "resumoExecutivo": "2-3 frases resumindo o panorama geral da empresa, citando o que mais chama atenção (positivo ou negativo)",
  "dimensoes": {
    "processo": { "analise": "2-4 frases específicas citando as respostas dadas", "acoes": ["ação concreta 1", "ação concreta 2", "ação concreta 3"] },
    "preco": { "analise": "...", "acoes": ["...", "...", "..."] },
    "time": { "analise": "...", "acoes": ["...", "...", "..."] },
    "pipeline": { "analise": "...", "acoes": ["...", "...", "..."] }
  }
}

Cada "acoes" deve ter exatamente 3 itens, concretos e específicos para essa empresa (não genéricos), cada um em uma frase curta e acionável.`;

  try {
    const res = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2200,
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content.find((b) => b.type === "text")?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error("[claude] falha ao gerar análise do coach:", e.message);
    return null;
  }
}

const DIMENSION_LABEL_PT = {
  processo: "Processo Comercial",
  preco: "Precificação & Margem",
  time: "Time & Performance",
  pipeline: "Pipeline / Estoque",
};

export async function extractFinancials(pdfBase64) {
  if (!client) return null;

  const prompt = `Você extrai números financeiros de um balanço patrimonial e/ou DRE (Demonstração de Resultado).

Encontre e retorne, em reais (número, sem formatação, sem R$, sem separador de milhar):
- receita: receita/faturamento total do período
- lucroLiquido: lucro líquido do período (pode ser negativo)
- ativoCirculante: total do ativo circulante
- passivoCirculante: total do passivo circulante
- ativoTotal: total do ativo
- passivoTotal: total do passivo (ou passivo total = ativo total - patrimônio líquido, se só houver patrimônio líquido)

Responda APENAS com um JSON, sem markdown, sem texto antes ou depois:
{"receita": 0, "lucroLiquido": 0, "ativoCirculante": 0, "passivoCirculante": 0, "ativoTotal": 0, "passivoTotal": 0}

Use null para qualquer valor que não conseguir encontrar no documento. Não invente números.`;

  try {
    const res = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: prompt },
        ],
      }],
    });
    const text = res.content.find((b) => b.type === "text")?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error("[claude] falha ao extrair balanço:", e.message);
    return null;
  }
}

