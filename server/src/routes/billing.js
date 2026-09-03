import { Router } from "express";
import express from "express";
import { prisma } from "../lib/prisma.js";
import { stripe, PRICES } from "../lib/stripe.js";
import { requireMaster, requirePlatformAdmin } from "../middleware/auth.js";

const router = Router();

// Apenas o Master assina/compra módulos para a organização.
// Observação: este endpoint NUNCA aceita período de teste vindo do corpo da requisição —
// isso é proposital, para que nenhum cliente possa se auto-conceder um trial infinito.
// Conceder teste grátis é feito só pelo Admin Geral, via /admin-checkout-link abaixo.
router.post("/checkout", requireMaster, async (req, res) => {
  const { product } = req.body; // "coach_report" | "vendas" | "gestao" | "completo" | "whatsapp" | "dre"
  const price = PRICES[product];
  if (!price) return res.status(400).json({ error: "Produto inválido." });

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  const isSubscription = product !== "coach_report";

  const session = await stripe.checkout.sessions.create({
    mode: isSubscription ? "subscription" : "payment",
    customer_email: user.email,
    line_items: [
      {
        price_data: {
          currency: "brl",
          product_data: { name: price.label },
          unit_amount: price.amountCents,
          ...(isSubscription ? { recurring: { interval: "month" } } : {}),
        },
        quantity: 1,
      },
    ],
    metadata: { organizationId: req.organizationId, product },
    success_url: `${process.env.CLIENT_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.CLIENT_URL}/billing/cancel`,
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
  if (!price || !["vendas", "gestao", "completo", "whatsapp", "dre"].includes(product)) {
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

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: master.email,
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
    success_url: `${process.env.CLIENT_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.CLIENT_URL}/billing/cancel`,
  });

  res.json({ url: session.url });
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
    const session = event.data.object;
    const { organizationId, product } = session.metadata || {};
    if (!organizationId || !product) return res.json({ received: true });

    if (product === "coach_report") {
      await prisma.payment.create({
        data: {
          organizationId, type: "coach_report", amountCents: session.amount_total,
          stripePaymentId: session.payment_intent, status: "paid",
        },
      });
    } else {
      // Busca o status real no Stripe em vez de assumir "active" — uma assinatura criada com
      // período de teste (trial_period_days) já nasce como "trialing", não "active", e o painel
      // Admin Geral depende desse status estar certo (senão o MRR contaria receita que não existe ainda).
      const stripeSub = await stripe.subscriptions.retrieve(session.subscription);
      await prisma.subscription.create({
        data: {
          organizationId, module: product, status: stripeSub.status, stripeSubscriptionId: session.subscription,
          currentPeriodEnd: stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000) : null,
        },
      });
      // Só os planos principais (não add-ons como whatsapp/dre) definem o "plan" da organização.
      if (["vendas", "gestao", "completo"].includes(product)) {
        await prisma.organization.update({ where: { id: organizationId }, data: { plan: product } });
      }
    }
  }

  // Mantém o status real da assinatura em dia — sem isso, "pagamento atrasado" nunca refletiria
  // a realidade (ficaria "active" para sempre, mesmo com cartão recusado ou assinatura cancelada).
  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object;
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: sub.id },
      data: { status: sub.status, currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null },
    });
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    const existing = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: sub.id } });
    if (existing) {
      await prisma.subscription.update({
        where: { id: existing.id },
        data: { status: "canceled", canceledAt: new Date() },
      });
      // Se era o plano base da organização, limpa — evita mostrar um plano que não existe mais.
      if (["vendas", "gestao", "completo"].includes(existing.module)) {
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

