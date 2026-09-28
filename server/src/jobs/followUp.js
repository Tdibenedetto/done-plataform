import "dotenv/config";
import { prisma } from "../lib/prisma.js";
import { sendAlert, isTwilioConfigured } from "../lib/twilio.js";

const MONTHLY_CAP_PER_ORG = 60; // teto de envios automáticos por organização/mês, para não sangrar o crédito Twilio
const STALLED_STAGES = ["Novo Lead", "Qualificação", "Proposta", "Negociação"]; // etapas que ainda estão "em jogo"

// Falhas que valem para a conta inteira (não para um lead específico): insistir nos outros leads
// só repetiria a mesma recusa. Também viram mensagem em português para o Master ver no Vendas.
const ACCOUNT_LEVEL_ERROR = /compliance profile|trust hub|kyc|authenticate|unverified|not yet verified/i;

function friendlyError(message = "") {
  if (/compliance profile|trust hub|kyc/i.test(message)) {
    return "O Twilio recusou o envio: a conta ainda não tem um perfil de conformidade (KYC) aprovado. Conclua no Twilio em Trust Hub → Profiles → Primary profile.";
  }
  if (/not yet verified|unverified/i.test(message)) {
    return "O Twilio só envia para números verificados enquanto a conta não tiver um perfil de conformidade aprovado.";
  }
  if (/authenticate/i.test(message)) {
    return "As credenciais do Twilio configuradas no servidor foram recusadas — confira TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN.";
  }
  return `O envio do lembrete falhou: ${message.slice(0, 160)}`;
}

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
      ...(skipPlanCheck ? {} : { subscriptions: { some: { status: { in: ["active", "trialing"] }, module: { in: ["vendas", "completo"] } } } }),
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

    let orgError = null;
    let orgSent = 0;

    for (const lead of leads) {
      if (remaining <= 0) break;

      // Evita reenviar o mesmo lembrete todo dia — só alerta de novo depois de passar o mesmo intervalo.
      const alreadyAlerted = await prisma.followUpAlert.findFirst({
        where: { leadId: lead.id, createdAt: { gte: staleBefore } },
      });
      if (alreadyAlerted) continue;

      const body = `D.O.N.E — Lembrete de follow-up\n"${lead.name}" (${lead.stage}) está parado há ${org.followUpDays}+ dias. Hora de retomar o contato.`;
      try {
        const result = await sendAlert(lead.assignedUser.phone, body);
        if (result?.skipped) {
          console.warn(`[followup] Twilio não configurado — lembrete para o lead ${lead.id} (${org.name}) NÃO foi enviado de verdade.`);
          continue; // não conta como enviado, não cria registro, não bloqueia retentativa depois
        }
        await prisma.followUpAlert.create({
          data: { organizationId: org.id, leadId: lead.id, sentTo: lead.assignedUser.phone },
        });
        remaining -= 1;
        totalSent += 1;
        orgSent += 1;
      } catch (e) {
        console.error(`[followup] falha ao alertar lead ${lead.id} (${org.name}):`, e.message);
        orgError = orgError || e.message;
        if (ACCOUNT_LEVEL_ERROR.test(e.message)) break; // vale para a conta toda — não adianta tentar os demais
      }
    }

    // Registra na organização para o Master ver no Vendas (antes a falha só aparecia no log do servidor).
    // Só limpa o aviso quando um envio realmente deu certo; sem leads tentados, mantém o estado anterior.
    if (orgError && orgSent === 0) {
      await prisma.organization.update({ where: { id: org.id }, data: { followUpError: friendlyError(orgError), followUpErrorAt: new Date() } });
    } else if (orgSent > 0) {
      await prisma.organization.update({ where: { id: org.id }, data: { followUpError: null, followUpErrorAt: null } });
    }
  }

  console.log(`[followup] verificação concluída — ${totalSent} lembrete(s) enviado(s) em ${orgs.length} organização(ões) verificada(s).`);
  return { totalSent, orgsChecked: orgs.length, twilioConfigured: isTwilioConfigured };
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
