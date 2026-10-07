import React, { useState, useEffect, useRef, useCallback } from "react";
import { Check, Sparkles, CreditCard, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { C, S, FONT_DISPLAY } from "../theme.js";
import { api, loadSession } from "../lib/api.js";

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
    key: "sortimento",
    name: "Gestão de Sortimento",
    price: 147,
    per: "/mês",
    note: "Vendável sozinha. Já inclusa em Vendas, Gestão e Pacote Completo.",
    features: [
      "Catálogo com preço, margem e estoque",
      "Curva ABC por giro ou faturamento",
      "Cobertura de estoque com compras e produção",
      "Tabela de preços online em PDF, com a sua logo",
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
    note: "Vendas + Gestão + Análise de Crédito + Gestão de Sortimento, com desconto. +R$39/mês por usuário adicional.",
    features: [
      "Tudo de Vendas e Gestão juntos",
      "Análise de Crédito e Gestão de Sortimento inclusos",
      "Prioridade no suporte",
    ],
    highlight: true,
  },
];

const ADDONS = [
  { key: "whatsapp", name: "Captação de Leads via WhatsApp", price: 97, requires: ["vendas", "completo"], requiresLabel: "Vendas ou Completo" },
  { key: "dre", name: "DRE Simplificado", price: 147, requires: ["gestao", "completo"], requiresLabel: "Gestão ou Completo" },
];

const LABEL = {
  coach: "Comercial Coach", credito: "Análise de Crédito", sortimento: "Gestão de Sortimento", vendas: "Ferramenta de Vendas",
  gestao: "Ferramenta de Gestão", completo: "Pacote Completo", whatsapp: "Captação de Leads via WhatsApp", dre: "DRE Simplificado",
};
// Mesmas regras do servidor (server/src/lib/stripe.js) — a tela só antecipa o que o servidor já impõe.
const INCLUDED_IN = { vendas: ["completo"], gestao: ["completo"], credito: ["vendas", "gestao", "completo"], sortimento: ["vendas", "gestao", "completo"] };
const SUPERSEDES = { completo: ["vendas", "gestao", "credito", "sortimento"], vendas: ["credito", "sortimento"], gestao: ["credito", "sortimento"] };
// Para onde levar a pessoa depois que a compra é confirmada.
const MODULE_AFTER_PURCHASE = { coach: "coach", credito: "credito", sortimento: "sortimento", vendas: "vendas", gestao: "gestao", completo: "vendas", dre: "dre" };

const ACCESS = ["active", "trialing"];
const PENDING = ["past_due", "unpaid"];

