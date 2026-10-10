import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";

// Números do funil da plataforma (cadastros → diagnósticos → assinaturas), por dia,
// para o painel de desempenho do site na plataforma de conteúdo (done-social).
// Acesso só com o token STATS_TOKEN, enviado no cabeçalho "x-stats-token".
// Nada de dados pessoais: só contagens.
const router = Router();

function tokenOk(req) {
  const expected = process.env.STATS_TOKEN || "";
  const got = String(req.get("x-stats-token") || "");
  if (!expected || got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

// Dia no horário de Brasília (UTC−3, sem horário de verão).
const spDay = (d) => new Date(new Date(d).getTime() - 3 * 3600e3).toISOString().slice(0, 10);

function countByDay(rows) {
  const out = {};
  for (const r of rows) {
    const k = spDay(r.createdAt);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

router.get("/funil", async (req, res) => {
  if (!tokenOk(req)) return res.status(404).json({ error: "Não encontrado." });

  // A conta do dono da plataforma não entra na conta (não é cliente vindo do site).
  const adminEmail = String(process.env.PLATFORM_ADMIN_EMAIL || "").trim().toLowerCase();
  const admins = adminEmail ? await prisma.user.findMany({ where: { email: adminEmail }, select: { organizationId: true } }) : [];
  const excluded = admins.map((a) => a.organizationId);
  const notExcluded = excluded.length ? { organizationId: { notIn: excluded } } : {};

  const [orgs, coach, subs, activeSubs] = await Promise.all([
    prisma.organization.findMany({ where: excluded.length ? { id: { notIn: excluded } } : {}, select: { id: true, createdAt: true } }),
    prisma.coachResult.findMany({ where: notExcluded, select: { organizationId: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.subscription.findMany({ where: notExcluded, select: { organizationId: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.subscription.count({ where: { ...notExcluded, status: "active" } }),
  ]);

  // Diagnóstico e assinatura contam uma vez por empresa: o primeiro de cada uma.
  const firstPerOrg = (rows) => {
    const seen = new Set();
    return rows.filter((r) => (seen.has(r.organizationId) ? false : seen.add(r.organizationId)));
  };
  const coachFirst = firstPerOrg(coach);
  const subsFirst = firstPerOrg(subs);

  res.json({
    at: new Date().toISOString(),
    cadastros: countByDay(orgs),
    diagnosticos: countByDay(coachFirst),
    assinaturas: countByDay(subsFirst),
    totais: {
      cadastros: orgs.length,
      diagnosticos: coachFirst.length,
      assinaturas: subsFirst.length,
      assinantesAtivos: activeSubs,
    },
  });
});

export default router;
