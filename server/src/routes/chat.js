import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { chatReply } from "../lib/claude.js";
import { sendAlert } from "../lib/twilio.js";
import { sendSupportAlertEmail } from "../lib/mailer.js";
import { requirePlatformAdmin } from "../middleware/auth.js";

const router = Router();

async function getOrCreateThread(userId, organizationId) {
  let thread = await prisma.supportThread.findFirst({
    where: { userId, organizationId, status: { not: "resolved" } },
    orderBy: { createdAt: "desc" },
  });
  if (!thread) {
    thread = await prisma.supportThread.create({ data: { userId, organizationId } });
  }
  return thread;
}

// Avisa o time da D.O.N.E por e-mail (e por WhatsApp/SMS, se SUPPORT_ALERT_PHONE estiver configurado).
// O destino é SUPPORT_ALERT_EMAIL ou, na falta dele, o e-mail do Admin Geral. Nunca derruba a
// requisição do cliente: se o aviso falhar, a conversa continua registrada e aparece no menu Suporte.
async function notifySupportTeam({ userId, organizationId, lastMessage, isFollowUp }) {
  try {
    const [user, org] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.organization.findUnique({ where: { id: organizationId } }),
    ]);
    const to = process.env.SUPPORT_ALERT_EMAIL || process.env.PLATFORM_ADMIN_EMAIL;
    if (to) {
      const result = await sendSupportAlertEmail({ to, userName: user?.name, userEmail: user?.email, orgName: org?.name, lastMessage, isFollowUp });
      if (!result.sent) console.error("[chat] pedido de suporte recebido, mas nenhum provedor de e-mail está configurado — aviso não enviado.");
    } else {
      console.error("[chat] pedido de suporte recebido, mas não há SUPPORT_ALERT_EMAIL nem PLATFORM_ADMIN_EMAIL configurado — ninguém foi avisado.");
    }
    if (process.env.SUPPORT_ALERT_PHONE && !isFollowUp) {
      const body = `D.O.N.E — Suporte\n${user?.name || "Um usuário"} (${org?.name || "org"}) pediu para falar com alguém do time de suporte no chat da plataforma.`;
      await sendAlert(process.env.SUPPORT_ALERT_PHONE, body);
    }
  } catch (e) {
    console.error("[chat] falha ao avisar o time de suporte:", e.message);
  }
}

// -------- Usuário (member ou master) fala com o próprio thread de suporte --------

router.get("/thread", async (req, res) => {
  const thread = await getOrCreateThread(req.userId, req.organizationId);
  const messages = await prisma.chatMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" } });
  res.json({ thread, messages });
});

router.post("/message", async (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: "Mensagem vazia." });

  const thread = await getOrCreateThread(req.userId, req.organizationId);
  const previous = await prisma.chatMessage.findFirst({ where: { threadId: thread.id }, orderBy: { createdAt: "desc" } });
  await prisma.chatMessage.create({ data: { threadId: thread.id, role: "user", content: content.trim() } });

  // Se já foi escalado, a IA não responde mais — fica só aguardando o time de suporte.
  if (thread.status === "escalated") {
    await prisma.supportThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
    // Avisa de novo só na PRIMEIRA mensagem depois de uma resposta do suporte — se o cliente
    // mandar várias seguidas, não vira uma enxurrada de e-mails.
    if (previous?.role === "support") {
      notifySupportTeam({ userId: req.userId, organizationId: req.organizationId, lastMessage: content.trim(), isFollowUp: true });
    }
    const messages = await prisma.chatMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" } });
    return res.json({ messages, escalated: true });
  }

  const history = await prisma.chatMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" } });
  const reply = await chatReply(history.map((m) => ({ role: m.role, content: m.content })));
  await prisma.chatMessage.create({ data: { threadId: thread.id, role: "assistant", content: reply } });
  await prisma.supportThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });

  const messages = await prisma.chatMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" } });
  res.json({ messages, escalated: false });
});

router.post("/escalate", async (req, res) => {
  const thread = await getOrCreateThread(req.userId, req.organizationId);
  const alreadyEscalated = thread.status === "escalated";
  await prisma.supportThread.update({ where: { id: thread.id }, data: { status: "escalated" } });

  if (!alreadyEscalated) {
    const lastUserMessage = await prisma.chatMessage.findFirst({ where: { threadId: thread.id, role: "user" }, orderBy: { createdAt: "desc" } });
    await prisma.chatMessage.create({
      data: { threadId: thread.id, role: "system", content: "Um integrante do nosso time de suporte foi avisado e vai te responder por aqui em breve." },
    });
    // Sem "await": o aviso sai em segundo plano e não atrasa a resposta para o cliente.
    notifySupportTeam({ userId: req.userId, organizationId: req.organizationId, lastMessage: lastUserMessage?.content, isFollowUp: false });
  }

  const messages = await prisma.chatMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" } });
  res.json({ messages, escalated: true });
});

// -------- Admin Geral (time D.O.N.E): caixa de entrada com as conversas de TODAS as empresas --------
// Antes isto era restrito ao Master e filtrado pela própria empresa — ou seja, o pedido de
// "falar com o suporte" de um cliente caía na caixa do próprio cliente e ninguém da D.O.N.E via.

router.get("/threads", requirePlatformAdmin, async (req, res) => {
  const threads = await prisma.supportThread.findMany({
    where: { status: { in: ["escalated", "resolved"] } },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      organization: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });
  res.json(threads);
});

router.get("/threads/:id", requirePlatformAdmin, async (req, res) => {
  const thread = await prisma.supportThread.findFirst({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      organization: { select: { id: true, name: true } },
    },
  });
  if (!thread) return res.status(404).json({ error: "Conversa não encontrada." });
  const messages = await prisma.chatMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" } });
  res.json({ thread, messages });
});

router.post("/threads/:id/reply", requirePlatformAdmin, async (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: "Mensagem vazia." });
  const thread = await prisma.supportThread.findFirst({ where: { id: req.params.id } });
  if (!thread) return res.status(404).json({ error: "Conversa não encontrada." });

  await prisma.chatMessage.create({ data: { threadId: thread.id, role: "support", content: content.trim() } });
  await prisma.supportThread.update({ where: { id: thread.id }, data: { status: "escalated", updatedAt: new Date() } });

  const messages = await prisma.chatMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" } });
  res.json({ messages });
});

router.post("/threads/:id/resolve", requirePlatformAdmin, async (req, res) => {
  const thread = await prisma.supportThread.findFirst({ where: { id: req.params.id } });
  if (!thread) return res.status(404).json({ error: "Conversa não encontrada." });
  await prisma.supportThread.update({ where: { id: thread.id }, data: { status: "resolved" } });
  res.json({ ok: true });
});

export default router;
