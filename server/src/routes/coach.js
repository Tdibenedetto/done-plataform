import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { computeScore } from "../lib/scoring.js";

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

