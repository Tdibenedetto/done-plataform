import { Router } from "express";
import express from "express";
import { prisma } from "../lib/prisma.js";
import { stripe, PRICES, INCLUDED_IN, SUPERSEDES, ADDON_REQUIRES } from "../lib/stripe.js";
import { requireMaster, requirePlatformAdmin } from "../middleware/auth.js";

const router = Router();

const BASE_PLANS = ["vendas", "gestao", "completo"];
// "Com acesso" = pagando ou em teste. "Em aberto" inclui também pagamento pendente: a assinatura
// ainda existe no Stripe e continua tentando cobrar, então não pode ser contratada de novo.
const ACCESS_STATUSES = ["active", "trialing"];
const OPEN_STATUSES = ["active", "trialing", "past_due", "unpaid"];

function periodEnd(stripeSub) {
  // Em versões mais novas da API do Stripe o fim do período saiu da assinatura e foi para o item.
  const ts = stripeSub.current_period_end ?? stripeSub.items?.data?.[0]?.current_period_end;
  return ts ? new Date(ts * 1000) : null;
}

function checkoutUrls(product) {
  return {
    success_url: `${process.env.CLIENT_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}&product=${product}`,
    cancel_url: `${process.env.CLIENT_URL}/billing/cancel`,
  };
}

// Reaproveita o cliente do Stripe da organização (todas as assinaturas num lugar só). Se ainda não
// existe — ou se o cliente guardado foi apagado no Stripe — cai para o e-mail e o Stripe cria um novo.
async function createCheckoutSession(org, email, params) {
  if (org.stripeCustomerId) {
    try {
      return await stripe.checkout.sessions.create({ ...params, customer: org.stripeCustomerId });
    } catch (e) {
      if (e?.code !== "resource_missing") throw e;
      console.warn(`[billing] cliente Stripe ${org.stripeCustomerId} da organização ${org.id} não existe mais — criando outro.`);
      await prisma.organization.update({ where: { id: org.id }, data: { stripeCustomerId: null } });
    }
  }
  return stripe.checkout.sessions.create({ ...params, customer_email: email });
}

// Apenas o Master assina/compra módulos para a organização.
// Observação: este endpoint NUNCA aceita período de teste vindo do corpo da requisição —
// isso é proposital, para que nenhum cliente possa se auto-conceder um trial infinito.
// Conceder teste grátis é feito só pelo Admin Geral, via /admin-checkout-link abaixo.
router.post("/checkout", requireMaster, async (req, res) => {
  const { product } = req.body; // "coach" | "vendas" | "gestao" | "completo" | "credito" | "sortimento" | "whatsapp" | "dre"
  const price = PRICES[product];
  if (!price) return res.status(400).json({ error: "Produto inválido." });

  // -------- Proteção contra cobrança em dobro --------
  const openSubs = await prisma.subscription.findMany({
    where: { organizationId: req.organizationId, status: { in: OPEN_STATUSES } },
  });
  const openModules = new Set(openSubs.map((s) => s.module));
  const accessModules = new Set(openSubs.filter((s) => ACCESS_STATUSES.includes(s.status)).map((s) => s.module));

  if (openModules.has(product)) {
    const pending = !accessModules.has(product);
    return res.status(409).json({
      code: pending ? "payment_pending" : "already_subscribed",
      error: pending
        ? `Você já tem uma assinatura de ${price.label} com pagamento pendente. Atualize o cartão em "Gerenciar assinatura" em vez de assinar de novo.`
        : `Você já assina ${price.label} — não é preciso assinar de novo.`,
    });
  }
  const coveredBy = (INCLUDED_IN[product] || []).find((m) => openModules.has(m));
  if (coveredBy) {
    return res.status(409).json({
      code: "already_included",
      error: `${price.label} já está incluso no seu plano atual (${PRICES[coveredBy].label}) — você não precisa pagar à parte.`,
    });
  }
  const requires = ADDON_REQUIRES[product];
  if (requires && !requires.some((m) => accessModules.has(m))) {
    return res.status(400).json({
      code: "requires_base_plan",
      error: `Este add-on exige uma assinatura ativa de ${requires.map((m) => PRICES[m].label).join(" ou ")}.`,
    });
  }

  const [user, org] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.userId } }),
    prisma.organization.findUnique({ where: { id: req.organizationId } }),
  ]);

  const session = await createCheckoutSession(org, user.email, {
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: "brl",
          product_data: { name: price.label },
          unit_amount: price.amountCents,
          recurring: { interval: "month", interval_count: price.intervalCount || 1 },
        },
        quantity: 1,
      },
    ],
    metadata: { organizationId: req.organizationId, product },
    ...checkoutUrls(product),
  });

  res.json({ url: session.url });
});

