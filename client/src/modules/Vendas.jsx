import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Trash2, UserPlus, X, Mail, MessageSquare, Calendar, Filter } from "lucide-react";
import { C, S } from "../theme.js";
import { api, loadSession } from "../lib/api.js";

const STAGES = ["Novo Lead", "Qualificação", "Proposta", "Negociação", "Fechado", "Perdido"];
const fmtBRL = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const currentMonth = () => new Date().toISOString().slice(0, 7); // "2026-08"

export default function FerramentaVendas() {
  const session = loadSession();
  const isMaster = session?.user?.role === "master";

  const [leads, setLeads] = useState(null);
  const [goals, setGoals] = useState([]);
  const [team, setTeam] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [draft, setDraft] = useState({ name: "", value: "", assignedUserId: "", expectedCloseDate: "" });
  const [lostFor, setLostFor] = useState(null); // lead sendo marcado como perdido
  const [lostReason, setLostReason] = useState("");
  const [openLead, setOpenLead] = useState(null); // lead com o painel de notas aberto
  const [filters, setFilters] = useState({ assignedUserId: "", minValue: "", maxValue: "" });

  const reload = useCallback(async () => {
    const calls = [api.leadsList(), api.goalsList(), api.teamGet()];
    const [ls, gs, tm] = await Promise.all(calls);
    setLeads(ls);
    setGoals(gs);
    setTeam(tm);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  if (leads === null || team === null) return <div style={{ color: C.muted, fontSize: 13 }}>Carregando...</div>;

  async function addLead() {
    if (!draft.name.trim()) return;
    await api.leadCreate({
      name: draft.name,
      value: Number(draft.value) || 0,
      assignedUserId: draft.assignedUserId || undefined,
      expectedCloseDate: draft.expectedCloseDate || undefined,
    });
    setDraft({ name: "", value: "", assignedUserId: "", expectedCloseDate: "" });
    setShowForm(false);
    reload();
  }
  async function moveLead(lead, dir) {
    const idx = STAGES.indexOf(lead.stage);
    const next = STAGES[Math.min(Math.max(idx + dir, 0), STAGES.length - 2)]; // não avança automaticamente para "Perdido"
    await api.leadUpdate(lead.id, { stage: next });
    reload();
  }
  async function markLost(lead) {
    setLostFor(null);
    await api.leadUpdate(lead.id, { stage: "Perdido", lostReason });
    setLostReason("");
    reload();
  }
  async function removeLead(id) { await api.leadDelete(id); reload(); }
  async function setGoal(userId, value) {
    await api.goalSet({ userId, target: Number(value) || 0, month: currentMonth() });
    reload();
  }

  const activeStages = STAGES.filter((s) => s !== "Perdido");
  const totalClosed = leads.filter((l) => l.stage === "Fechado").reduce((s, l) => s + l.value, 0);
  const monthGoals = goals.filter((g) => g.month === currentMonth());
  const overallTarget = monthGoals.reduce((s, g) => s + g.target, 0) || 1;
  const pct = Math.min(100, Math.round((totalClosed / overallTarget) * 100));

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (filters.assignedUserId && l.assignedUser?.id !== filters.assignedUserId) return false;
      if (filters.minValue && l.value < Number(filters.minValue)) return false;
      if (filters.maxValue && l.value > Number(filters.maxValue)) return false;
      return true;
    });
  }, [leads, filters]);
  const filtersActive = filters.assignedUserId || filters.minValue || filters.maxValue;

  function isOverdue(l) {
    return l.expectedCloseDate && l.stage !== "Fechado" && l.stage !== "Perdido" && new Date(l.expectedCloseDate) < new Date();
  }
  function fmtShortDate(iso) {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }

  return (
    <div style={S.moduleCol}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 24, margin: 0 }}>Ferramenta de Vendas</h2>
          <p style={{ fontSize: 14, color: C.inkSoft, margin: "4px 0 0" }}>
            {isMaster ? "Pipeline do time — leads, metas e equipe." : "Seu pipeline e suas metas."}
          </p>
        </div>
        {isMaster && (
          <button style={S.ghostBtn} onClick={() => setShowTeam((s) => !s)}><UserPlus size={14} /> Equipe</button>
        )}
      </div>

      {isMaster && showTeam && <TeamPanel team={team} onChange={reload} />}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, display: "flex", alignItems: "center", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: C.muted }}>Fechado no mês</div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 19 }}>
            {fmtBRL(totalClosed)} <span style={{ fontWeight: 400, fontSize: 13, color: C.muted }}>de {fmtBRL(overallTarget)}</span>
          </div>
        </div>
        <div style={{ flex: 1, height: 8, background: C.border, borderRadius: 999, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: C.sage, borderRadius: 999 }} />
        </div>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 15, color: C.sage }}>{pct}%</div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 14.5 }}>Pipeline</div>
        <button style={S.primaryBtnSm} onClick={() => setShowForm((s) => !s)}><Plus size={14} /> Novo lead</button>
      </div>

      {showForm && (
        <div style={{
