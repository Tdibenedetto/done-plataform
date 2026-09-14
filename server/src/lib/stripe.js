import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("[stripe] STRIPE_SECRET_KEY not set — billing routes will fail until it is.");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: "2024-06-20",
});

// Prices in BRL cents, matching the pricing defined for D.O.N.E.
// `intervalCount` é opcional — quando ausente, cobrança mensal (padrão do Stripe usado aqui).
export const PRICES = {
  // Comercial Coach: era avulso (pagamento único, R$147); virou assinatura trimestral —
  // reavaliação automática a cada 3 meses, com desconto frente ao preço avulso antigo.
  coach: { label: "Comercial Coach (trimestral)", amountCents: 12700, intervalCount: 3 },
  vendas: { label: "Ferramenta de Vendas", amountCents: 19700, extraUserCents: 2900 },
  gestao: { label: "Ferramenta de Gestão", amountCents: 24700, extraUserCents: 1900 },
  completo: { label: "Pacote Completo (Vendas + Gestão)", amountCents: 47700, extraUserCents: 3900 },
  // Vendável sozinha (sem precisar de Vendas/Gestão/Completo) — mesmo preço do add-on de DRE,
  // por ter escopo/complexidade parecidos.
  credito: { label: "Análise de Crédito", amountCents: 14700 },
  // Add-ons pagos à parte — exigem assinatura ativa de Vendas, Gestão ou Completo (ver requireAddon).
  whatsapp: { label: "Add-on: Captação de Leads via WhatsApp", amountCents: 9700 },
  dre: { label: "Add-on: DRE Simplificado / Fluxo de Caixa", amountCents: 14700 },
};

