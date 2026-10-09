import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { extractFinancials } from "../lib/claude.js";
import { requirePlan, requireMaster } from "../middleware/auth.js";
import { runCnpjMonitorCheck } from "../jobs/monitorCnpj.js";
import { findOrCreateCliente } from "../lib/clientes.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
// Balanço e DRE costumam vir em PDFs separados: aceita os dois de uma vez ("files") e mantém
// o campo antigo ("file") para quem envia um por vez.
const uploadDocs = upload.fields([{ name: "file", maxCount: 1 }, { name: "files", maxCount: 4 }]);

// Vendável sozinho (módulo "credito") ou incluso em Vendas, Gestão ou Completo.
router.use(requirePlan(["vendas", "gestao", "completo", "credito"]));

// -------- Regras de crédito (transparentes, ajustáveis — não é birô oficial) --------
const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// Normaliza o que a IA leu de UM documento.
function normalizarExtracao(raw) {
  if (!raw || typeof raw !== "object") return null;
  const f = {
    receita: num(raw.receita),
    lucroLiquido: num(raw.lucroLiquido),
    mesesPeriodo: num(raw.mesesPeriodo),
    ativoCirculante: num(raw.ativoCirculante),
    passivoCirculante: num(raw.passivoCirculante),
    passivoNaoCirculante: num(raw.passivoNaoCirculante),
    patrimonioLiquido: num(raw.patrimonioLiquido),
    ativoTotal: num(raw.ativoTotal),
  };
  if (f.mesesPeriodo !== null && (f.mesesPeriodo < 1 || f.mesesPeriodo > 24)) f.mesesPeriodo = null;
  if (f.mesesPeriodo !== null) f.mesesPeriodo = Math.round(f.mesesPeriodo);
  return Object.values(f).some((v) => v !== null) ? f : null;
}

// Passivo EXIGÍVEL = o que a empresa deve (circulante + não circulante), sem o patrimônio líquido.
// No balanço brasileiro, "Total do Passivo" = Total do Ativo (inclui o PL) — usar esse número
// fazia o endividamento dar 100% e reprovar qualquer empresa.
function passivoExigivel(f) {
  if (f.passivoCirculante !== null && f.passivoNaoCirculante !== null) return f.passivoCirculante + f.passivoNaoCirculante;
  if (f.ativoTotal !== null && f.patrimonioLiquido !== null) return f.ativoTotal - f.patrimonioLiquido;
  if (f.passivoCirculante !== null) return f.passivoCirculante; // sem não circulante informado: o mínimo conhecido
  return null;
}

