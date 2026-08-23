import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireMaster } from "../middleware/auth.js";

const router = Router();

router.get("/", async (req, res) => {
  const where = req.userRole === "master"
    ? { organizationId: req.organizationId }
    : { organizationId: req.organizationId, userId: req.userId };
  const goals = await prisma.goal.findMany({ where, include: { user: { select: { id: true, name: true } } } });
  res.json(goals);
});

// Apenas o Master define metas do time.
router.put("/", requireMaster, async (req, res) => {
  const { userId, target, month } = req.body;
  if (!userId || !month) return res.status(400).json({ error: "Vendedor e mês são obrigatórios." });

  const target_ = Number(target) || 0;
  const goal = await prisma.goal.upsert({
    where: { userId_month: { userId, month } },
    update: { target: target_ },
    create: { organizationId: req.organizationId, userId, month, target: target_ },
  });
  res.json(goal);
});

export default router;

