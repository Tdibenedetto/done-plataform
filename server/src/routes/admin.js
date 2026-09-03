import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { PRICES } from "../lib/stripe.js";
import { MAX_TEAM_SIZE } from "./auth.js";

const router = Router();

const BASE_MODULES = ["vendas", "gestao", "completo"];
const ADDON_MODULES = ["whatsapp", "dre"];
const ADDON_LABEL = { whatsapp: "WhatsApp", dre: "DRE" };

function monthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { start, end };
}

// Assinaturas ativas de uma organização, com o valor mensal (MRR) de cada uma somado.
function subsMrrCents(subs) {
  return subs.reduce((sum, s) => sum + (PRICES[s.module]?.amountCents || 0), 0);
}

// -------- Visão geral: métricas agregadas do negócio --------
router.get("/overview", async (req, res) => {
  const orgs = await prisma.organization.findMany({
    include: { subscriptions: true, users: true },
  });

  let mrrCents = 0;
  let activeClients = 0;
  const revenueByModule = {};
  for (const org of orgs) {
    const activeSubs = org.subscriptions.filter((s) => s.status === "active");
    if (activeSubs.some((s) => BASE_MODULES.includes(s.module))) activeClients += 1;
    for (const s of activeSubs) {
      const cents = PRICES[s.module]?.amountCents || 0;
      mrrCents += cents;
      revenueByModule[s.module] = (revenueByModule[s.module] || 0) + cents;
    }
  }

  const { start, end } = monthBounds();
  const churnThisMonth = await prisma.subscription.count({
    where: { module: { in: BASE_MODULES }, canceledAt: { gte: start, lt: end } },
  });
  // Churn % sobre a base ativa + quem cancelou esse mês (base do início do mês, aproximada).
  const churnRate = activeClients + churnThisMonth > 0 ? (churnThisMonth / (activeClients + churnThisMonth)) * 100 : 0;

  const avgTicketCents = activeClients > 0 ? mrrCents / activeClients : 0;

  const revenueByModuleArr = Object.entries(revenueByModule)
    .map(([module, cents]) => ({ module, label: PRICES[module]?.label || module, cents }))
    .sort((a, b) => b.cents - a.cents);

  res.json({
    mrrCents,
    activeClients,
    churnThisMonth,
    churnRatePct: Math.round(churnRate * 10) / 10,
    avgTicketCents,
    revenueByModule: revenueByModuleArr,
  });
});

// -------- Lista de clientes, um por organização --------
router.get("/clients", async (req, res) => {
  const orgs = await prisma.organization.findMany({
    include: {
      users: { select: { id: true, name: true, email: true, role: true, lastLoginAt: true, createdAt: true } },
      subscriptions: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const clients = orgs.map((org) => {
    const master = org.users.find((u) => u.role === "master") || org.users[0] || null;
    const activeSubs = org.subscriptions.filter((s) => s.status === "active");
    const baseSub = activeSubs.find((s) => BASE_MODULES.includes(s.module));
    const addons = activeSubs.filter((s) => ADDON_MODULES.includes(s.module)).map((s) => ADDON_LABEL[s.module] || s.module);
    const pastDueSub = org.subscriptions.find((s) => s.status === "past_due");

    const lastLogins = org.users.map((u) => u.lastLoginAt).filter(Boolean);
    const lastAccess = lastLogins.length ? new Date(Math.max(...lastLogins.map((d) => new Date(d).getTime()))) : null;

    return {
      organizationId: org.id,
      name: org.name,
      masterName: master?.name || null,
      masterEmail: master?.email || null,
      plan: org.plan,
      planLabel: baseSub ? PRICES[baseSub.module]?.label : null,
      addons,
      usersActive: org.users.length,
      usersMax: MAX_TEAM_SIZE,
      memberSince: org.createdAt,
      mrrCents: subsMrrCents(activeSubs),
      paymentStatus: pastDueSub ? "past_due" : baseSub ? "active" : "inactive",
      lastAccess,
    };
  });

  res.json({ clients });
});

// -------- Risco de ativação: assinantes que nunca usaram ou sumiram --------
router.get("/activation-risk", async (req, res) => {
  const orgs = await prisma.organization.findMany({
    include: {
      users: { select: { lastLoginAt: true, createdAt: true } },
      subscriptions: true,
      leads: { select: { id: true }, take: 1 },
      gestaoUploads: { select: { id: true }, take: 1 },
    },
  });

  const STALE_DAYS = 14;
  const now = Date.now();
  const risk = [];

  for (const org of orgs) {
    const activeSubs = org.subscriptions.filter((s) => s.status === "active");
    const hasBase = activeSubs.some((s) => BASE_MODULES.includes(s.module));
    if (!hasBase) continue; // sem assinatura ainda não é "risco", é só lead não convertido

    const lastLogins = org.users.map((u) => u.lastLoginAt).filter(Boolean);
    const lastAccess = lastLogins.length ? new Date(Math.max(...lastLogins.map((d) => new Date(d).getTime()))) : null;
    const daysSinceAccess = lastAccess ? (now - lastAccess.getTime()) / 86400000 : null;
    const hasUsage = org.leads.length > 0 || org.gestaoUploads.length > 0;

    if (!lastAccess) {
      risk.push({ organizationId: org.id, name: org.name, reason: "Assinou e nunca fez login", severity: "alta" });
    } else if (!hasUsage && daysSinceAccess !== null && daysSinceAccess > STALE_DAYS) {
      risk.push({ organizationId: org.id, name: org.name, reason: `Login único, sem uso há ${Math.floor(daysSinceAccess)} dias`, severity: "alta" });
    } else if (daysSinceAccess !== null && daysSinceAccess > STALE_DAYS) {
      risk.push({ organizationId: org.id, name: org.name, reason: `Sem acesso há ${Math.floor(daysSinceAccess)} dias`, severity: "media" });
    }
  }

  res.json({ risk });
});

export default router;
