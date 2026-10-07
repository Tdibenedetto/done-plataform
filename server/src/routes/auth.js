import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { sendPasswordResetEmail } from "../lib/mailer.js";

const router = Router();

const MIN_PASSWORD_LENGTH = 8;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // link de redefinição vale 1 hora
const RESET_MIN_INTERVAL_MS = 2 * 60 * 1000; // no máximo 1 e-mail de redefinição a cada 2 min por conta

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

// E-mail sempre em minúsculas e sem espaços — sem isso, quem se cadastrava como "Nome@empresa.com"
// e depois digitava "nome@empresa.com" recebia "e-mail ou senha inválidos".
export function normalizeEmail(raw) {
  return String(raw || "").trim().toLowerCase();
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function passwordError(password) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  return null;
}
function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

// Cria a Organização + o primeiro usuário (sempre Master).
router.post("/register", async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const name = String(req.body.name || "").trim();
  const company = String(req.body.company || "").trim();
  const { password } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: "Nome, e-mail e senha são obrigatórios." });
  }
  if (!isValidEmail(email)) return res.status(400).json({ error: "Informe um e-mail válido." });
  const pwError = passwordError(password);
  if (pwError) return res.status(400).json({ error: pwError });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "Já existe uma conta com esse e-mail. Use \"Entrar\" ou \"Esqueci minha senha\"." });

  const passwordHash = await bcrypt.hash(password, 10);
  const organization = await prisma.organization.create({ data: { name: company || name } });
  const user = await prisma.user.create({
    data: { email, passwordHash, name, role: "master", organizationId: organization.id, lastLoginAt: new Date() },
  });
  res.json({ token: signToken(user), user: publicUser(user, organization) });
});

router.post("/login", async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Informe e-mail e senha." });

  const user = await prisma.user.findUnique({ where: { email }, include: { organization: true } });
  if (!user) return res.status(401).json({ error: "E-mail ou senha inválidos." });
  const ok = await bcrypt.compare(String(password), user.passwordHash);
  if (!ok) return res.status(401).json({ error: "E-mail ou senha inválidos." });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  res.json({ token: signToken(user), user: publicUser(user, user.organization) });
});

// -------- Esqueci minha senha --------
// Responde SEMPRE a mesma coisa, exista a conta ou não — assim ninguém consegue usar esta tela
// para descobrir quais e-mails têm cadastro na plataforma.
router.post("/forgot", async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!isValidEmail(email)) return res.status(400).json({ error: "Informe um e-mail válido." });

  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const recent = await prisma.passwordReset.findFirst({
      where: { userId: user.id, createdAt: { gt: new Date(Date.now() - RESET_MIN_INTERVAL_MS) } },
    });
    if (!recent) {
      const token = crypto.randomBytes(32).toString("hex");
      await prisma.passwordReset.create({
        data: { userId: user.id, tokenHash: hashResetToken(token), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
      });
      try {
        const result = await sendPasswordResetEmail({ to: user.email, name: user.name, token });
        if (!result.sent) console.error(`[auth] redefinição de senha pedida por ${user.email}, mas NENHUM provedor de e-mail está configurado — o link não foi enviado.`);
      } catch (e) {
        console.error(`[auth] falha ao enviar e-mail de redefinição de senha para ${user.email}:`, e.message);
      }
    }
  }
  res.json({ ok: true });
});

async function findValidReset(token) {
  if (!token) return null;
  const reset = await prisma.passwordReset.findUnique({ where: { tokenHash: hashResetToken(token) } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) return null;
  return reset;
}

// A tela de nova senha consulta isto antes de mostrar o formulário (link vencido/usado → aviso claro).
router.get("/reset/:token", async (req, res) => {
  const reset = await findValidReset(req.params.token);
  if (!reset) return res.status(404).json({ error: "Este link de redefinição é inválido ou já venceu. Peça um novo em \"Esqueci minha senha\"." });
  const user = await prisma.user.findUnique({ where: { id: reset.userId } });
  if (!user) return res.status(404).json({ error: "Este link de redefinição é inválido ou já venceu. Peça um novo em \"Esqueci minha senha\"." });
  res.json({ email: user.email });
});

router.post("/reset/:token", async (req, res) => {
  const pwError = passwordError(req.body.password);
  if (pwError) return res.status(400).json({ error: pwError });

  const reset = await findValidReset(req.params.token);
  if (!reset) return res.status(404).json({ error: "Este link de redefinição é inválido ou já venceu. Peça um novo em \"Esqueci minha senha\"." });

  const passwordHash = await bcrypt.hash(req.body.password, 10);
  const user = await prisma.user.update({
    where: { id: reset.userId },
    data: { passwordHash, lastLoginAt: new Date() },
  });
  // Uso único: este link e qualquer outro pedido pendente da mesma conta deixam de valer.
  await prisma.passwordReset.updateMany({ where: { userId: reset.userId, usedAt: null }, data: { usedAt: new Date() } });

  const organization = await prisma.organization.findUnique({ where: { id: user.organizationId } });
  res.json({ token: signToken(user), user: publicUser(user, organization) });
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
  const name = String(req.body.name || "").trim();
  const { password } = req.body;
  if (!name || !password) return res.status(400).json({ error: "Nome e senha são obrigatórios." });
  const pwError = passwordError(password);
  if (pwError) return res.status(400).json({ error: pwError });

  const invite = await prisma.invite.findUnique({ where: { token: req.params.token } });
  if (!invite || invite.status !== "pending" || invite.expiresAt < new Date()) {
    return res.status(404).json({ error: "Convite inválido ou expirado." });
  }
  const email = normalizeEmail(invite.email);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "Já existe uma conta com esse e-mail." });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, name, role: "member", organizationId: invite.organizationId, lastLoginAt: new Date() },
  });
  await prisma.invite.update({ where: { id: invite.id }, data: { status: "accepted" } });
  const organization = await prisma.organization.findUnique({ where: { id: invite.organizationId } });

  res.json({ token: signToken(user), user: publicUser(user, organization) });
});

export default router;
export { MAX_TEAM_SIZE };
