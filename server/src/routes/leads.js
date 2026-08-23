import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();
const STAGES = ["Novo Lead", "Qualificação", "Proposta", "Negociação", "Fechado", "Perdido"];

function leadWhere(req, id) {
  return req.userRole === "master"
    ? { id, organizationId: req.organizationId }
    : { id, organizationId: req.organizationId, assignedUserId: req.userId };
}

router.get("/", async (req, res) => {
  const where = req.userRole === "master"
    ? { organizationId: req.organizationId }
    : { organizationId: req.organizationId, assignedUserId: req.userId };
  const leads = await prisma.lead.findMany({
    where,
    include: { assignedUser: { select: { id: true, name: true } }, _count: { select: { notes: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json(leads);
});

router.post("/", async (req, res) => {
  const { name, value, assignedUserId, expectedCloseDate } = req.body;
  if (!name) return res.status(400).json({ error: "Nome do lead é obrigatório." });

  // Membro só cria lead para si mesmo; Master pode atribuir a qualquer um do time.
  let ownerId = req.userId;
  if (req.userRole === "master" && assignedUserId) {
    const target = await prisma.user.findFirst({ where: { id: assignedUserId, organizationId: req.organizationId } });
    if (!target) return res.status(400).json({ error: "Vendedor inválido." });
    ownerId = assignedUserId;
  }

  const lead = await prisma.lead.create({
    data: {
      organizationId: req.organizationId,
      assignedUserId: ownerId,
      name,
      value: Number(value) || 0,
      expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null,
    },
    include: { assignedUser: { select: { id: true, name: true } }, _count: { select: { notes: true } } },
  });
  res.json(lead);
});

router.patch("/:id", async (req, res) => {
  const { stage, lostReason, expectedCloseDate } = req.body;
  if (stage && !STAGES.includes(stage)) return res.status(400).json({ error: "Etapa inválida." });

  const existing = await prisma.lead.findFirst({ where: leadWhere(req, req.params.id) });
  if (!existing) return res.status(404).json({ error: "Lead não encontrado." });

  const data = {};
  if (stage) data.stage = stage;
  if (lostReason !== undefined) data.lostReason = lostReason;
  if (expectedCloseDate !== undefined) data.expectedCloseDate = expectedCloseDate ? new Date(expectedCloseDate) : null;

  await prisma.lead.update({ where: { id: existing.id }, data });

  // Marcar como perdido já registra o motivo no histórico do lead.
  if (stage === "Perdido") {
    await prisma.leadNote.create({
      data: {
        leadId: existing.id,
        authorId: req.userId,
        content: lostReason ? `Marcado como perdido: ${lostReason}` : "Marcado como perdido.",
      },
    });
  }
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  const where = leadWhere(req, req.params.id);
  await prisma.lead.deleteMany({ where });
  res.json({ ok: true });
});

// -------- Notas / histórico do lead --------
router.get("/:id/notes", async (req, res) => {
  const lead = await prisma.lead.findFirst({ where: leadWhere(req, req.params.id) });
  if (!lead) return res.status(404).json({ error: "Lead não encontrado." });
  const notes = await prisma.leadNote.findMany({
    where: { leadId: lead.id },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(notes);
});

router.post("/:id/notes", async (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: "Escreva algo na nota." });
  const lead = await prisma.lead.findFirst({ where: leadWhere(req, req.params.id) });
  if (!lead) return res.status(404).json({ error: "Lead não encontrado." });
  const note = await prisma.leadNote.create({
    data: { leadId: lead.id, authorId: req.userId, content: content.trim() },
    include: { author: { select: { name: true } } },
  });
  res.json(note);
});

export default router;
