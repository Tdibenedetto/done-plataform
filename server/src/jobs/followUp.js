import "dotenv/config";
import { prisma } from "../lib/prisma.js";
import { sendAlert } from "../lib/twilio.js";

const MONTHLY_CAP_PER_ORG = 60; // teto de envios automáticos por organização/mês, para não sangrar o crédito Twilio
const STALLED_STAGES = ["Novo Lead", "Qualificação", "Proposta", "Negociação"]; // etapas que ainda estão "em jogo"

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Varre organizações com Vendas/Completo ativo e envia lembrete automático de
 * follow-up para leads parados. Reaproveitável tanto como chamada em processo
 * (agendador leve dentro do done-api) quanto via CLI.
 *
 * options.organizationId: restringe a checagem a uma única organização (usado
 * pelo botão "Testar agora" do Master).
 * options.skipPlanCheck: ignora a exigência de assinatura ativa — só faz
 * sentido combinado com organizationId, para teste manual autenticado.
 */
export async function runFollowUpCheck(options = {}) {
  const { organizationId = null, skipPlanCheck = false } = options;

  const orgs = await prisma.organization.findMany({
    where: {
      ...(organizationId ? { id: organizationId } : {}),
      ...(skipPlanCheck ? {} : { subscriptions: { some: { status: "active", module: { in: ["vendas", "completo"] } } } }),
    },
    select: { id: true, name: true, followUpDays: true },
  });

  let totalSent = 0;

  for (const org of orgs) {
    const sentThisMonth = await prisma.followUpAlert.count({
      where: { organizationId: org.id, createdAt: { gte: startOfMonth() } },
    });
    let remaining = MONTHLY_CAP_PER_ORG - sentThisMonth;
    if (remaining <= 0) continue;

    const staleBefore = new Date(Date.now() - org.followUpDays * 24 * 60 * 60 * 1000);

    const leads = await prisma.lead.findMany({
      where: {
        organizationId: org.id,
        stage: { in: STALLED_STAGES },
        updatedAt: { lte: staleBefore },
        assignedUser: { phone: { not: null } },
      },
      include: { assignedUser: { select: { id: true, name: true, phone: true } } },
    });

    for (const lead of leads) {
      if (remaining <= 0) break;

      // Evita reenviar o mesmo lembrete todo dia — só alerta de novo depois de passar o mesmo intervalo.
      const alreadyAlerted = await prisma.followUpAlert.findFirst({
        where: { leadId: lead.id, createdAt: { gte: staleBefore } },
      });
      if (alreadyAlerted) continue;

      const body = `D.O.N.E — Lembrete de follow-up\n"${lead.name}" (${lead.stage}) está parado há ${org.followUpDays}+ dias. Hora de retomar o contato.`;
      try {
        await sendAlert(lead.assignedUser.phone, body);
        await prisma.followUpAlert.create({
          data: { organizationId: org.id, leadId: lead.id, sentTo: lead.assignedUser.phone },
        });
        remaining -= 1;
        totalSent += 1;
      } catch (e) {
        console.error(`[followup] falha ao alertar lead ${lead.id} (${org.name}):`, e.message);
      }
    }
  }

  console.log(`[followup] verificação concluída — ${totalSent} lembrete(s) enviado(s) em ${orgs.length} organização(ões) verificada(s).`);
  return { totalSent, orgsChecked: orgs.length };
}

// Permite continuar rodando como script standalone (ex: se um dia migrar para um Cron Job de verdade).
if (import.meta.url === `file://${process.argv[1]}`) {
  runFollowUpCheck()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error("[followup] falha geral:", e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
