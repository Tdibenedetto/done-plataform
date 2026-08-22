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
      userId: req.userId,
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
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json(result || null);
});

export default router;