// Restrito ao Admin Geral — gera um link de checkout com período de teste grátis para
// UMA organização específica (um cliente já cadastrado, com quem o fundador está negociando).
// O cliente recebe o link (por e-mail/WhatsApp) e preenche o cartão; o Stripe só cobra
// depois de `trialDays` dias. Separado do /checkout normal de propósito — ver comentário acima.
router.post("/admin-checkout-link", requirePlatformAdmin, async (req, res) => {
  const { organizationId, product, trialDays } = req.body;
  const price = PRICES[product];
  if (!price || !["vendas", "gestao", "completo", "sortimento", "whatsapp", "dre"].includes(product)) {
    return res.status(400).json({ error: "Escolha um módulo ou add-on válido (período de teste não se aplica ao relatório avulso)." });
  }
  const days = Number(trialDays);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return res.status(400).json({ error: "Informe um número de dias de teste entre 1 e 90." });
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { users: { where: { role: "master" }, take: 1 } },
  });
  if (!org) return res.status(404).json({ error: "Organização não encontrada." });
  const master = org.users[0];
  if (!master) return res.status(400).json({ error: "Essa organização ainda não tem um usuário Master cadastrado." });

  const session = await createCheckoutSession(org, master.email, {
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: "brl",
          product_data: { name: price.label },
          unit_amount: price.amountCents,
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    subscription_data: { trial_period_days: days },
    metadata: { organizationId, product },
    ...checkoutUrls(product),
  });

  res.json({ url: session.url });
});

