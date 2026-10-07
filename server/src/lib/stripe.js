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
  completo: { label: "Pacote Completo (Vendas + Gestão)", amountCents: 39700, extraUserCents: 3900 },
  // Vendável sozinha (sem precisar de Vendas/Gestão/Completo) — mesmo preço do add-on de DRE,
  // por ter escopo/complexidade parecidos.
  credito: { label: "Análise de Crédito", amountCents: 14700 },
  // Vendável sozinho (catálogo, curva ABC, cobertura e tabela de preços online) — também incluso em Vendas/Gestão/Completo.
  sortimento: { label: "Gestão de Sortimento", amountCents: 14700 },
  // Add-ons pagos à parte — exigem assinatura ativa de Vendas, Gestão ou Completo (ver requireAddon).
  whatsapp: { label: "Add-on: Captação de Leads via WhatsApp", amountCents: 9700 },
  dre: { label: "Add-on: DRE Simplificado / Fluxo de Caixa", amountCents: 14700 },
};

// ---------------------------------------------------------------------------------------------
// Relação entre os produtos — usada para impedir cobrança em dobro (ver routes/billing.js).
// Precisa andar junto com as listas de requirePlan() de cada módulo: se Vendas dá acesso à
// Análise de Crédito e ao Sortimento, não faz sentido deixar o cliente pagar os dois à parte.
// ---------------------------------------------------------------------------------------------

// Produto → planos que já INCLUEM esse produto (quem tem um deles não precisa comprar).
export const INCLUDED_IN = {
  vendas: ["completo"],
  gestao: ["completo"],
  credito: ["vendas", "gestao", "completo"],
  sortimento: ["vendas", "gestao", "completo"],
};

// Produto → assinaturas que ele SUBSTITUI. Ao assinar um plano maior, as menores que ele engloba
// são canceladas automaticamente (com crédito proporcional), em vez de continuarem sendo cobradas.
export const SUPERSEDES = {
  completo: ["vendas", "gestao", "credito", "sortimento"],
  vendas: ["credito", "sortimento"],
  gestao: ["credito", "sortimento"],
};

// Add-on → planos base exigidos (mesma regra de requireAddon e do webhook do WhatsApp).
export const ADDON_REQUIRES = {
  whatsapp: ["vendas", "completo"],
  dre: ["gestao", "completo"],
};
