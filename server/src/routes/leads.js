import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();
const STAGES = ["Novo Lead", "Qualificação", "Proposta", "Negociação", "Fechado", "Perdido"];

router.get("/", async (req, res) => {
  const where = req.userRole === "master"
    ? { organizationId: req.organizationId }
    : { organizationId: req.organizationId, assignedUserId: req.userId };
  const leads = await prisma.lead.findMany({
    where,
    include: { assignedUser: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json(leads);
});

router.post("/", async (req, res) => {
  const { name, value, assignedUserId } = req.body;
  if (!name) return res.status(400).json({ error: "Nome do lead é obrigatório." });

  // Membro só cria lead para si mesmo; Master pode atribuir a qualquer um do time.
  let ownerId = req.userId;
  if (req.userRole === "master" && assignedUserId) {
    const target = await prisma.user.findFirst({ where: { id: assignedUserId, organizationId: req.organizationId } });
    if (!target) return res.status(400).json({ error: "Vendedor inválido." });
    ownerId = assignedUserId;
  }

  const lead = await prisma.lead.create({
    data: { organizationId: req.organizationId, assignedUserId: ownerId, name, value: Number(value) || 0 },
    include: { assignedUser: { select: { id: true, name: true } } },
  });
  res.json(lead);
});

router.patch("/:id", async (req, res) => {
  const { stage, lostReason } = req.body;
  if (stage && !STAGES.includes(stage)) return res.status(400).json({ error: "Etapa inválida." });

  const where = req.userRole === "master"
    ? { id: req.params.id, organizationId: req.organizationId }
    : { id: req.params.id, organizationId: req.organizationId, assignedUserId: req.userId };

  const data = {};
  if (stage) data.stage = stage;
  if (lostReason !== undefined) data.lostReason = lostReason;

  const result = await prisma.lead.updateMany({ where, data });
  if (!result.count) return res.status(404).json({ error: "Lead não encontrado." });
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  const where = req.userRole === "master"
    ? { id: req.params.id, organizationId: req.organizationId }
    : { id: req.params.id, organizationId: req.organizationId, assignedUserId: req.userId };
  await prisma.lead.deleteMany({ where });
  res.json({ ok: true });
});

export default router;