// -------- Efetiva uma compra concluída no Stripe --------
// Chamado por DOIS caminhos, por isso precisa poder rodar mais de uma vez sem duplicar nada:
//  1. o webhook do Stripe (checkout.session.completed);
//  2. a própria tela, quando o cliente volta do pagamento (/confirm) — assim o acesso é liberado
//     na hora, mesmo que o webhook atrase alguns segundos.
async function fulfillCheckout(session) {
  const { organizationId, product } = session.metadata || {};
  const stripeSubscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!organizationId || !product || !stripeSubscriptionId) return null;

  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) return null; // organização excluída entre a compra e a confirmação

  // Busca o status real no Stripe em vez de assumir "active" — uma assinatura criada com
  // período de teste (trial_period_days) já nasce como "trialing", não "active", e o painel
  // Admin Geral depende desse status estar certo (senão o MRR contaria receita que não existe ainda).
  const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const data = {
    status: stripeSub.status,
    currentPeriodEnd: periodEnd(stripeSub),
    cancelAtPeriodEnd: !!stripeSub.cancel_at_period_end,
  };

  const existing = await prisma.subscription.findUnique({ where: { stripeSubscriptionId } });
  if (existing) {
    await prisma.subscription.update({ where: { id: existing.id }, data });
  } else {
    try {
      await prisma.subscription.create({ data: { organizationId, module: product, stripeSubscriptionId, ...data } });
    } catch (e) {
      if (e?.code !== "P2002") throw e; // webhook e tela chegaram juntos — o outro já criou
      await prisma.subscription.update({ where: { stripeSubscriptionId }, data });
    }
  }

  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const orgUpdate = {};
  if (customerId && org.stripeCustomerId !== customerId) orgUpdate.stripeCustomerId = customerId;
  // Só os planos principais (não add-ons como whatsapp/dre, nem coach) definem o "plan" da organização.
  if (BASE_PLANS.includes(product)) orgUpdate.plan = product;
  if (Object.keys(orgUpdate).length) await prisma.organization.update({ where: { id: organizationId }, data: orgUpdate });

  // Upgrade: o plano novo engloba assinaturas menores que a empresa já pagava — cancela essas
  // agora, com crédito proporcional do que não foi usado, para o cliente não pagar duas vezes.
  if (ACCESS_STATUSES.includes(stripeSub.status)) {
    const superseded = await prisma.subscription.findMany({
      where: { organizationId, module: { in: SUPERSEDES[product] || [] }, status: { in: OPEN_STATUSES } },
    });
    for (const old of superseded) {
      if (old.stripeSubscriptionId) {
        try {
          await stripe.subscriptions.cancel(old.stripeSubscriptionId, { prorate: true });
        } catch (e) {
          if (e?.code !== "resource_missing") {
            // Não marca como cancelada: no Stripe ela continua viva e cobrando — precisa aparecer assim.
            console.error(`[billing] ATENÇÃO: não consegui cancelar a assinatura ${old.stripeSubscriptionId} (${old.module}) da organização ${organizationId} após o upgrade para ${product}. Cancele manualmente no Stripe para evitar cobrança em dobro. Motivo: ${e.message}`);
            continue;
          }
        }
      }
      // canceledAt fica vazio de propósito: troca de plano não é churn.
      await prisma.subscription.update({ where: { id: old.id }, data: { status: "canceled", cancelAtPeriodEnd: false } });
    }
  }

  return { organizationId, product, status: stripeSub.status };
}

// A tela chama isto ao voltar do pagamento, com o session_id que o Stripe devolve na URL.
router.get("/confirm", async (req, res) => {
  const sessionId = String(req.query.session_id || "");
  if (!sessionId) return res.status(400).json({ error: "Sessão de pagamento não informada." });

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (e) {
    console.error("[billing] falha ao consultar a sessão de pagamento:", e.message);
    return res.json({ confirmed: false });
  }
  // Só a própria empresa confirma a própria compra.
  if (session.metadata?.organizationId !== req.organizationId) {
    return res.status(404).json({ error: "Pagamento não encontrado." });
  }
  if (session.status !== "complete") return res.json({ confirmed: false });

  try {
    const result = await fulfillCheckout(session);
    return res.json({ confirmed: !!result && ACCESS_STATUSES.includes(result.status), product: session.metadata.product });
  } catch (e) {
    console.error("[billing] falha ao efetivar a compra na volta do pagamento:", e.message);
    return res.json({ confirmed: false });
  }
});

// -------- Portal do cliente (Stripe): cancelar, trocar cartão, ver faturas --------
let portalConfigurationId = null;

async function createPortalSession(customerId) {
  const params = { customer: customerId, return_url: `${process.env.CLIENT_URL}/billing/portal-return` };
  if (portalConfigurationId) params.configuration = portalConfigurationId;
  try {
    return await stripe.billingPortal.sessions.create(params);
  } catch (e) {
    // O Stripe exige que o portal tenha sido configurado ao menos uma vez na conta. Se ainda não
    // foi, criamos aqui uma configuração básica (cancelar no fim do período, trocar cartão, faturas).
    if (portalConfigurationId || !/configuration/i.test(e?.message || "")) throw e;
    const existing = await stripe.billingPortal.configurations.list({ active: true, limit: 1 });
    if (existing.data?.[0]) {
      portalConfigurationId = existing.data[0].id;
    } else {
      const created = await stripe.billingPortal.configurations.create({
        business_profile: { headline: "D.O.N.E — gerencie sua assinatura" },
        features: {
          payment_method_update: { enabled: true },
          invoice_history: { enabled: true },
          subscription_cancel: { enabled: true, mode: "at_period_end" },
        },
      });
      portalConfigurationId = created.id;
    }
    return stripe.billingPortal.sessions.create({ ...params, configuration: portalConfigurationId });
  }
}

