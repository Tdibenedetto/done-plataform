import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { extractFinancials } from "../lib/claude.js";
import { requirePaidModule, requireMaster } from "../middleware/auth.js";
import { runCnpjMonitorCheck } from "../jobs/monitorCnpj.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(requirePaidModule);

// -------- Regras de crédito (transparentes, ajustáveis — não é birô oficial) --------
function avaliarCredito(f) {
  if (!f || f.receita == null || f.ativoCirculante == null || f.passivoCirculante == null) {
    return { status: "reprovado", limiteSugerido: null, motivoRecusa: "Não foi possível extrair os dados financeiros necessários do documento enviado." };
  }

  const liquidezCorrente = f.passivoCirculante > 0 ? f.ativoCirculante / f.passivoCirculante : null;
  const endividamento = f.ativoTotal > 0 ? (f.passivoTotal ?? 0) / f.ativoTotal : null;
  const margemLiquida = f.receita > 0 ? (f.lucroLiquido ?? 0) / f.receita : null;

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
  const receitaMensal = f.receita / 12;
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

  const record = await prisma.creditAnalysis.create({
    data: {
      organizationId: req.organizationId,
      requestedById: req.userId,
      cnpj: clean,
      companyName: data.razao_social || data.nome_fantasia || null,
      situacao: data.descricao_situacao_cadastral || null,
      dataAbertura: data.data_inicio_atividade ? new Date(data.data_inicio_atividade) : null,
      atividade: data.cnae_fiscal_descricao || null,
    },
  });
  res.json({ ...record, raw: data });
});

router.post("/:id/balanco", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });

  const analysis = await prisma.creditAnalysis.findFirst({ where: { id: req.params.id, organizationId: req.organizationId } });
  if (!analysis) return res.status(404).json({ error: "Análise não encontrada." });

  const financials = await extractFinancials(req.file.buffer.toString("base64"));
  if (!financials) {
    return res.status(400).json({ error: "Não conseguimos ler os dados financeiros desse arquivo. Confirme se é um balanço/DRE legível." });
  }

  const resultado = avaliarCredito(financials);

  const updated = await prisma.creditAnalysis.update({
    where: { id: analysis.id },
    data: {
      hasFinancials: true,
      receita: financials.receita, lucroLiquido: financials.lucroLiquido,
      ativoCirculante: financials.ativoCirculante, passivoCirculante: financials.passivoCirculante,
      ativoTotal: financials.ativoTotal, passivoTotal: financials.passivoTotal,
      status: resultado.status, limiteSugerido: resultado.limiteSugerido, motivoRecusa: resultado.motivoRecusa,
    },
  });
  res.json(updated);
});

export default router;

