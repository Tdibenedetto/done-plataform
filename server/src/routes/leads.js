import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();
const STAGES = ["Novo Lead", "Qualificação", "Proposta", "Negociação", "Fechado"];

router.get("/", async (req, res) => {
  const leads = await prisma.lead.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "asc" } });
  res.json(leads);
});

router.post("/", async (req, res) => {
  const { name, value, owner } = req.body;
  if (!name) return res.status(400).json({ error: "Nome do lead é obrigatório." });
  const lead = await prisma.lead.create({
    data: { userId: req.userId, name, value: Number(value) || 0, owner: owner || "Sem vendedor" },
  });
  res.json(lead);
});

router.patch("/:id", async (req, res) => {
  const { stage } = req.body;
  if (stage && !STAGES.includes(stage)) return res.status(400).json({ error: "Etapa inválida." });
  const lead = await prisma.lead.updateMany({
    where: { id: req.params.id, userId: req.userId },
    data: req.body,
  });
  if (!lead.count) return res.status(404).json({ error: "Lead não encontrado." });
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  await prisma.lead.deleteMany({ where: { id: req.params.id, userId: req.userId } });
  res.json({ ok: true });
});

export default router;

