import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();

router.get("/", async (req, res) => {
  const goals = await prisma.goal.findMany({ where: { userId: req.userId } });
  res.json(goals);
});

router.put("/", async (req, res) => {
  const { vendor, target, month } = req.body;
  if (!vendor || !month) return res.status(400).json({ error: "Vendedor e mês são obrigatórios." });
  const goal = await prisma.goal.upsert({
    where: { userId_vendor_month: { userId: req.userId, vendor, month } },
    update: { target: Number(target) || 0 },
    create: { userId: req.userId, vendor, month, target: Number(target) || 0 },
  });
  res.json(goal);
});

export default router;

