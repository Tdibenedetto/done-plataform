import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { chatReply } from "../lib/claude.js";
import { sendAlert } from "../lib/twilio.js";
import { requireMaster } from "../middleware/auth.js";

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
  await prisma.chatMessage.create({ data: { threadId: thread.id, role: "user", content: content.trim() } });

  // Se já foi escalado, a IA não responde mais — fica só aguardando o time de suporte.
  if (thread.status === "escalated") {
    await prisma.supportThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
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
  await prisma.supportThread.update({ where: { id: thread.id }, data: { status: "escalated" } });

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  const org = await prisma.organization.findUnique({ where: { id: req.organizationId } });
  await prisma.chatMessage.create({
    data: { threadId: thread.id, role: "system", content: "Um integrante do nosso time de suporte foi avisado e vai te responder por aqui em breve." },
  });

  if (process.env.SUPPORT_ALERT_PHONE) {
    const body = `D.O.N.E — Suporte\n${user?.name || "Um usuário"} (${org?.name || "org"}) pediu para falar com alguém do time de suporte no chat da plataforma.`;
    sendAlert(process.env.SUPPORT_ALERT_PHONE, body).catch((e) => console.error("[chat] falha ao alertar suporte:", e.message));
  }

  const messages = await prisma.chatMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" } });
  res.json({ messages, escalated: true });
});

// -------- Master: inbox de conversas escaladas para responder como humano --------

router.get("/threads", requireMaster, async (req, res) => {
  const threads = await prisma.supportThread.findMany({
    where: { organizationId: req.organizationId, status: { in: ["escalated", "resolved"] } },
    include: {
      user: { select: { id: true, name: true, role: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });
  res.json(threads);
});

router.get("/threads/:id", requireMaster, async (req, res) => {
  const thread = await prisma.supportThread.findFirst({
    where: { id: req.params.id, organizationId: req.organizationId },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!thread) return res.status(404).json({ error: "Conversa não encontrada." });
  const messages = await prisma.chatMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" } });
  res.json({ thread, messages });
});

router.post("/threads/:id/reply", requireMaster, async (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: "Mensagem vazia." });
  const thread = await prisma.supportThread.findFirst({ where: { id: req.params.id, organizationId: req.organizationId } });
  if (!thread) return res.status(404).json({ error: "Conversa não encontrada." });

  await prisma.chatMessage.create({ data: { threadId: thread.id, role: "support", content: content.trim() } });
  await prisma.supportThread.update({ where: { id: thread.id }, data: { status: "escalated", updatedAt: new Date() } });

  const messages = await prisma.chatMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" } });
  res.json({ messages });
});

router.post("/threads/:id/resolve", requireMaster, async (req, res) => {
  const thread = await prisma.supportThread.findFirst({ where: { id: req.params.id, organizationId: req.organizationId } });
  if (!thread) return res.status(404).json({ error: "Conversa não encontrada." });
  await prisma.supportThread.update({ where: { id: thread.id }, data: { status: "resolved" } });
  res.json({ ok: true });
});

export default router;
