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
