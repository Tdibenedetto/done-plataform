import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { requireMaster, requirePlatformAdmin } from "../middleware/auth.js";
import { sendInviteEmail } from "../lib/mailer.js";
import { MAX_TEAM_SIZE, normalizeEmail } from "./auth.js";
import { runFollowUpCheck } from "../jobs/followUp.js";
import { runWeeklyReportCheck } from "../jobs/weeklyReport.js";
import { limparArea, limparModulos, modulosDoUsuario } from "../lib/acessos.js";

const router = Router();

// Qualquer membro pode ver a lista do time (para saber quem é quem no pipeline).
router.get("/", async (req, res) => {
  const users = await prisma.user.findMany({
    where: { organizationId: req.organizationId },
    select: { id: true, name: true, email: true, role: true, phone: true, createdAt: true, lastLoginAt: true, area: true, modulos: true },
    orderBy: { createdAt: "asc" },
  });
  const invites = await prisma.invite.findMany({
    where: { organizationId: req.organizationId, status: "pending" },
    select: { id: true, email: true, createdAt: true, expiresAt: true, area: true, modulos: true },
  });
  // Só o master vê os acessos de cada um; os demais recebem só o necessário para o pipeline.
  const isMaster = req.userRole === "master";
  const usersOut = users.map((u) => ({
    id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, createdAt: u.createdAt, area: u.area || null,
    ...(isMaster ? { lastLoginAt: u.lastLoginAt, modulos: modulosDoUsuario(u) } : {}),
  }));
  const invitesOut = isMaster ? invites.map((i) => ({ ...i, area: i.area || null, modulos: limparModulos(i.modulos) || [] })) : [];
  const org = await prisma.organization.findUnique({ where: { id: req.organizationId }, select: { followUpDays: true, followUpError: true, followUpErrorAt: true, logoUrl: true } });
  res.json({ users: usersOut, invites: invitesOut, maxTeamSize: MAX_TEAM_SIZE, followUpDays: org.followUpDays, followUpError: org.followUpError, followUpErrorAt: org.followUpErrorAt, logoUrl: org.logoUrl });
});

// Dados do próprio usuário, com os módulos liberados — o app consulta ao abrir, para o menu
// refletir na hora uma mudança de acesso feita pelo master.
router.get("/me", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role, area: user.area || null, modulos: modulosDoUsuario(user) });
});

// Cada usuário define o próprio telefone (E.164), usado nos lembretes automáticos de follow-up.
router.patch("/phone", async (req, res) => {
  const { phone } = req.body;
  const clean = (phone || "").trim();
  if (clean && !/^\+\d{8,15}$/.test(clean)) {
    return res.status(400).json({ error: "Use o formato internacional, ex: +5511999999999." });
  }
  await prisma.user.update({ where: { id: req.userId }, data: { phone: clean || null } });
  res.json({ ok: true });
});

// Apenas o Master ajusta depois de quantos dias parado um lead gera lembrete automático.
// 0 é permitido só para teste — considera qualquer lead parado como pronto para alertar na hora.
router.patch("/followup-settings", requireMaster, async (req, res) => {
  const days = Number(req.body.followUpDays);
  if (!Number.isInteger(days) || days < 0 || days > 30) {
    return res.status(400).json({ error: "Informe um número de dias entre 0 e 30." });
  }
  await prisma.organization.update({ where: { id: req.organizationId }, data: { followUpDays: days } });
  res.json({ ok: true });
});

// Logo da própria empresa cliente — aparece na tabela de preços pública no lugar da marca D.O.N.E.
// Só o link é guardado (colado pelo usuário), sem upload de arquivo.
router.patch("/logo", requireMaster, async (req, res) => {
  const logoUrl = (req.body.logoUrl || "").trim();
  await prisma.organization.update({ where: { id: req.organizationId }, data: { logoUrl: logoUrl || null } });
  res.json({ ok: true, logoUrl: logoUrl || null });
});

// Apenas o Master pode disparar a checagem de follow-up manualmente, sem esperar o agendador automático.
// Verifica só a própria organização e ignora a exigência de assinatura ativa (é um teste manual autenticado).
router.post("/followup-test", requireMaster, async (req, res) => {
  try {
    const result = await runFollowUpCheck({ organizationId: req.organizationId, skipPlanCheck: true });
    res.json(result);
  } catch (e) {
    console.error("[followup-test] falha:", e);
    res.status(500).json({ error: "Falha ao rodar a checagem. Veja os logs do servidor." });
  }
});

