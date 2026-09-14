import React, { useState, useEffect } from "react";
import { Check, Sparkles } from "lucide-react";
import { C, S, FONT_DISPLAY } from "../theme.js";
import { api } from "../lib/api.js";

const PLANS = [
  {
    key: "credito",
    name: "Análise de Crédito",
    price: 147,
    per: "/mês",
    note: "Vendável sozinha — não exige nenhum outro plano.",
    features: [
      "Consulta de CNPJ direto na Receita Federal",
      "Extração de balanço/DRE em PDF por IA",
      "Limite de crédito sugerido, com o motivo",
      "Monitoramento contínuo da situação cadastral",
    ],
  },
  {
    key: "vendas",
    name: "Ferramenta de Vendas",
    price: 197,
    per: "/mês",
    note: "Master + 2 vendedores inclusos. +R$29/mês por usuário adicional.",
    features: [
      "Pipeline completo, do lead ao faturamento",
      "Forecast de vendas ponderado",
      "Follow-up automático (WhatsApp/SMS)",
      "Metas por vendedor e métricas de conversão",
    ],
  },
  {
    key: "gestao",
    name: "Ferramenta de Gestão",
    price: 247,
    per: "/mês",
    note: "Master + 2 usuários inclusos. +R$19/mês por usuário adicional.",
    features: [
      "Upload inteligente de planilha (qualquer formato)",
      "Alertas automáticos de estoque",
      "Cruzamento Vendas × Margem",
      "Sugestões automáticas de ação",
    ],
  },
  {
    key: "completo",
    name: "Pacote Completo",
    price: 477,
    per: "/mês",
    note: "Vendas + Gestão + Análise de Crédito, com desconto. +R$39/mês por usuário adicional.",
    features: [
      "Tudo de Vendas e Gestão juntos",
      "Análise de Crédito inclusa",
      "Prioridade no suporte",
    ],
    highlight: true,
  },
];

const ADDONS = [
  { key: "whatsapp", name: "Captação de Leads via WhatsApp", price: 97, requires: ["vendas", "completo"], requiresLabel: "Vendas ou Completo" },
  { key: "dre", name: "DRE Simplificado", price: 147, requires: ["gestao", "completo"], requiresLabel: "Gestão ou Completo" },
];

