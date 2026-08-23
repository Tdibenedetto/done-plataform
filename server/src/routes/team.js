import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { requireMaster } from "../middleware/auth.js";
import { sendInviteEmail } from "../lib/mailer.js";
import { MAX_TEAM_SIZE } from "./auth.js";

const router = Router();

// Qualquer membro pode ver a lista do time (para saber quem é quem no pipeline).
router.get("/", async (req, res) => {
  const users = await prisma.user.findMany({
    where: { organizationId: req.organizationId },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const invites = await prisma.invite.findMany({
    where: { organizationId: req.organizationId, status: "pending" },
    select: { id: true, email: true, createdAt: true, expiresAt: true },
  });
  res.json({ users, invites, maxTeamSize: MAX_TEAM_SIZE });
});

// Apenas o Master convida novos membros.
router.post("/invite", requireMaster, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "E-mail é obrigatório." });

  const [userCount, pendingCount, existingUser] = await Promise.all([
    prisma.user.count({ where: { organizationId: req.organizationId } }),
    prisma.invite.count({ where: { organizationId: req.organizationId, status: "pending" } }),
    prisma.user.findUnique({ where: { email } }),
  ]);
  if (existingUser) return res.status(409).json({ error: "Esse e-mail já tem conta na plataforma." });
  if (userCount + pendingCount >= MAX_TEAM_SIZE) {
    return res.status(400).json({ error: `Seu plano permite até ${MAX_TEAM_SIZE} usuários (1 master + ${MAX_TEAM_SIZE - 1} adicionais).` });
  }

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias
  await prisma.invite.create({ data: { organizationId: req.organizationId, email, token, expiresAt } });

  const inviter = await prisma.user.findUnique({ where: { id: req.userId } });
  const org = await prisma.organization.findUnique({ where: { id: req.organizationId } });
  const result = await sendInviteEmail({ to: email, orgName: org.name, inviterName: inviter.name, token });

  res.json({ ok: true, emailSent: result.sent, inviteLink: result.link });
});

router.delete("/invite/:id", requireMaster, async (req, res) => {
  await prisma.invite.deleteMany({ where: { id: req.params.id, organizationId: req.organizationId } });
  res.json({ ok: true });
});

router.delete("/member/:id", requireMaster, async (req, res) => {
  if (req.params.id === req.userId) return res.status(400).json({ error: "Você não pode remover a si mesmo." });
  await prisma.user.deleteMany({ where: { id: req.params.id, organizationId: req.organizationId, role: "member" } });
  res.json({ ok: true });
});

export default router;

