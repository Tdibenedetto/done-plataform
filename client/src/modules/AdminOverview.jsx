import React, { useState, useEffect } from "react";
import { Users, AlertTriangle } from "lucide-react";
import { C, S, FONT_DISPLAY } from "../theme.js";
import { api } from "../lib/api.js";

const fmtBRL = (cents) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function fmtRelative(iso) {
  if (!iso) return "nunca acessou";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days < 1) return "hoje";
  if (days === 1) return "há 1 dia";
  return `há ${days} dias`;
}
function statusColor(iso) {
  if (!iso) return C.danger;
  const days = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (days < 3) return C.sage;
  if (days < 14) return C.gold;
  return C.danger;
}

const PLAN_LABEL = { vendas: "Ferramenta de Vendas", gestao: "Ferramenta de Gestão", completo: "Pacote Completo" };

export default function AdminOverview() {
  const [overview, setOverview] = useState(null);
  const [clients, setClients] = useState(null);
  const [risk, setRisk] = useState(null);
  const [filter, setFilter] = useState("todos");
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [ov, cl, rk] = await Promise.all([api.adminOverview(), api.adminClients(), api.adminActivationRisk()]);
        setOverview(ov);
        setClients(cl.clients);
        setRisk(rk.risk);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);

  if (error) return <div style={{ color: C.danger, fontSize: 13 }}>{error}</div>;
  if (!overview || !clients || !risk) return <div style={{ color: C.muted, fontSize: 13 }}>Carregando...</div>;

  const filtered = clients.filter((c) => {
    if (filter === "atrasado") return c.paymentStatus === "past_due";
    if (filter === "sem-login") return !c.lastAccess || (Date.now() - new Date(c.lastAccess).getTime()) / 86400000 > 15;
    return true;
  });

  return (
    <div style={S.moduleCol}>
      <div>
        <div style={S.eyebrow}>ADMIN GERAL</div>
        <h1 style={S.h1}>Visão Geral da D.O.N.E</h1>
        <p style={S.lead}>Todos os clientes, assinaturas e uso da plataforma — em um só lugar.</p>
      </div>

      <div className="done-metrics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <StatCard label="MRR Total" value={fmtBRL(overview.mrrCents)} color={C.gold} />
        <StatCard label="Clientes Ativos" value={overview.activeClients} sub={`${clients.filter((c) => c.plan === "completo").length} no Pacote Completo`} />
        <StatCard label="Churn do Mês" value={overview.churnThisMonth} color={C.danger} sub={`${overview.churnRatePct}% de churn`} />
        <StatCard label="Ticket Médio" value={fmtBRL(overview.avgTicketCents)} color={C.sage} sub="por cliente / mês" />
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, color: C.ink }}>Clientes</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[["todos", "Todos"], ["atrasado", "Pagamento atrasado"], ["sem-login", "Sem login 15d+"]].map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)}
                style={{ fontSize: 11, fontWeight: 600, color: filter === k ? "#fff" : C.muted, background: filter === k ? C.ink : C.card, border: `1px solid ${filter === k ? C.ink : C.border}`, padding: "6px 12px", borderRadius: 99, cursor: "pointer" }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr>
                {["Empresa", "Plano", "Usuários", "Add-ons", "Cliente desde", "MRR", "Pagamento", "Último acesso"].map((h) => (
                  <th key={h} style={{ textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: "0.03em", color: C.muted, textTransform: "uppercase", padding: "12px 16px", borderBottom: `1px solid ${C.border}`, background: "#FBFAF7", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.organizationId}>
                  <td style={td}>
                    <div style={{ fontWeight: 700, color: C.ink }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>Master: {c.masterName || "—"}</div>
                  </td>
                  <td style={td}>{PLAN_LABEL[c.plan] || "Sem plano"}</td>
                  <td style={td}>{c.usersActive} / {c.usersMax}</td>
                  <td style={td}>
                    {c.addons.length
                      ? c.addons.map((a) => (
                          <span key={a} style={{ fontSize: 10, fontWeight: 700, background: C.goldSoft, color: "#8A6423", padding: "3px 9px", borderRadius: 99, marginRight: 4, display: "inline-block" }}>{a}</span>
                        ))
                      : "—"}
                  </td>
                  <td style={td}>{new Date(c.memberSince).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}</td>
                  <td style={{ ...td, fontFamily: FONT_DISPLAY, fontWeight: 700, color: C.ink }}>{fmtBRL(c.mrrCents)}</td>
                  <td style={td}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 9px", borderRadius: 99, background: c.paymentStatus === "past_due" ? C.dangerSoft : C.sageSoft, color: c.paymentStatus === "past_due" ? C.danger : C.sage }}>
                      {c.paymentStatus === "past_due" ? "Atrasado" : c.paymentStatus === "active" ? "Em dia" : "—"}
                    </span>
                  </td>
                  <td style={td}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor(c.lastAccess), display: "inline-block", marginRight: 6 }} />
                    {fmtRelative(c.lastAccess)}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: C.muted }}>Nenhum cliente nesse filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="done-two-col-grid" style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 16 }}>
        <div style={S.qCard}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14.5, color: C.ink }}>
            <AlertTriangle size={15} color={C.danger} /> Risco de ativação
          </div>
          {risk.length === 0 && <div style={{ fontSize: 12.5, color: C.muted }}>Nenhum cliente em risco no momento.</div>}
          {risk.map((r) => (
            <div key={r.organizationId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{r.name}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{r.reason}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, background: C.dangerSoft, color: C.danger, padding: "4px 10px", borderRadius: 99, whiteSpace: "nowrap" }}>Agir agora</span>
            </div>
          ))}
        </div>

        <div style={S.qCard}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14.5, color: C.ink }}>
            <Users size={15} color={C.gold} /> Receita por módulo
          </div>
          {overview.revenueByModule.map((m) => {
            const max = overview.revenueByModule[0]?.cents || 1;
            return (
              <div key={m.module} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
                <div style={{ width: 150, fontSize: 12, fontWeight: 600, color: C.ink, flexShrink: 0 }}>{m.label}</div>
                <div style={{ flex: 1, height: 8, background: "#EFEDE6", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.max(6, (m.cents / max) * 100)}%`, background: C.gold, borderRadius: 99 }} />
                </div>
                <div style={{ width: 70, textAlign: "right", fontSize: 11.5, fontWeight: 700, color: C.ink }}>{fmtBRL(m.cents)}</div>
              </div>
            );
          })}
          {overview.revenueByModule.length === 0 && <div style={{ fontSize: 12.5, color: C.muted }}>Nenhuma receita recorrente ainda.</div>}
        </div>
      </div>
    </div>
  );
}

const td = { padding: "12px 16px", borderBottom: `1px solid ${C.border}`, color: "#2A2E3A", whiteSpace: "nowrap" };

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.02em", color: C.muted, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 30, fontWeight: 700, color: color || C.ink, marginTop: 8 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
