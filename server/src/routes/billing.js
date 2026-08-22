import { Router } from "express";
import express from "express";
import { prisma } from "../lib/prisma.js";
import { stripe, PRICES } from "../lib/stripe.js";

const router = Router();

// Creates a Stripe Checkout session for either the one-off report or a module subscription.
router.post("/checkout", async (req, res) => {
  const { product } = req.body; // "coach_report" | "vendas" | "gestao" | "completo"
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
    metadata: { userId: req.userId, product },
    success_url: `${process.env.CLIENT_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.CLIENT_URL}/billing/cancel`,
  });

  res.json({ url: session.url });
});

// Stripe webhook — must receive the RAW body, so it's mounted with express.raw() in index.js.
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
    const { userId, product } = session.metadata || {};
    if (!userId || !product) return res.json({ received: true });

    if (product === "coach_report") {
      await prisma.payment.create({
        data: {
          userId, type: "coach_report", amountCents: session.amount_total,
          stripePaymentId: session.payment_intent, status: "paid",
        },
      });
    } else {
      await prisma.subscription.create({
        data: {
          userId, module: product, status: "active",
          stripeSubscriptionId: session.subscription,
        },
      });
    }
  }

  res.json({ received: true });
});

router.get("/status", async (req, res) => {
  const [payments, subscriptions] = await Promise.all([
    prisma.payment.findMany({ where: { userId: req.userId } }),
    prisma.subscription.findMany({ where: { userId: req.userId } }),
  ]);
  res.json({ payments, subscriptions });
});

export default router;