const fmtBRL = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function Planos() {
  const [status, setStatus] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState(null);
  const [highlightKey] = useState(() => {
    const v = localStorage.getItem("done_highlight_plan");
    if (v) localStorage.removeItem("done_highlight_plan"); // uso único — não deve reaparecer nas próximas visitas
    return v;
  });

  useEffect(() => {
    api.billingStatus().then(setStatus).catch(() => setStatus({ subscriptions: [] }));
  }, []);

  const activeModules = (status?.subscriptions || [])
    .filter((s) => s.status === "active" || s.status === "trialing")
    .map((s) => s.module);
  const trialingModules = (status?.subscriptions || []).filter((s) => s.status === "trialing").map((s) => s.module);
  const currentBase = ["completo", "gestao", "vendas", "credito"].find((m) => activeModules.includes(m)) || null;

  async function subscribe(product) {
    setBusyKey(product);
    setError(null);
    try {
      const res = await api.checkout(product);
      window.location.href = res.url;
    } catch (e) {
      setError(e.message);
      setBusyKey(null);
    }
  }

  return (
    <div style={S.moduleCol}>
      <div>
        <div style={S.eyebrow}>PLANOS</div>
        <h1 style={S.h1}>Cresça no seu ritmo</h1>
        <p style={S.lead}>Sem contrato de fidelidade — cancele quando quiser.</p>
      </div>

      {currentBase && (
        <div style={{ background: C.sageSoft, border: `1px solid transparent`, borderRadius: 10, padding: "12px 16px", fontSize: 13, color: C.sage, display: "flex", alignItems: "center", gap: 8 }}>
          <Check size={16} />
          Seu plano atual: <b>{PLANS.find((p) => p.key === currentBase)?.name}</b>
          {trialingModules.includes(currentBase) && " (em período de teste)"}
        </div>
      )}
      {error && <div style={{ fontSize: 13, color: C.danger }}>{error}</div>}

      <div className="done-metrics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        {PLANS.map((p) => {
          const isCurrent = activeModules.includes(p.key);
          const isTrialing = trialingModules.includes(p.key);
          const isSuggested = highlightKey === p.key && !isCurrent;
          return (
            <div key={p.key} style={{
              background: p.highlight ? C.ink : C.card,
              border: isSuggested ? `2px solid ${C.gold}` : `1px solid ${p.highlight ? C.ink : C.border}`,
              borderRadius: 14, padding: 24, display: "flex", flexDirection: "column", gap: 14,
              position: "relative",
            }}>
              {p.highlight && (
                <span style={{ position: "absolute", top: -12, left: 20, background: C.gold, color: C.ink, fontSize: 10.5, fontWeight: 700, padding: "4px 12px", borderRadius: 99, letterSpacing: "0.03em" }}>
                  MAIS ESCOLHIDO
                </span>
              )}
              {isSuggested && !p.highlight && (
                <span style={{ position: "absolute", top: -12, left: 20, background: C.gold, color: C.ink, fontSize: 10.5, fontWeight: 700, padding: "4px 12px", borderRadius: 99, letterSpacing: "0.03em" }}>
                  SELECIONADO NO SITE
                </span>
              )}
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, color: p.highlight ? "#fff" : C.ink, marginTop: (p.highlight || isSuggested) ? 8 : 0 }}>{p.name}</div>
              <div>
                <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 32, color: p.highlight ? C.gold : C.ink }}>{fmtBRL(p.price)}</span>
                <span style={{ fontSize: 13, color: p.highlight ? "#9BA0AC" : C.muted }}> {p.per}</span>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                {p.features.map((f) => (
                  <li key={f} style={{ display: "flex", gap: 8, fontSize: 12.5, color: p.highlight ? "#C7CAD4" : C.inkSoft, alignItems: "flex-start" }}>
                    <Check size={14} color={C.gold} style={{ flexShrink: 0, marginTop: 2 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <div style={{ fontSize: 11, color: p.highlight ? "#9BA0AC" : C.muted }}>{p.note}</div>
              <button
                disabled={isCurrent || busyKey === p.key}
                onClick={() => subscribe(p.key)}
                style={isCurrent
                  ? { ...S.ghostBtn, justifyContent: "center", opacity: 0.7, cursor: "default" }
                  : p.highlight
                    ? { ...S.primaryBtn, justifyContent: "center", background: C.gold, color: C.ink }
                    : { ...S.primaryBtn, justifyContent: "center" }}
              >
                {isCurrent ? (isTrialing ? "Em período de teste" : "Plano atual") : busyKey === p.key ? "Redirecionando..." : "Assinar"}
              </button>
            </div>
          );
        })}
      </div>

      <div>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: C.ink, margin: "8px 0 12px", display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={16} color={C.gold} /> Add-ons
        </div>
        <div className="done-metrics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {ADDONS.map((a) => {
            const isCurrent = activeModules.includes(a.key);
            const eligible = a.requires.some((m) => activeModules.includes(m));
            return (
              <div key={a.key} style={S.qCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>{a.name}</div>
                  <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: C.gold }}>{fmtBRL(a.price)}<span style={{ fontFamily: "Inter", fontSize: 11, color: C.muted }}>/mês</span></div>
                </div>
                <div style={{ fontSize: 11.5, color: C.muted }}>Exige assinatura ativa de {a.requiresLabel}.</div>
                <button
                  disabled={isCurrent || !eligible || busyKey === a.key}
                  onClick={() => subscribe(a.key)}
                  style={{ ...S.ghostBtn, justifyContent: "center", opacity: isCurrent || !eligible ? 0.5 : 1, cursor: isCurrent || !eligible ? "default" : "pointer" }}
                >
                  {isCurrent ? "Ativo" : !eligible ? `Exige ${a.requiresLabel}` : busyKey === a.key ? "Redirecionando..." : "Assinar add-on"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ fontSize: 12, color: C.muted }}>
        O Comercial Coach (relatório completo + reavaliação a cada 3 meses) é assinado direto na tela do próprio Comercial Coach, não aqui.
      </div>
    </div>
  );
}
