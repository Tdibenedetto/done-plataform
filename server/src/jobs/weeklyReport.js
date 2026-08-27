import "dotenv/config";
import { prisma } from "../lib/prisma.js";
import { sendWeeklyReport } from "../lib/mailer.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const STALLED_STAGES = ["Novo Lead", "Qualificação", "Proposta", "Negociação"];
const STAGE_WEIGHT = { "Novo Lead": 0.10, "Qualificação": 0.25, "Proposta": 0.50, "Negociação": 0.75 };
const MES_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

async function buildReportData(org) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthLabel = MES_ABBR[now.getMonth()];

  const [latestCoach, leads, revenueGoal, invoiced, latestUpload] = await Promise.all([
    prisma.coachResult.findFirst({ where: { organizationId: org.id }, orderBy: { createdAt: "desc" }, select: { final: true } }),
    prisma.lead.findMany({ where: { organizationId: org.id, stage: { in: STALLED_STAGES } }, select: { value: true, stage: true, updatedAt: true } }),
    prisma.revenueGoal.findFirst({ where: { organizationId: org.id, month: thisMonthLabel } }),
    prisma.invoiceEvent.aggregate({
      where: { date: { gte: startOfMonth }, lead: { organizationId: org.id } },
      _sum: { amount: true },
    }),
    prisma.gestaoUpload.findFirst({ where: { organizationId: org.id }, orderBy: { createdAt: "desc" } }),
  ]);

  const staleBefore = new Date(Date.now() - org.followUpDays * 24 * 60 * 60 * 1000);
  const pipelineRaw = leads.reduce((s, l) => s + l.value, 0);
  const pipelineWeighted = leads.reduce((s, l) => s + l.value * (STAGE_WEIGHT[l.stage] || 0), 0);
  const leadsParados = leads.filter((l) => new Date(l.updatedAt) <= staleBefore).length;

  let rupturas = 0, excessos = 0, hasGestaoData = false;
  if (latestUpload) {
    hasGestaoData = true;
    for (const r of latestUpload.rows) {
      if (r.estoque === "ruptura") rupturas += 1;
      if (r.estoque === "excesso") excessos += 1;
    }
  }

  return {
    notaComercial: latestCoach?.final ?? null,
    faturadoNoMes: invoiced._sum.amount || 0,
    metaFaturamento: revenueGoal?.target || 0,
    pipelineRaw, pipelineWeighted, leadsParados,
    hasGestaoData, rupturas, excessos,
  };
}

/**
 * Envia o resumo semanal por e-mail para o Master de cada organização com
 * plano ativo, uma vez por semana. Reaproveitável em processo (agendador
 * leve) e via CLI standalone.
 *
 * options.organizationId: restringe a checagem a uma única organização.
 * options.skipInterval: ignora o intervalo de 7 dias (usado em teste manual).
 */
export async function runWeeklyReportCheck(options = {}) {
  const { organizationId = null, skipInterval = false } = options;
  const staleBefore = new Date(Date.now() - WEEK_MS);

  const orgs = await prisma.organization.findMany({
    where: {
      ...(organizationId ? { id: organizationId } : {}),
      ...(skipInterval ? {} : { OR: [{ lastWeeklyReportAt: null }, { lastWeeklyReportAt: { lte: staleBefore } }] }),
      subscriptions: { some: { status: "active", module: { in: ["vendas", "gestao", "completo"] } } },
    },
    include: { users: { where: { role: "master" }, select: { email: true }, take: 1 } },
  });

  let sent = 0;

  for (const org of orgs) {
    const master = org.users[0];
    if (!master) continue;

    try {
      const data = await buildReportData(org);
      const result = await sendWeeklyReport({ to: master.email, orgName: org.name, data });
      if (result.sent) sent += 1;
      await prisma.organization.update({ where: { id: org.id }, data: { lastWeeklyReportAt: new Date() } });
    } catch (e) {
      console.error(`[weekly-report] falha ao montar/enviar relatório de ${org.name}:`, e.message);
    }
  }

  console.log(`[weekly-report] verificação concluída — ${sent} relatório(s) enviado(s) de ${orgs.length} organização(ões) verificada(s).`);
  return { sent, orgsChecked: orgs.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWeeklyReportCheck()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error("[weekly-report] falha geral:", e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
