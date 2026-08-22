import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { C, S } from "../theme.js";
import { api } from "../lib/api.js";

const STAGES = ["Novo Lead", "Qualificação", "Proposta", "Negociação", "Fechado"];
const fmtBRL = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const currentMonth = () => new Date().toISOString().slice(0, 7); // "2026-08"

export default function FerramentaVendas() {
  const [leads, setLeads] = useState(null);
  const [goals, setGoals] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ name: "", value: "", owner: "" });

  const reload = useCallback(async () => {
    const [ls, gs] = await Promise.all([api.leadsList(), api.goalsList()]);
    setLeads(ls);
    setGoals(gs);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  if (leads === null) return <div style={{ color: C.muted, fontSize: 13 }}>Carregando...</div>;

  async function addLead() {
    if (!draft.name.trim()) return;
    await api.leadCreate({ name: draft.name, value: Number(draft.value) || 0, owner: draft.owner || "Sem vendedor" });
    setDraft({ name: "", value: "", owner: "" });
    setShowForm(false);
    reload();
  }
  async function moveLead(lead, dir) {
    const idx = STAGES.indexOf(lead.stage);
    const next = STAGES[Math.min(Math.max(idx + dir, 0), STAGES.length - 1)];
    await api.leadUpdate(lead.id, { stage: next });
    reload();
  }
  async function removeLead(id) { await api.leadDelete(id); reload(); }
  async function setGoal(vendor, value) {
    await api.goalSet({ vendor, target: Number(value) || 0, month: currentMonth() });
    reload();
  }

  const vendors = [...new Set(leads.map((l) => l.owner))];
  const totalClosed = leads.filter((l) => l.stage === "Fechado").reduce((s, l) => s + l.value, 0);
  const monthGoals = goals.filter((g) => g.month === currentMonth());
  const overallTarget = monthGoals.reduce((s, g) => s + g.target, 0) || 1;
  const pct = Math.min(100, Math.round((totalClosed / overallTarget) * 100));

  return (
    <div style={S.moduleCol}>
      <div>
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 24, margin: 0 }}>Ferramenta de Vendas</h2>
        <p style={{ fontSize: 14, color: C.inkSoft, margin: "4px 0 0" }}>Pipeline visual, leads e metas — salvos no seu banco de dados.</p>
      </div>

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
          <input style={{ ...S.input, width: 150 }} placeholder="Vendedor" value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} />
          <button style={S.primaryBtnSm} onClick={addLead}>Adicionar</button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
        {STAGES.map((stage) => (
          <div key={stage} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600, color: C.inkSoft, display: "flex", justifyContent: "space-between", borderBottom: `2px solid ${C.border}`, paddingBottom: 8 }}>
              {stage}<span style={{ color: C.muted, fontWeight: 500 }}>{leads.filter((l) => l.stage === stage).length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 40 }}>
              {leads.filter((l) => l.stage === stage).map((l) => (
                <div key={l.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{l.name}</div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12.5, color: C.gold, fontWeight: 600 }}>{fmtBRL(l.value)}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 10.5, color: C.muted }}>{l.owner}</span>
                    <span style={{ display: "flex", gap: 4 }}>
                      <button style={S.moveBtn} disabled={stage === STAGES[0]} onClick={() => moveLead(l, -1)}>◀</button>
                      <button style={S.moveBtn} disabled={stage === STAGES[STAGES.length - 1]} onClick={() => moveLead(l, 1)}>▶</button>
                      <button style={{ ...S.moveBtn, color: C.danger }} onClick={() => removeLead(l.id)}><Trash2 size={10} /></button>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {vendors.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 14.5 }}>Metas por vendedor (mês atual)</div>
          {vendors.map((v) => {
            const closed = leads.filter((l) => l.owner === v && l.stage === "Fechado").reduce((s, l) => s + l.value, 0);
            const goal = monthGoals.find((g) => g.vendor === v);
            const target = goal ? goal.target : 0;
            const p = target ? Math.min(100, Math.round((closed / target) * 100)) : 0;
            return (
              <div key={v} style={{ display: "grid", gridTemplateColumns: "120px 1fr 140px", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
                <div style={{ height: 8, background: C.border, borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${p}%`, background: C.sage, borderRadius: 999 }} />
                </div>
                <input style={{ ...S.input, padding: "6px 10px", fontSize: 12 }} placeholder="Meta R$"
                  defaultValue={target || ""} onBlur={(e) => setGoal(v, e.target.value)} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
