import { prisma } from "../lib/prisma.js";

// Zera os dados de UMA conta (organização), mantendo o login, os usuários e as assinaturas.
// Roda uma única vez na subida do servidor, e só quando as três variáveis abaixo estão no Render:
//   ZERAR_CONTA_ORG_ID   id da organização
//   ZERAR_CONTA_CONFIRMA exatamente "SIM-APAGAR-TUDO"
//   ZERAR_CONTA_ATE      data/hora limite (ISO). Depois dela a rotina não roda mais,
//                        para um reinício do servidor nunca apagar dados novos por engano.
// Com ZERAR_CONTA_ACESSO_TOTAL="sim", também garante acesso a todos os módulos (sem cobrança).
const TODOS_MODULOS = ["completo", "vendas", "gestao", "credito", "sortimento", "coach", "whatsapp", "dre"];

export async function runZerarConta() {
  const orgId = process.env.ZERAR_CONTA_ORG_ID;
  if (!orgId) return;
  if (process.env.ZERAR_CONTA_CONFIRMA !== "SIM-APAGAR-TUDO") {
    console.error("[zerar-conta] ZERAR_CONTA_CONFIRMA ausente ou diferente de SIM-APAGAR-TUDO — nada foi apagado.");
    return;
  }
  const ate = new Date(process.env.ZERAR_CONTA_ATE || "");
  if (isNaN(ate) || Date.now() > ate.getTime()) {
    console.error("[zerar-conta] ZERAR_CONTA_ATE vencido ou inválido — nada foi apagado.");
    return;
  }
  const org = await prisma.organization.findUnique({ where: { id: orgId }, include: { users: { select: { id: true } } } });
  if (!org) {
    console.error(`[zerar-conta] organização ${orgId} não encontrada — nada foi apagado.`);
    return;
  }
  const where = { organizationId: orgId };
  const userIds = org.users.map((u) => u.id);

  const r = await prisma.$transaction([
    prisma.creditAlert.deleteMany({ where }),
    prisma.lead.deleteMany({ where }), // leva junto itens, notas e eventos de faturamento
    prisma.creditAnalysis.deleteMany({ where }),
    prisma.cliente.deleteMany({ where }), // leva junto o histórico de limites
    prisma.grupoEconomico.deleteMany({ where }),
    prisma.produto.deleteMany({ where }),
    prisma.tabelaPrecoPublica.deleteMany({ where }),
    prisma.gestaoUpload.deleteMany({ where }),
    prisma.revenueGoal.deleteMany({ where }),
    prisma.goal.deleteMany({ where }),
    prisma.coachResult.deleteMany({ where }),
    prisma.dreEntry.deleteMany({ where }),
    prisma.supportThread.deleteMany({ where }), // leva junto as mensagens
    prisma.followUpAlert.deleteMany({ where }),
    prisma.invite.deleteMany({ where }),
    prisma.passwordReset.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.organization.update({
      where: { id: orgId },
      data: { logoUrl: null, dreSaldoInicial: 0, followUpError: null, followUpErrorAt: null },
    }),
  ]);
  const nomes = ["alertas de crédito", "leads", "análises de crédito", "clientes", "grupos", "produtos", "tabela pública",
    "planilhas de gestão", "metas de faturamento", "metas", "diagnósticos", "lançamentos de DRE", "conversas de suporte",
    "alertas de follow-up", "convites", "pedidos de senha"];
  console.log("[zerar-conta] conta zerada:", nomes.map((n, i) => `${n}=${r[i].count}`).join(", "));

  if (process.env.ZERAR_CONTA_ACESSO_TOTAL === "sim") {
    const ativas = await prisma.subscription.findMany({
      where: { organizationId: orgId, status: "active", stripeSubscriptionId: null },
      select: { module: true },
    });
    const tem = new Set(ativas.map((s) => s.module));
    const faltam = TODOS_MODULOS.filter((m) => !tem.has(m));
    for (const module of faltam) {
      await prisma.subscription.create({ data: { organizationId: orgId, module, status: "active" } });
    }
    await prisma.organization.update({ where: { id: orgId }, data: { plan: "completo" } });
    console.log(`[zerar-conta] acesso total garantido (liberados sem cobrança: ${faltam.join(", ") || "nenhum, já tinha tudo"}).`);
  }
}