// Concede acesso de TESTE a módulos pagos (sem passar pelo Stripe) — restrito ao Admin Geral.
// Existia antes como ferramenta do próprio fundador para testar funcionalidades pagas na conta
// dele mesmo antes do lançamento comercial; restrito a requireMaster, QUALQUER cliente master
// conseguia chamar essa rota diretamente na própria conta e se autoliberar acesso pago de graça,
// para sempre, sem passar pelo Stripe. Trocado para requirePlatformAdmin para fechar essa brecha.
const TESTABLE_MODULES = ["vendas", "gestao", "completo", "whatsapp", "dre"];
router.post("/grant-test-access", requirePlatformAdmin, async (req, res) => {
  const modules = Array.isArray(req.body.modules) ? req.body.modules.filter((m) => TESTABLE_MODULES.includes(m)) : [];
  if (!modules.length) return res.status(400).json({ error: "Informe pelo menos um módulo válido." });

  for (const module of modules) {
    const existing = await prisma.subscription.findFirst({ where: { organizationId: req.organizationId, module, status: "active" } });
    if (!existing) {
      await prisma.subscription.create({
        data: { organizationId: req.organizationId, module, status: "active", stripeSubscriptionId: null },
      });
    }
  }
  if (modules.some((m) => ["vendas", "gestao", "completo"].includes(m))) {
    const basePlan = modules.find((m) => ["vendas", "gestao", "completo"].includes(m));
    await prisma.organization.update({ where: { id: req.organizationId }, data: { plan: basePlan } });
  }
  res.json({ ok: true, granted: modules });
});

// Apenas o Master pode disparar o relatório semanal manualmente, sem esperar o agendador.
router.post("/weekly-report-test", requireMaster, async (req, res) => {
  try {
    const result = await runWeeklyReportCheck({ organizationId: req.organizationId, skipInterval: true });
    res.json(result);
  } catch (e) {
    console.error("[weekly-report-test] falha:", e);
    res.status(500).json({ error: "Falha ao rodar a checagem. Veja os logs do servidor." });
  }
});

// Apenas o Master convida novos membros.
router.post("/invite", requireMaster, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!email) return res.status(400).json({ error: "E-mail é obrigatório." });
  const area = limparArea(req.body.area);
  if (!area) return res.status(400).json({ error: "Escolha a área do colaborador." });
  const modulos = limparModulos(req.body.modulos);
  if (!modulos || !modulos.length) return res.status(400).json({ error: "Marque pelo menos um módulo que o colaborador vai poder ver." });

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
  await prisma.invite.create({ data: { organizationId: req.organizationId, email, token, expiresAt, area, modulos } });

  const inviter = await prisma.user.findUnique({ where: { id: req.userId } });
  const org = await prisma.organization.findUnique({ where: { id: req.organizationId } });
  const result = await sendInviteEmail({ to: email, orgName: org.name, inviterName: inviter.name, token });

  res.json({ ok: true, emailSent: result.sent, inviteLink: result.link });
});

router.delete("/invite/:id", requireMaster, async (req, res) => {
  await prisma.invite.deleteMany({ where: { id: req.params.id, organizationId: req.organizationId } });
  res.json({ ok: true });
});

// O master muda a área e os módulos de um colaborador. Para si mesmo, só a área (o master vê tudo).
router.patch("/member/:id", requireMaster, async (req, res) => {
  const user = await prisma.user.findFirst({ where: { id: req.params.id, organizationId: req.organizationId } });
  if (!user) return res.status(404).json({ error: "Usuário não encontrado." });
  const data = {};
  if (req.body.area !== undefined) {
    const area = limparArea(req.body.area);
    if (!area) return res.status(400).json({ error: "Escolha uma área válida." });
    data.area = area;
  }
  if (req.body.modulos !== undefined) {
    if (user.role === "master") return res.status(400).json({ error: "O administrador da conta sempre vê todos os módulos." });
    const modulos = limparModulos(req.body.modulos);
    if (!modulos || !modulos.length) return res.status(400).json({ error: "Marque pelo menos um módulo." });
    data.modulos = modulos;
  }
  if (!Object.keys(data).length) return res.status(400).json({ error: "Nada para alterar." });
  const u = await prisma.user.update({ where: { id: user.id }, data });
  res.json({ ok: true, user: { id: u.id, area: u.area, modulos: modulosDoUsuario(u) } });
});

router.delete("/member/:id", requireMaster, async (req, res) => {
  if (req.params.id === req.userId) return res.status(400).json({ error: "Você não pode remover a si mesmo." });
  await prisma.user.deleteMany({ where: { id: req.params.id, organizationId: req.organizationId, role: "member" } });
  res.json({ ok: true });
});

export default router;

