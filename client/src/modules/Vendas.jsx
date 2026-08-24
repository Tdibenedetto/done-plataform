import React, { useState, useEffect, useCallback, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Plus, Trash2, UserPlus, X, Mail, MessageSquare, Calendar, Filter, TrendingUp } from "lucide-react";
import { C, S } from "../theme.js";
import { api, loadSession } from "../lib/api.js";

const STAGES = ["Novo Lead", "Qualificação", "Proposta", "Negociação", "Fechado", "Perdido"];
const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
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
  const [showMetrics, setShowMetrics] = useState(false);
  const [showAnnual, setShowAnnual] = useState(false);
  const [draft, setDraft] = useState({ name: "", value: "", assignedUserId: "", expectedCloseDate: "", categoria: "" });
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

  const filteredLeads = useMemo(() => {
    if (!leads) return [];
    return leads.filter((l) => {
      if (filters.assignedUserId && l.assignedUser?.id !== filters.assignedUserId) return false;
      if (filters.minValue && l.value < Number(filters.minValue)) return false;
      if (filters.maxValue && l.value > Number(filters.maxValue)) return false;
      return true;
    });
  }, [leads, filters]);

  if (leads === null || team === null) return <div style={{ color: C.muted, fontSize: 13 }}>Carregando...</div>;

  async function addLead() {
    if (!draft.name.trim()) return;
    await api.leadCreate({
      name: draft.name,
      value: Number(draft.value) || 0,
      assignedUserId: draft.assignedUserId || undefined,
      expectedCloseDate: draft.expectedCloseDate || undefined,
      categoria: draft.categoria || undefined,
    });
    setDraft({ name: "", value: "", assignedUserId: "", expectedCloseDate: "", categoria: "" });
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
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.ghostBtn} onClick={() => setShowAnnual((s) => !s)}><Calendar size={14} /> Meta anual</button>
          <button style={S.ghostBtn} onClick={() => setShowMetrics((s) => !s)}><TrendingUp size={14} /> Métricas</button>
          {isMaster && (
            <button style={S.ghostBtn} onClick={() => setShowTeam((s) => !s)}><UserPlus size={14} /> Equipe</button>
          )}
        </div>
      </div>

      {isMaster && showTeam && <TeamPanel team={team} onChange={reload} />}
      {showMetrics && <MetricsPanel leads={leads} />}
      {showAnnual && <AnnualGoalsPanel team={team} goals={goals} leads={leads} isMaster={isMaster} onChange={reload} />}

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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input style={{ ...S.input, flex: 1, minWidth: 160 }} placeholder="Nome do cliente" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input style={{ ...S.input, width: 150 }} placeholder="Valor (R$)" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
          <input style={{ ...S.input, width: 160 }} type="date" value={draft.expectedCloseDate} onChange={(e) => setDraft({ ...draft, expectedCloseDate: e.target.value })} />
          <input style={{ ...S.input, width: 150 }} placeholder="Categoria (opcional)" value={draft.categoria} onChange={(e) => setDraft({ ...draft, categoria: e.target.value })} />
          {isMaster && (
            <select style={{ ...S.input, width: 170 }} value={draft.assignedUserId} onChange={(e) => setDraft({ ...draft, assignedUserId: e.target.value })}>
              <option value="">Atribuir a mim</option>
              {team.users.filter((u) => u.id !== loadSession().user.id).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}
          <button style={S.primaryBtnSm} onClick={addLead}>Adicionar</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: C.paper, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
        <Filter size={13} color={C.muted} />
        {isMaster && (
          <select style={{ ...S.input, width: 160, padding: "6px 10px", fontSize: 12 }} value={filters.assignedUserId} onChange={(e) => setFilters({ ...filters, assignedUserId: e.target.value })}>
            <option value="">Todos os vendedores</option>
            {team.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <input style={{ ...S.input, width: 110, padding: "6px 10px", fontSize: 12 }} placeholder="Valor mín." value={filters.minValue} onChange={(e) => setFilters({ ...filters, minValue: e.target.value })} />
        <input style={{ ...S.input, width: 110, padding: "6px 10px", fontSize: 12 }} placeholder="Valor máx." value={filters.maxValue} onChange={(e) => setFilters({ ...filters, maxValue: e.target.value })} />
        {filtersActive && (
          <button style={{ ...S.ghostBtn, padding: "6px 10px", fontSize: 11.5 }} onClick={() => setFilters({ assignedUserId: "", minValue: "", maxValue: "" })}>Limpar filtros</button>
        )}
        <span style={{ fontSize: 11.5, color: C.muted, marginLeft: "auto" }}>{filteredLeads.length} de {leads.length} leads</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
        {activeStages.map((stage) => (
          <div key={stage} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600, color: C.inkSoft, display: "flex", justifyContent: "space-between", borderBottom: `2px solid ${C.border}`, paddingBottom: 8 }}>
              {stage}<span style={{ color: C.muted, fontWeight: 500 }}>{filteredLeads.filter((l) => l.stage === stage).length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 40 }}>
              {filteredLeads.filter((l) => l.stage === stage).map((l) => (
                <div key={l.id} onClick={() => setOpenLead(l)} style={{ background: C.card, border: `1px solid ${isOverdue(l) ? C.danger : C.border}`, borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 6, cursor: "pointer" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, display: "flex", justifyContent: "space-between", gap: 6 }}>
                    <span>{l.name}</span>
                    {l._count?.notes > 0 && (
                      <span style={{ display: "flex", alignItems: "center", gap: 2, color: C.muted, flexShrink: 0 }}>
                        <MessageSquare size={11} />{l._count.notes}
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12.5, color: C.gold, fontWeight: 600 }}>{fmtBRL(l.value)}</div>
                  {l.categoria && (
                    <div style={{ fontSize: 10, color: C.inkSoft, background: C.paper, padding: "2px 6px", borderRadius: 5, width: "fit-content" }}>{l.categoria}</div>
                  )}
                  {l.expectedCloseDate && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: isOverdue(l) ? C.danger : C.muted }}>
                      <Calendar size={10} />{fmtShortDate(l.expectedCloseDate)}{isOverdue(l) ? " · atrasado" : ""}
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 10.5, color: C.muted }}>{l.assignedUser?.name || "—"}</span>
                    <span style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                      <button style={S.moveBtn} disabled={stage === activeStages[0]} onClick={() => moveLead(l, -1)}>◀</button>
                      <button style={S.moveBtn} disabled={stage === "Fechado"} onClick={() => moveLead(l, 1)}>▶</button>
                      {stage !== "Fechado" && (
                        <button style={{ ...S.moveBtn, color: C.danger }} title="Marcar como perdido" onClick={() => setLostFor(l)}>✕</button>
                      )}
                      <button style={{ ...S.moveBtn, color: C.danger }} onClick={() => removeLead(l.id)}><Trash2 size={10} /></button>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {leads.some((l) => l.stage === "Perdido") && (
        <div style={{ background: C.dangerSoft, borderRadius: 12, padding: 16 }}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 13, color: C.danger, marginBottom: 10 }}>Perdidos</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {leads.filter((l) => l.stage === "Perdido").map((l) => (
              <div key={l.id} style={{ fontSize: 12, color: C.inkSoft, display: "flex", justifyContent: "space-between" }}>
                <span><strong>{l.name}</strong> · {fmtBRL(l.value)} {l.lostReason ? `— ${l.lostReason}` : ""}</span>
                <button style={{ ...S.moveBtn, color: C.danger }} onClick={() => removeLead(l.id)}><Trash2 size={10} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {lostFor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(28,33,48,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: C.card, borderRadius: 14, padding: 24, width: 360 }}>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 10 }}>Marcar "{lostFor.name}" como perdido</div>
            <input style={S.input} placeholder="Motivo (opcional)" value={lostReason} onChange={(e) => setLostReason(e.target.value)} />
            <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
              <button style={S.ghostBtn} onClick={() => { setLostFor(null); setLostReason(""); }}>Cancelar</button>
              <button style={{ ...S.primaryBtnSm, background: C.danger }} onClick={() => markLost(lostFor)}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {openLead && (
        <LeadDetailModal
          lead={openLead}
          onClose={() => { setOpenLead(null); reload(); }}
        />
      )}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 14.5 }}>Metas do time (mês atual)</div>
        {team.users.map((u) => {
          const closed = leads.filter((l) => l.assignedUser?.id === u.id && l.stage === "Fechado").reduce((s, l) => s + l.value, 0);
          const goal = monthGoals.find((g) => g.user?.id === u.id);
          const target = goal ? goal.target : 0;
          const p = target ? Math.min(100, Math.round((closed / target) * 100)) : 0;
          return (
            <div key={u.id} style={{ display: "grid", gridTemplateColumns: "140px 1fr 140px", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name} {u.role === "master" && <span style={{ color: C.muted, fontSize: 10.5 }}>(master)</span>}</div>
              <div style={{ height: 8, background: C.border, borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${p}%`, background: C.sage, borderRadius: 999 }} />
              </div>
              {isMaster ? (
                <input style={{ ...S.input, padding: "6px 10px", fontSize: 12 }} placeholder="Meta R$"
                  defaultValue={target || ""} onBlur={(e) => setGoal(u.id, e.target.value)} />
              ) : (
                <div style={{ fontSize: 12, color: C.muted }}>{fmtBRL(target)}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeadDetailModal({ lead, onClose }) {
  const [notes, setNotes] = useState(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [closeDate, setCloseDate] = useState(lead.expectedCloseDate ? lead.expectedCloseDate.slice(0, 10) : "");
  const [categoria, setCategoria] = useState(lead.categoria || "");

  const reload = useCallback(async () => {
    setNotes(await api.leadNotesList(lead.id));
  }, [lead.id]);

  useEffect(() => { reload(); }, [reload]);

  async function addNote() {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await api.leadNoteAdd(lead.id, draft.trim());
      setDraft("");
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function saveCloseDate() {
    await api.leadUpdate(lead.id, { expectedCloseDate: closeDate || null });
  }

  async function saveCategoria() {
    await api.leadUpdate(lead.id, { categoria: categoria || null });
  }

  function fmtDate(iso) {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,33,48,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div style={{ background: C.card, borderRadius: 14, padding: 24, width: 440, maxHeight: "80vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 16 }}>{lead.name}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
              {fmtBRL(lead.value)} · {lead.stage} · {lead.assignedUser?.name || "—"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}><X size={18} /></button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
          <span style={{ fontSize: 11.5, color: C.inkSoft, whiteSpace: "nowrap" }}>Fechamento previsto</span>
          <input type="date" style={{ ...S.input, padding: "6px 10px", fontSize: 12 }} value={closeDate} onChange={(e) => setCloseDate(e.target.value)} onBlur={saveCloseDate} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <span style={{ fontSize: 11.5, color: C.inkSoft, whiteSpace: "nowrap" }}>Categoria do produto</span>
          <input style={{ ...S.input, padding: "6px 10px", fontSize: 12, flex: 1 }} placeholder="Ex: Utilidades Domésticas" value={categoria} onChange={(e) => setCategoria(e.target.value)} onBlur={saveCategoria} />
        </div>

        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 12.5, color: C.inkSoft, marginTop: 18, marginBottom: 8 }}>
          Histórico e notas
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingRight: 4 }}>
          {notes === null && <div style={{ fontSize: 12, color: C.muted }}>Carregando...</div>}
          {notes && notes.length === 0 && <div style={{ fontSize: 12, color: C.muted }}>Nenhuma nota ainda.</div>}
          {notes && notes.map((n) => (
            <div key={n.id} style={{ background: C.paper, borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 12, color: C.ink, lineHeight: 1.45 }}>{n.content}</div>
              <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6 }}>{n.author?.name || "—"} · {fmtDate(n.createdAt)}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <input
            style={{ ...S.input, flex: 1 }}
            placeholder="Registrar uma ligação, e-mail, próximo passo..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addNote()}
          />
          <button style={S.primaryBtnSm} disabled={busy} onClick={addNote}>Adicionar</button>
        </div>
      </div>
    </div>
  );
}

function MetricsPanel({ leads }) {
  const metrics = useMemo(() => {
    const closed = leads.filter((l) => l.stage === "Fechado");
    const lost = leads.filter((l) => l.stage === "Perdido");
    const decided = closed.length + lost.length;
    const winRate = decided ? Math.round((closed.length / decided) * 100) : null;

    const avgTicket = closed.length ? closed.reduce((s, l) => s + l.value, 0) / closed.length : 0;

    const cycles = closed
      .map((l) => (new Date(l.updatedAt) - new Date(l.createdAt)) / (1000 * 60 * 60 * 24))
      .filter((d) => d >= 0);
    const avgCycle = cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : null;

    const funnel = STAGES.filter((s) => s !== "Perdido").map((stage) => ({
      stage,
      leads: leads.filter((l) => l.stage === stage).length,
    }));

    return { winRate, avgTicket, avgCycle, funnel, decided };
  }, [leads]);

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 14.5 }}>Métricas de conversão</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        <div style={{ background: C.paper, borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, color: C.muted }}>Taxa de conversão</div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 22, color: C.sage }}>
            {metrics.winRate === null ? "—" : `${metrics.winRate}%`}
          </div>
          <div style={{ fontSize: 10.5, color: C.muted }}>{metrics.decided} negócios decididos</div>
        </div>
        <div style={{ background: C.paper, borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, color: C.muted }}>Ticket médio</div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 22, color: C.gold }}>
            {fmtBRL(metrics.avgTicket)}
          </div>
          <div style={{ fontSize: 10.5, color: C.muted }}>por negócio fechado</div>
        </div>
        <div style={{ background: C.paper, borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, color: C.muted }}>Ciclo médio de venda</div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 22, color: C.ink }}>
            {metrics.avgCycle === null ? "—" : `${metrics.avgCycle} dias`}
          </div>
          <div style={{ fontSize: 10.5, color: C.muted }}>do cadastro ao fechamento</div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11.5, color: C.inkSoft, marginBottom: 8 }}>Distribuição do pipeline por etapa</div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={metrics.funnel}>
            <CartesianGrid stroke={C.border} vertical={false} />
            <XAxis dataKey="stage" tick={{ fill: C.inkSoft, fontSize: 10.5, fontFamily: "Inter" }} axisLine={{ stroke: C.border }} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: C.muted, fontSize: 10.5, fontFamily: "Inter" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: "Inter", fontSize: 12 }} />
            <Bar dataKey="leads" fill={C.gold} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AnnualGoalsPanel({ team, goals, leads, isMaster, onChange }) {
  const year = new Date().getFullYear();
  const [local, setLocal] = useState({}); // "userId-mm" -> valor digitado (rascunho)
  const [saving, setSaving] = useState(null);

  function goalFor(userId, mm) {
    const key = `${userId}-${mm}`;
    if (local[key] !== undefined) return local[key];
    const month = `${year}-${mm}`;
    const g = goals.find((g) => g.user?.id === userId && g.month === month);
    return g ? String(g.target) : "";
  }

  async function saveGoal(userId, mm, value) {
    setSaving(`${userId}-${mm}`);
    await api.goalSet({ userId, target: Number(value) || 0, month: `${year}-${mm}` });
    setSaving(null);
    onChange();
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 14.5 }}>Meta anual {year} {!isMaster && <span style={{ color: C.muted, fontWeight: 400, fontSize: 12 }}>(somente leitura)</span>}</div>

      {team.users.map((u) => {
        const annualTarget = MONTHS_PT.reduce((sum, _, i) => {
          const mm = String(i + 1).padStart(2, "0");
          const g = goals.find((g) => g.user?.id === u.id && g.month === `${year}-${mm}`);
          return sum + (g ? g.target : 0);
        }, 0);
        const ytdAchieved = leads
          .filter((l) => l.assignedUser?.id === u.id && l.stage === "Fechado" && new Date(l.updatedAt).getFullYear() === year)
          .reduce((s, l) => s + l.value, 0);
        const ytdPct = annualTarget ? Math.min(100, Math.round((ytdAchieved / annualTarget) * 100)) : 0;

        return (
          <div key={u.id} style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</div>
              <div style={{ fontSize: 12, color: C.inkSoft }}>
                YTD: <strong style={{ color: C.sage }}>{fmtBRL(ytdAchieved)}</strong> de {fmtBRL(annualTarget)} ({ytdPct}%)
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 4 }}>
              {MONTHS_PT.map((label, i) => {
                const mm = String(i + 1).padStart(2, "0");
                const key = `${u.id}-${mm}`;
                const isCurrent = `${year}-${mm}` === currentMonth();
                return (
                  <div key={mm} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <div style={{ fontSize: 9.5, color: isCurrent ? C.gold : C.muted, textAlign: "center", fontWeight: isCurrent ? 700 : 400 }}>{label}</div>
                    {isMaster ? (
                      <input
                        style={{ fontSize: 10, padding: "5px 3px", border: `1px solid ${isCurrent ? C.gold : C.border}`, borderRadius: 5, textAlign: "center", width: "100%" }}
                        value={goalFor(u.id, mm)}
                        onChange={(e) => setLocal({ ...local, [key]: e.target.value })}
                        onBlur={(e) => saveGoal(u.id, mm, e.target.value)}
                      />
                    ) : (
                      <div style={{ fontSize: 10, padding: "5px 3px", textAlign: "center", color: isCurrent ? C.gold : C.inkSoft, border: `1px solid transparent` }}>
                        {goalFor(u.id, mm) ? fmtBRL(Number(goalFor(u.id, mm))).replace("R$", "") : "—"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TeamPanel({ team, onChange }) {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function invite() {
    if (!email.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.teamInvite(email.trim());
      setMsg(r.emailSent ? "Convite enviado por e-mail." : `E-mail não configurado — copie o link: ${r.inviteLink}`);
      setEmail("");
      onChange();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id) { await api.teamRevokeInvite(id); onChange(); }
  async function remove(id) { await api.teamRemoveMember(id); onChange(); }

  const slotsUsed = team.users.length + team.invites.length;
  const slotsLeft = team.maxTeamSize - slotsUsed;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 14.5 }}>Equipe</div>
        <div style={{ fontSize: 11.5, color: C.muted }}>{slotsUsed}/{team.maxTeamSize} vagas usadas</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {team.users.map((u) => (
          <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
            <span>{u.name} <span style={{ color: C.muted }}>· {u.email} · {u.role === "master" ? "Master" : "Vendedor"}</span></span>
            {u.role !== "master" && (
              <button style={{ ...S.moveBtn, color: C.danger }} onClick={() => remove(u.id)}><Trash2 size={10} /></button>
            )}
          </div>
        ))}
        {team.invites.map((inv) => (
          <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, color: C.muted }}>
            <span><Mail size={11} style={{ verticalAlign: -1, marginRight: 4 }} />{inv.email} · convite pendente</span>
            <button style={S.moveBtn} onClick={() => revoke(inv.id)}><X size={10} /></button>
          </div>
        ))}
      </div>

      {slotsLeft > 0 ? (
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...S.input, flex: 1 }} placeholder="E-mail do vendedor" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button style={S.primaryBtnSm} disabled={busy} onClick={invite}>{busy ? "Enviando..." : "Convidar"}</button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: C.muted }}>Vagas do plano esgotadas.</div>
      )}
      {msg && <div style={{ fontSize: 11.5, color: C.inkSoft, wordBreak: "break-all" }}>{msg}</div>}
    </div>
  );
}
