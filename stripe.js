import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("[stripe] STRIPE_SECRET_KEY not set — billing routes will fail until it is.");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: "2024-06-20",
});

// Prices in BRL cents, matching the pricing defined for D.O.N.E.
export const PRICES = {
  coach_report: { label: "Relatório completo — Comercial Coach", amountCents: 14700 },
  vendas: { label: "Ferramenta de Vendas", amountCents: 19700, extraUserCents: 2900 },
  gestao: { label: "Ferramenta de Gestão", amountCents: 24700, extraUserCents: 1900 },
  completo: { label: "Pacote Completo (Vendas + Gestão)", amountCents: 39700, extraUserCents: 3900 },
};
