import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { computeScore } from "../lib/scoring.js";
import { generateCoachAnalysis } from "../lib/claude.js";
import { QUESTIONS, labelForScore } from "../lib/questions.js";

const router = Router();

// answers shape: { segment: "b2b"|"varejo", answers: { processo:[...], preco:[...], time:[...], pipeline:[...] } }
router.post("/submit", async (req, res) => {
  const { segment, answers } = req.body;
  if (!segment || !answers) return res.status(400).json({ error: "Dados incompletos." });

  const { dims, final } = computeScore(answers);

  const result = await prisma.coachResult.create({
    data: {
      organizationId: req.organizationId,
      segment,
      dimProcesso: dims.processo,
      dimPreco: dims.preco,
      dimTime: dims.time,
      dimPipeline: dims.pipeline,
      final,
      answers,
    },
  });
  res.json(result);
});

router.get("/latest", async (req, res) => {
  const result = await prisma.coachResult.findFirst({
    where: { organizationId: req.organizationId },
    orderBy: { createdAt: "desc" },
  });
  res.json(result || null);
});

// Histórico de todas as avaliações — usado para a reavaliação periódica (comparar evolução ao longo do tempo).
router.get("/history", async (req, res) => {
  const results = await prisma.coachResult.findMany({
    where: { organizationId: req.organizationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, segment: true, final: true, dimProcesso: true, dimPreco: true, dimTime: true, dimPipeline: true, createdAt: true },
  });
  res.json(results);
});

// Gera (ou devolve, se já tiver sido gerada antes) a análise detalhada do relatório
// completo — em cima das respostas reais do questionário, não texto genérico por faixa.
router.post("/:id/generate-report", async (req, res) => {
  const result = await prisma.coachResult.findFirst({ where: { id: req.params.id, organizationId: req.organizationId } });
  if (!result) return res.status(404).json({ error: "Relatório não encontrado." });

  if (result.detailedAnalysis) return res.json(result); // já foi gerada — não gasta IA de novo

  if (!result.answers) {
    return res.json(result); // avaliação antiga, feita antes de guardarmos as respostas — sem dado suficiente pra gerar
  }

  const questions = QUESTIONS[result.segment];
  const answersWithLabels = {};
  for (const dimKey of Object.keys(questions)) {
    answersWithLabels[dimKey] = questions[dimKey].map((q, i) => ({
      q: q.q,
      label: labelForScore((result.answers[dimKey] || [])[i], q.opts),
    }));
  }

  const previous = await prisma.coachResult.findFirst({
    where: { organizationId: req.organizationId, createdAt: { lt: result.createdAt } },
    orderBy: { createdAt: "desc" },
    select: { final: true, createdAt: true },
  });

  const dims = { processo: result.dimProcesso, preco: result.dimPreco, time: result.dimTime, pipeline: result.dimPipeline };
  const analysis = await generateCoachAnalysis({ segment: result.segment, dims, final: result.final, answersWithLabels, previous });

  if (!analysis) return res.json(result); // IA indisponível — frontend cai pro texto estático

  const updated = await prisma.coachResult.update({ where: { id: result.id }, data: { detailedAnalysis: analysis } });
  res.json(updated);
});

// Marca/desmarca um item da trilha de ação do relatório mais recente.
router.patch("/track/:id", async (req, res) => {
  const { itemKey, done } = req.body;
  if (!itemKey) return res.status(400).json({ error: "Item inválido." });

  const existing = await prisma.coachResult.findFirst({ where: { id: req.params.id, organizationId: req.organizationId } });
  if (!existing) return res.status(404).json({ error: "Relatório não encontrado." });

  const progress = { ...(existing.trackProgress || {}) };
  if (done) progress[itemKey] = true; else delete progress[itemKey];

  const updated = await prisma.coachResult.update({ where: { id: existing.id }, data: { trackProgress: progress } });
  res.json(updated);
});

export default router;