const fmtBRL = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtDate = (iso) => new Date(iso).toLocaleDateString("pt-BR");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function Planos({ goTo, billingReturn, onBillingReturnHandled }) {
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState(null);
  const [confirmUpgrade, setConfirmUpgrade] = useState(null); // plano aguardando confirmação de troca
  // Retorno do pagamento: null | { state: "confirming" | "confirmed" | "slow" | "canceled", product }
  const [purchase, setPurchase] = useState(null);
  const alive = useRef(true);
  const [highlightKey] = useState(() => {
    const v = localStorage.getItem("done_highlight_plan");
    if (v) localStorage.removeItem("done_highlight_plan"); // uso único — não deve reaparecer nas próximas visitas
    return v;
  });
  const isMaster = loadSession()?.user?.role === "master";

  const loadStatus = useCallback(async () => {
    try {
      const s = await api.billingStatus();
      if (alive.current) { setStatus(s); setLoadError(null); }
      return s;
    } catch (e) {
      // Antes, uma falha aqui fazia a tela mostrar TODOS os planos como "Assinar" — convite para
      // quem já paga assinar de novo. Agora a tela avisa e não oferece compra enquanto não souber.
      if (alive.current) setLoadError(e.message);
      return null;
    }
  }, []);

  const hasAccess = (s, product) => (s?.subscriptions || []).some((x) => x.module === product && ACCESS.includes(x.status));

  // Confirma a compra na volta do Stripe: pede ao servidor para efetivar na hora e, enquanto a
  // liberação não aparece, consulta de novo por até ~40s. Só então libera os botões da tela.
  const confirmPurchase = useCallback(async (product, sessionId) => {
    setPurchase({ state: "confirming", product });
    loadStatus(); // já mostra os planos (com os botões travados) enquanto a compra é confirmada
    if (sessionId) await api.billingConfirm(sessionId).catch(() => null);
    for (let i = 0; i < 16 && alive.current; i++) {
      const s = await loadStatus();
      if (hasAccess(s, product)) { if (alive.current) setPurchase({ state: "confirmed", product }); return; }
      await sleep(2500);
    }
    if (alive.current) setPurchase({ state: "slow", product, sessionId });
  }, [loadStatus]);

  useEffect(() => {
    alive.current = true;
    if (billingReturn?.kind === "success" && billingReturn.product) {
      confirmPurchase(billingReturn.product, billingReturn.sessionId);
    } else if (billingReturn?.kind === "cancel") {
      setPurchase({ state: "canceled" });
      loadStatus();
    } else if (billingReturn?.kind === "portal") {
      // Voltou do "Gerenciar assinatura": a mudança chega do Stripe alguns segundos depois.
      (async () => { for (let i = 0; i < 3 && alive.current; i++) { await loadStatus(); await sleep(2500); } })();
    } else {
      loadStatus();
    }
    if (billingReturn) onBillingReturnHandled?.();
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subs = status?.subscriptions || [];
  const openSubs = subs.filter((s) => ACCESS.includes(s.status) || PENDING.includes(s.status));
  const accessModules = openSubs.filter((s) => ACCESS.includes(s.status)).map((s) => s.module);
  const pendingModules = openSubs.filter((s) => PENDING.includes(s.status)).map((s) => s.module);
  const openModules = openSubs.map((s) => s.module);
  const trialingModules = openSubs.filter((s) => s.status === "trialing").map((s) => s.module);
  const hasStripeSub = openSubs.some((s) => s.stripeSubscriptionId);
  const confirming = purchase?.state === "confirming";
  const locked = !isMaster || confirming || !!busyKey; // nenhum botão de compra age nesses casos

  async function subscribe(product) {
    if (locked) return;
    setBusyKey(product);
    setError(null);
    setConfirmUpgrade(null);
    try {
      const res = await api.checkout(product);
      window.location.href = res.url;
    } catch (e) {
      setError(e.message);
      setBusyKey(null);
      loadStatus(); // o servidor pode ter recusado por já existir assinatura — atualiza a tela
    }
  }

  async function openPortal(module) {
    if (busyKey) return;
    setBusyKey("portal");
    setError(null);
    try {
      const res = await api.billingPortal(module);
      window.location.href = res.url;
    } catch (e) {
      setError(e.message);
      setBusyKey(null);
    }
  }

  if (status === null && loadError) {
    return (
      <div style={S.moduleCol}>
        <div>
          <div style={S.eyebrow}>PLANOS</div>
          <h1 style={S.h1}>Cresça no seu ritmo</h1>
        </div>
        <div style={{ background: C.dangerSoft, color: C.danger, borderRadius: 10, padding: "14px 16px", fontSize: 13, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <AlertTriangle size={16} />
          <span style={{ flex: 1, minWidth: 200 }}>Não foi possível carregar a situação da sua assinatura. {loadError}</span>
          <button style={{ ...S.ghostBtn, background: "#fff" }} onClick={loadStatus}><RefreshCw size={13} /> Tentar novamente</button>
        </div>
      </div>
    );
  }
  if (status === null) {
    // Voltando do pagamento, a pessoa precisa ver que a compra está sendo confirmada — não um "Carregando..." genérico.
    if (confirming) {
      return (
        <div style={S.moduleCol}>
          <div>
            <div style={S.eyebrow}>PLANOS</div>
            <h1 style={S.h1}>Cresça no seu ritmo</h1>
          </div>
          <div data-testid="purchase-confirming" style={{ background: C.goldSoft, color: "#8A6423", borderRadius: 10, padding: "14px 16px", fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
            <Loader2 size={16} className="done-spin" />
            <span><b>Confirmando seu pagamento...</b> Isso leva alguns segundos. Não é preciso assinar de novo.</span>
          </div>
        </div>
      );
    }
    return <div style={{ color: C.muted, fontSize: 13 }}>Carregando...</div>;
  }

  return (
    <div style={S.moduleCol}>
      <div>
        <div style={S.eyebrow}>PLANOS</div>
        <h1 style={S.h1}>Cresça no seu ritmo</h1>
        <p style={S.lead}>Sem contrato de fidelidade — cancele quando quiser.</p>
      </div>

      {/* -------- Retorno do pagamento -------- */}
      {purchase?.state === "confirming" && (
        <div data-testid="purchase-confirming" style={{ background: C.goldSoft, color: "#8A6423", borderRadius: 10, padding: "14px 16px", fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
          <Loader2 size={16} className="done-spin" />
          <span><b>Confirmando seu pagamento...</b> Isso leva alguns segundos. Não é preciso assinar de novo.</span>
        </div>
      )}
      {purchase?.state === "confirmed" && (
        <div data-testid="purchase-confirmed" style={{ background: C.sageSoft, color: C.sage, borderRadius: 10, padding: "14px 16px", fontSize: 13, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Check size={16} />
          <span style={{ flex: 1, minWidth: 200 }}><b>Pagamento confirmado.</b> {LABEL[purchase.product] || "Seu plano"} já está liberado.</span>
          {MODULE_AFTER_PURCHASE[purchase.product] && goTo && (
            <button style={{ ...S.primaryBtnSm }} onClick={() => goTo(MODULE_AFTER_PURCHASE[purchase.product])}>
              {purchase.product === "coach" ? "Abrir meu relatório completo →" : "Começar a usar →"}
            </button>
          )}
        </div>
      )}
      {purchase?.state === "slow" && (
        <div data-testid="purchase-slow" style={{ background: C.goldSoft, color: "#8A6423", borderRadius: 10, padding: "14px 16px", fontSize: 13, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <AlertTriangle size={16} />
          <span style={{ flex: 1, minWidth: 200 }}>
            <b>A liberação está demorando mais que o normal.</b> Se o pagamento foi concluído, não assine de novo — clique em verificar. Se continuar assim, fale com o suporte pelo chat.
          </span>
          <button style={{ ...S.ghostBtn, background: "#fff" }} onClick={() => confirmPurchase(purchase.product, purchase.sessionId)}><RefreshCw size={13} /> Verificar de novo</button>
        </div>
      )}
      {purchase?.state === "canceled" && (
        <div data-testid="purchase-canceled" style={{ background: C.paper, border: `1px solid ${C.border}`, color: C.inkSoft, borderRadius: 10, padding: "12px 16px", fontSize: 13 }}>
          O pagamento não foi concluído — nenhuma cobrança foi feita. Você pode tentar de novo quando quiser.
        </div>
      )}

      {!isMaster && (
        <div style={{ background: C.paper, border: `1px solid ${C.border}`, color: C.inkSoft, borderRadius: 10, padding: "12px 16px", fontSize: 13 }}>
          Só o usuário Master da sua empresa pode contratar ou alterar planos.
        </div>
      )}

      {/* -------- Assinaturas atuais + gerenciar -------- */}
      {openSubs.length > 0 && (
        <div data-testid="current-subs" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, color: C.ink }}>Sua assinatura</div>
            {isMaster && hasStripeSub && (
              <button data-testid="manage-subscription" style={{ ...S.ghostBtn, opacity: busyKey ? 0.6 : 1 }} disabled={!!busyKey} onClick={() => openPortal(pendingModules[0] || null)}>
                <CreditCard size={14} /> {busyKey === "portal" ? "Abrindo..." : "Gerenciar assinatura e pagamento"}
              </button>
            )}
          </div>
          {openSubs.map((s) => {
            const pending = PENDING.includes(s.status);
            return (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, fontSize: 13, color: C.inkSoft, flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: C.ink }}>
                  {pending ? <AlertTriangle size={14} color={C.danger} /> : <Check size={14} color={C.sage} />} {LABEL[s.module] || s.module}
                </span>
                <span style={{ fontSize: 12, color: pending ? C.danger : s.cancelAtPeriodEnd ? "#8A6423" : C.muted, fontWeight: pending || s.cancelAtPeriodEnd ? 700 : 500 }}>
                  {pending
                    ? "Pagamento pendente — atualize o cartão para liberar o acesso"
                    : s.cancelAtPeriodEnd
                      ? `Cancelamento agendado${s.currentPeriodEnd ? ` — acesso até ${fmtDate(s.currentPeriodEnd)}` : ""}`
                      : s.status === "trialing"
                        ? `Em período de teste${s.currentPeriodEnd ? ` até ${fmtDate(s.currentPeriodEnd)}` : ""}`
                        : !s.stripeSubscriptionId
                          ? "Liberado pela equipe D.O.N.E"
                          : s.currentPeriodEnd ? `Ativo — próxima cobrança em ${fmtDate(s.currentPeriodEnd)}` : "Ativo"}
                </span>
              </div>
            );
          })}
          {isMaster && hasStripeSub && (
            <div style={{ fontSize: 11.5, color: C.muted }}>
              Em "Gerenciar assinatura e pagamento" você troca o cartão, vê as faturas e cancela. Ao cancelar, o acesso continua até o fim do período já pago.
            </div>
          )}
        </div>
      )}

      {error && <div data-testid="planos-error" style={{ fontSize: 13, color: C.danger, background: C.dangerSoft, borderRadius: 10, padding: "10px 14px" }}>{error}</div>}

      <div className="done-metrics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        {PLANS.map((p) => {
          const isCurrent = accessModules.includes(p.key);
          const isPending = pendingModules.includes(p.key);
          const isTrialing = trialingModules.includes(p.key);
          const coveredBy = (INCLUDED_IN[p.key] || []).find((m) => openModules.includes(m));
          const replaces = (SUPERSEDES[p.key] || []).filter((m) => openModules.includes(m));
          const isSuggested = highlightKey === p.key && !isCurrent && !coveredBy;
          const asking = confirmUpgrade === p.key;

          let label = "Assinar", disabled = locked, action = () => subscribe(p.key), kind = "buy";
          if (isCurrent) { label = isTrialing ? "Em período de teste" : "Plano atual"; disabled = true; kind = "current"; }
          else if (isPending) { label = "Pagamento pendente — atualizar cartão"; action = () => openPortal(p.key); disabled = !isMaster || !!busyKey; kind = "pending"; }
          else if (coveredBy) { label = `Já incluso no seu plano (${LABEL[coveredBy]})`; disabled = true; kind = "included"; }
          else if (replaces.length > 0) { label = "Mudar para este plano"; action = () => setConfirmUpgrade(p.key); kind = "upgrade"; }
          if (busyKey === p.key) label = "Redirecionando...";

          return (
            <div key={p.key} data-plan={p.key} data-state={kind} style={{
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

              {asking ? (
                <div data-testid="upgrade-confirm" style={{ background: p.highlight ? "rgba(255,255,255,0.08)" : C.paper, border: `1px solid ${p.highlight ? "rgba(255,255,255,0.18)" : C.border}`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 12, lineHeight: 1.5, color: p.highlight ? "#E3E5EA" : C.inkSoft }}>
                    Ao assinar <b>{p.name}</b>, {replaces.length === 1 ? "sua assinatura de" : "suas assinaturas de"} <b>{replaces.map((m) => LABEL[m]).join(" e ")}</b> {replaces.length === 1 ? "é cancelada" : "são canceladas"} automaticamente — você não paga os dois. O valor já pago e ainda não usado volta como crédito.
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button disabled={locked} onClick={() => subscribe(p.key)} style={{ ...S.primaryBtnSm, background: C.gold, color: C.ink, opacity: locked ? 0.6 : 1 }}>
                      {busyKey === p.key ? "Redirecionando..." : "Confirmar e ir para o pagamento"}
                    </button>
                    <button disabled={!!busyKey} onClick={() => setConfirmUpgrade(null)} style={{ ...S.ghostBtn, padding: "8px 14px", fontSize: 12.5, color: p.highlight ? "#C7CAD4" : C.inkSoft, borderColor: p.highlight ? "rgba(255,255,255,0.25)" : C.border }}>
                      Agora não
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  disabled={disabled}
                  onClick={action}
                  style={kind === "current" || kind === "included"
                    ? { ...S.ghostBtn, justifyContent: "center", opacity: 0.7, cursor: "default", ...(p.highlight ? { color: "#C7CAD4", borderColor: "rgba(255,255,255,0.25)" } : {}) }
                    : kind === "pending"
                      ? { ...S.primaryBtn, justifyContent: "center", background: C.danger, color: "#fff", opacity: disabled ? 0.6 : 1 }
                      : p.highlight
                        ? { ...S.primaryBtn, justifyContent: "center", background: C.gold, color: C.ink, opacity: disabled ? 0.6 : 1, cursor: disabled ? "default" : "pointer" }
                        : { ...S.primaryBtn, justifyContent: "center", opacity: disabled ? 0.6 : 1, cursor: disabled ? "default" : "pointer" }}
                >
                  {label}
                </button>
              )}
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
            const isCurrent = accessModules.includes(a.key);
            const isPending = pendingModules.includes(a.key);
            const eligible = a.requires.some((m) => accessModules.includes(m));
            const off = isCurrent || !eligible || locked;
            return (
              <div key={a.key} data-plan={a.key} style={S.qCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>{a.name}</div>
                  <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: C.gold }}>{fmtBRL(a.price)}<span style={{ fontFamily: "Inter", fontSize: 11, color: C.muted }}>/mês</span></div>
                </div>
                <div style={{ fontSize: 11.5, color: C.muted }}>Exige assinatura ativa de {a.requiresLabel}.</div>
                {isPending ? (
                  <button disabled={!isMaster || !!busyKey} onClick={() => openPortal(a.key)} style={{ ...S.ghostBtn, justifyContent: "center", color: C.danger, borderColor: C.danger }}>
                    Pagamento pendente — atualizar cartão
                  </button>
                ) : (
                  <button
                    disabled={off}
                    onClick={() => subscribe(a.key)}
                    style={{ ...S.ghostBtn, justifyContent: "center", opacity: off ? 0.5 : 1, cursor: off ? "default" : "pointer" }}
                  >
                    {isCurrent ? "Ativo" : !eligible ? `Exige ${a.requiresLabel}` : busyKey === a.key ? "Redirecionando..." : "Assinar add-on"}
                  </button>
                )}
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