async function customerOfSubscription(sub) {
  if (!sub?.stripeSubscriptionId) return null;
  try {
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
    return typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer?.id || null;
  } catch (e) {
    console.warn(`[billing] não consegui ler a assinatura ${sub.stripeSubscriptionId} no Stripe: ${e.message}`);
    return null;
  }
}

router.post("/portal", requireMaster, async (req, res) => {
  const module = req.body?.module ? String(req.body.module) : null;
  const [org, subs] = await Promise.all([
    prisma.organization.findUnique({ where: { id: req.organizationId } }),
    prisma.subscription.findMany({
      where: { organizationId: req.organizationId, stripeSubscriptionId: { not: null } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const open = subs.filter((s) => OPEN_STATUSES.includes(s.status));

  // Assinaturas antigas podem estar em clientes diferentes no Stripe (antes cada compra criava um
  // cliente novo). Quando a tela diz QUAL plano quer gerenciar, abrimos o portal do cliente dono dele.
  let customerId = module ? await customerOfSubscription(open.find((s) => s.module === module)) : null;
  if (!customerId) customerId = org?.stripeCustomerId || null;
  if (!customerId) customerId = await customerOfSubscription(open[0] || subs[0]);

  if (!customerId) {
    return res.status(400).json({
      code: "no_stripe_customer",
      error: "Sua assinatura foi liberada diretamente pela equipe D.O.N.E, sem cobrança no cartão. Para alterar ou cancelar, fale com o suporte pelo chat.",
    });
  }

  try {
    const session = await createPortalSession(customerId);
    res.json({ url: session.url });
  } catch (e) {
    console.error("[billing] falha ao abrir o portal de assinatura:", e.message);
    res.status(502).json({ error: "Não foi possível abrir o gerenciamento da assinatura agora. Tente de novo em instantes ou fale com o suporte pelo chat." });
  }
});

// Stripe webhook — recebe o body RAW, montado com express.raw() em index.js.
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe webhook] signature verification failed", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    await fulfillCheckout(event.data.object);
  }

  // Mantém o status real da assinatura em dia — sem isso, "pagamento atrasado" nunca refletiria
  // a realidade (ficaria "active" para sempre, mesmo com cartão recusado ou assinatura cancelada).
  // cancelAtPeriodEnd: o cliente pediu cancelamento no portal; segue com acesso até o fim do período.
  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object;
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: sub.id, status: { not: "canceled" } },
      data: {
        status: sub.status,
        currentPeriodEnd: periodEnd(sub),
        cancelAtPeriodEnd: !!(sub.cancel_at_period_end || sub.cancel_at),
      },
    });
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    const existing = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: sub.id } });
    // Já "canceled" = foi substituída num upgrade (fulfillCheckout) — não conta como churn.
    if (existing && existing.status !== "canceled") {
      await prisma.subscription.update({
        where: { id: existing.id },
        data: { status: "canceled", canceledAt: new Date(), cancelAtPeriodEnd: false },
      });
      // Se era o plano base da organização, limpa — evita mostrar um plano que não existe mais.
      if (BASE_PLANS.includes(existing.module)) {
        const org = await prisma.organization.findUnique({ where: { id: existing.organizationId } });
        if (org?.plan === existing.module) {
          await prisma.organization.update({ where: { id: existing.organizationId }, data: { plan: null } });
        }
      }
    }
  }

  res.json({ received: true });
});

router.get("/status", async (req, res) => {
  const [payments, subscriptions] = await Promise.all([
    prisma.payment.findMany({ where: { organizationId: req.organizationId } }),
    prisma.subscription.findMany({ where: { organizationId: req.organizationId } }),
  ]);
  res.json({ payments, subscriptions });
});

export default router;
