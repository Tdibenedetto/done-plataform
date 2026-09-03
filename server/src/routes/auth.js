import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { sendInviteEmail } from "../lib/mailer.js";

const router = Router();

function signToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: "30d" });
}
function publicUser(user, organization) {
  return {
    id: user.id, email: user.email, name: user.name, role: user.role,
    organizationId: user.organizationId, company: organization?.name,
    isPlatformAdmin: !!process.env.PLATFORM_ADMIN_EMAIL && user.email.toLowerCase() === process.env.PLATFORM_ADMIN_EMAIL.toLowerCase(),
  };
}

// Cria a Organização + o primeiro usuário (sempre Master).
router.post("/register", async (req, res) => {
  const { email, password, name, company } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: "Nome, e-mail e senha são obrigatórios." });
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "Já existe uma conta com esse e-mail." });

  const passwordHash = await bcrypt.hash(password, 10);
  const organization = await prisma.organization.create({ data: { name: company || name } });
  const user = await prisma.user.create({
    data: { email, passwordHash, name, role: "master", organizationId: organization.id, lastLoginAt: new Date() },
  });
  res.json({ token: signToken(user), user: publicUser(user, organization) });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email }, include: { organization: true } });
  if (!user) return res.status(401).json({ error: "E-mail ou senha inválidos." });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "E-mail ou senha inválidos." });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  res.json({ token: signToken(user), user: publicUser(user, user.organization) });
});

// -------- Convites de equipe --------
const MAX_TEAM_SIZE = 3; // 1 master + 2 adicionais, fixo por enquanto

router.get("/invite/:token", async (req, res) => {
  const invite = await prisma.invite.findUnique({ where: { token: req.params.token }, include: { organization: true } });
  if (!invite || invite.status !== "pending" || invite.expiresAt < new Date()) {
    return res.status(404).json({ error: "Convite inválido ou expirado." });
  }
  res.json({ email: invite.email, orgName: invite.organization.name });
});

router.post("/invite/:token/accept", async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: "Nome e senha são obrigatórios." });

  const invite = await prisma.invite.findUnique({ where: { token: req.params.token } });
  if (!invite || invite.status !== "pending" || invite.expiresAt < new Date()) {
    return res.status(404).json({ error: "Convite inválido ou expirado." });
  }
  const existing = await prisma.user.findUnique({ where: { email: invite.email } });
  if (existing) return res.status(409).json({ error: "Já existe uma conta com esse e-mail." });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email: invite.email, passwordHash, name, role: "member", organizationId: invite.organizationId, lastLoginAt: new Date() },
  });
  await prisma.invite.update({ where: { id: invite.id }, data: { status: "accepted" } });
  const organization = await prisma.organization.findUnique({ where: { id: invite.organizationId } });

  res.json({ token: signToken(user), user: publicUser(user, organization) });
});

export default router;
export { MAX_TEAM_SIZE };

