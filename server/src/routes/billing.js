import { Router } from "express";
import express from "express";
import { prisma } from "../lib/prisma.js";
import { stripe, PRICES } from "../lib/stripe.js";
import { requireMaster } from "../middleware/auth.js";

const router = Router();

// Apenas o Master assina/compra módulos para a organização.
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
      await prisma.subscription.create({
        data: { organizationId, module: product, status: "active", stripeSubscriptionId: session.subscription },
      });
      // Só os planos principais (não add-ons como whatsapp/dre) definem o "plan" da organização.
      if (["vendas", "gestao", "completo"].includes(product)) {
        await prisma.organization.update({ where: { id: organizationId }, data: { plan: product } });
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