function avaliarCredito(f) {
  const faltaDre = f.receita === null;
  const faltaBalanco = f.ativoCirculante === null || f.passivoCirculante === null;
  if (faltaDre || faltaBalanco) {
    const faltas = [];
    if (faltaBalanco) faltas.push("o Balanço Patrimonial (ativo e passivo circulante)");
    if (faltaDre) faltas.push("a DRE (receita e lucro do período)");
    return {
      status: "incompleto",
      limiteSugerido: null,
      motivoRecusa: `Documento lido, mas falta ${faltas.join(" e ")} para calcular o limite. Envie ${faltas.length > 1 ? "os documentos" : "o documento"} que falta${faltas.length > 1 ? "m" : ""}.`,
    };
  }

  const exigivel = passivoExigivel(f);
  const liquidezCorrente = f.passivoCirculante > 0 ? f.ativoCirculante / f.passivoCirculante : null;
  const endividamento = f.ativoTotal > 0 && exigivel !== null ? exigivel / f.ativoTotal : null;
  // Lucro líquido ausente fica de fora da conta — null, não 0 (ausência de dado não é prejuízo).
  const margemLiquida = (f.receita > 0 && f.lucroLiquido !== null) ? f.lucroLiquido / f.receita : null;

  const motivos = [];
  if (liquidezCorrente !== null && liquidezCorrente < 1.0) motivos.push(`liquidez corrente baixa (${liquidezCorrente.toFixed(2)})`);
  if (endividamento !== null && endividamento > 0.7) motivos.push(`endividamento elevado (${Math.round(endividamento * 100)}% do ativo)`);
  if (margemLiquida !== null && margemLiquida <= 0) motivos.push("resultado líquido negativo no período");

  if (motivos.length > 0) {
    return {
      status: "reprovado",
      limiteSugerido: null,
      motivoRecusa: `Crédito não recomendado: ${motivos.join("; ")}. Sugerimos vendas à vista ou via cartão de crédito.`,
    };
  }

  // Aprovado: limite base = 15% da receita mensal média, ajustado pela qualidade dos indicadores.
  // Receita mensal = receita ÷ meses do período da DRE (12 quando o documento não informa — o
  // lado conservador: numa DRE semestral, isso subestima o limite, nunca o superestima).
  const receitaMensal = f.receita / (f.mesesPeriodo || 12);
  const fatorLiquidez = liquidezCorrente ? Math.min(1.5, Math.max(0.6, liquidezCorrente / 1.5)) : 1;
  const fatorMargem = margemLiquida ? Math.min(1.3, Math.max(0.7, 1 + margemLiquida)) : 1;
  const limite = Math.round((receitaMensal * 0.15 * fatorLiquidez * fatorMargem) / 100) * 100;

  return { status: "aprovado", limiteSugerido: limite, motivoRecusa: null };
}

router.get("/", async (req, res) => {
  const analyses = await prisma.creditAnalysis.findMany({
    where: { organizationId: req.organizationId },
    include: { requestedBy: { select: { name: true } }, alerts: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(analyses);
});

// Liga/desliga o monitoramento contínuo de um CNPJ já consultado.
router.patch("/:id/monitoring", async (req, res) => {
  const analysis = await prisma.creditAnalysis.findFirst({ where: { id: req.params.id, organizationId: req.organizationId } });
  if (!analysis) return res.status(404).json({ error: "Análise não encontrada." });
  const updated = await prisma.creditAnalysis.update({
    where: { id: analysis.id },
    data: { monitoring: !!req.body.monitoring, lastCheckedAt: req.body.monitoring ? new Date() : analysis.lastCheckedAt },
  });
  res.json(updated);
});

// Apenas o Master pode disparar a checagem de monitoramento manualmente, sem esperar o agendador.
router.post("/monitor-test", requireMaster, async (req, res) => {
  try {
    const result = await runCnpjMonitorCheck({ organizationId: req.organizationId, skipInterval: true });
    res.json(result);
  } catch (e) {
    console.error("[monitor-test] falha:", e);
    res.status(500).json({ error: "Falha ao rodar a checagem. Veja os logs do servidor." });
  }
});

router.post("/cnpj", async (req, res) => {
  const { cnpj } = req.body;
  const clean = String(cnpj || "").replace(/\D/g, "");
  if (clean.length !== 14) return res.status(400).json({ error: "CNPJ inválido — precisa ter 14 dígitos." });

  let data;
  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DONE-Platform/1.0)", "Accept": "application/json" },
    });
    if (resp.status === 404) {
      return res.status(404).json({ error: "Esse CNPJ não foi encontrado na base da Receita Federal — confira se está correto." });
    }
    if (!resp.ok) {
      return res.status(502).json({ error: `A consulta à Receita Federal falhou (código ${resp.status}). Tente novamente em alguns segundos.` });
    }
    data = await resp.json();
  } catch (e) {
    return res.status(502).json({ error: "Não foi possível consultar o CNPJ agora — verifique sua conexão e tente de novo." });
  }

  const razaoSocial = data.razao_social || data.nome_fantasia || clean;

  // Encontra o Cliente já existente com esse CNPJ nesta organização, ou cria um novo —
  // é o vínculo que faz Vendas e Crédito falarem da mesma empresa, em vez de cada um ter
  // seu próprio "nome" solto sem relação entre si.
  const { cliente } = await findOrCreateCliente(req.organizationId, clean, razaoSocial);

  const record = await prisma.creditAnalysis.create({
    data: {
      organizationId: req.organizationId,
      requestedById: req.userId,
      clienteId: cliente.id,
      cnpj: clean,
      companyName: data.razao_social || data.nome_fantasia || null,
      situacao: data.descricao_situacao_cadastral || null,
      dataAbertura: data.data_inicio_atividade ? new Date(data.data_inicio_atividade) : null,
      atividade: data.cnae_fiscal_descricao || null,
    },
  });
  res.json({ ...record, raw: data });
});

router.post("/:id/balanco", uploadDocs, async (req, res) => {
  const files = [...(req.files?.file || []), ...(req.files?.files || [])];
  if (files.length === 0) return res.status(400).json({ error: "Nenhum arquivo enviado." });
  const naoPdf = files.find((f) => f.buffer.subarray(0, 5).toString("latin1") !== "%PDF-");
  if (naoPdf) return res.status(400).json({ error: `"${naoPdf.originalname}" não é um PDF. Envie o Balanço e a DRE em PDF.` });

  const analysis = await prisma.creditAnalysis.findFirst({ where: { id: req.params.id, organizationId: req.organizationId } });
  if (!analysis) return res.status(404).json({ error: "Análise não encontrada." });

  // Lê cada PDF separadamente (em paralelo) — um documento pode ter só o Balanço, outro só a DRE.
  const lidos = (await Promise.all(files.map((f) => extractFinancials(f.buffer.toString("base64"))))).map(normalizarExtracao);
  if (lidos.every((l) => l === null)) {
    return res.status(400).json({ error: "Não conseguimos ler os números desse arquivo. Confirme se é um Balanço Patrimonial ou DRE em PDF com texto legível (não uma foto) e tente de novo." });
  }

  // Junta com o que já tinha sido lido antes nesta análise: enviar o Balanço hoje e a DRE depois
  // completa a análise, em vez de apagar o que foi lido no primeiro envio.
  const CAMPOS = ["receita", "lucroLiquido", "mesesPeriodo", "ativoCirculante", "passivoCirculante", "passivoNaoCirculante", "patrimonioLiquido", "ativoTotal"];
  const f = {};
  for (const c of CAMPOS) f[c] = analysis.hasFinancials ? num(analysis[c]) : null;
  for (const lido of lidos) {
    if (!lido) continue;
    for (const c of CAMPOS) if (lido[c] !== null) f[c] = lido[c];
  }

  const resultado = avaliarCredito(f);

  const updated = await prisma.creditAnalysis.update({
    where: { id: analysis.id },
    data: {
      hasFinancials: true,
      receita: f.receita, lucroLiquido: f.lucroLiquido, mesesPeriodo: f.mesesPeriodo,
      ativoCirculante: f.ativoCirculante, passivoCirculante: f.passivoCirculante,
      passivoNaoCirculante: f.passivoNaoCirculante, patrimonioLiquido: f.patrimonioLiquido,
      ativoTotal: f.ativoTotal, passivoTotal: passivoExigivel(f),
      status: resultado.status, limiteSugerido: resultado.limiteSugerido, motivoRecusa: resultado.motivoRecusa,
    },
  });

  // Atualiza só a SUGESTÃO da IA no Cliente — o limite aprovado de verdade só muda quando
  // alguém aceita ou ajusta manualmente (rota /api/clientes/:id/limite), nunca automático aqui.
  if (analysis.clienteId && resultado.limiteSugerido != null) {
    await prisma.cliente.update({ where: { id: analysis.clienteId }, data: { creditoSugeridoIA: resultado.limiteSugerido } });
  }

  res.json(updated);
});

export default router;

