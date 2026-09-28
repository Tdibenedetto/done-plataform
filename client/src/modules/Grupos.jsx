import React, { useState, useEffect } from "react";
import { Layers, ArrowLeft, Plus, History as HistoryIcon, Trash2 } from "lucide-react";
import { C, S, FONT_DISPLAY } from "../theme.js";
import { api } from "../lib/api.js";

const fmtBRL = (n) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
const fmtDate = (d) => new Date(d).toLocaleDateString("pt-BR");

const STATUS_LABEL = { ativo: "Ativo", atrasado: "Atrasado", bloqueado: "Bloqueado" };
const STATUS_COLOR = { ativo: C.sage, atrasado: "#8A6423", bloqueado: C.danger };
const STATUS_BG = { ativo: C.sageSoft, atrasado: C.goldSoft, bloqueado: C.dangerSoft };

function StatusBadge({ status }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: STATUS_BG[status], color: STATUS_COLOR[status] }}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, color: C.muted, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, color: color || C.ink, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default function GruposPanel() {
  const [grupos, setGrupos] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    try { setGrupos(await api.gruposList()); } catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  async function loadDetail(id) {
    try { setDetail(await api.gruposGet(id)); setSelectedId(id); } catch (e) { setError(e.message); }
  }

  function backToList() { setSelectedId(null); setDetail(null); reload(); }

  async function createGrupo() {
    setBusy(true); setError(null);
    try {
      const g = await api.gruposCreate(nome);
      setNome(""); setShowNew(false);
      await reload();
      loadDetail(g.id);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (selectedId && detail) {
    return <GrupoDetail grupo={detail} onBack={backToList} onChanged={() => loadDetail(selectedId)} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: C.muted, flex: "1 1 260px" }}>
          Reúna CNPJs do mesmo grupo (matriz, filiais, franquias) e enxergue o crédito por cliente, não só por CNPJ. Para colocar um CNPJ num grupo, abra o cliente na aba Clientes.
        </div>
        <button style={S.ghostBtn} onClick={() => setShowNew((s) => !s)}><Plus size={14} /> Novo grupo</button>
      </div>

      {showNew && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 240px" }}>
            <div style={{ fontSize: 11, color: C.inkSoft, marginBottom: 4 }}>Nome do grupo</div>
            <input style={S.input} placeholder="Ex: Grupo Bravo" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <button style={S.primaryBtnSm} disabled={busy} onClick={createGrupo}>{busy ? "Criando..." : "Criar"}</button>
          <button style={S.ghostBtn} onClick={() => setShowNew(false)}>Cancelar</button>
        </div>
      )}
      {error && <div style={{ fontSize: 12, color: C.danger }}>{error}</div>}

      {grupos === null ? (
        <div style={{ color: C.muted, fontSize: 13 }}>Carregando...</div>
      ) : grupos.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 30, textAlign: "center" }}>
          <Layers size={24} color={C.muted} />
          <div style={{ fontSize: 13, color: C.muted, marginTop: 10 }}>Nenhum grupo econômico ainda. Crie o primeiro em "Novo grupo".</div>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
          {grupos.map((g, i) => (
            <button key={g.id} onClick={() => loadDetail(g.id)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left", borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{g.nome}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{g.clientesCount} CNPJ(s)</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", fontWeight: 700 }}>Disponível</div>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 14, fontWeight: 700, color: C.sage }}>{fmtBRL(g.creditoDisponivel)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GrupoDetail({ grupo, onBack, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [novoLimite, setNovoLimite] = useState(grupo.creditoAprovado ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function saveLimite() {
    setBusy(true); setError(null);
    try { await api.gruposSetLimite(grupo.id, Number(novoLimite)); setEditing(false); onChanged(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function deleteGrupo() {
    setBusy(true); setError(null);
    try { await api.gruposDelete(grupo.id); onBack(); }
    catch (e) { setError(e.message); setBusy(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: C.inkSoft, fontSize: 12.5, padding: 0, alignSelf: "flex-start" }}>
        <ArrowLeft size={14} /> Todos os grupos
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700, color: C.ink }}>{grupo.nome}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Grupo econômico · {grupo.clientesCount} CNPJ(s) · desde {fmtDate(grupo.createdAt)}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.ghostBtn} onClick={() => { setEditing((s) => !s); setNovoLimite(grupo.creditoAprovado ?? ""); }}>Editar limite do grupo</button>
          <button style={{ ...S.ghostBtn, borderColor: C.danger, color: C.danger }} onClick={() => setConfirmDelete((s) => !s)}><Trash2 size={13} /> Excluir grupo</button>
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: C.danger }}>{error}</div>}

      {confirmDelete && (
        <div style={{ background: C.dangerSoft, borderRadius: 10, padding: "12px 16px", fontSize: 12.5, color: C.danger, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span>Excluir o grupo não apaga os CNPJs — eles voltam a ser clientes avulsos, cada um sem limite definido.</span>
          <span style={{ display: "flex", gap: 8 }}>
            <button style={{ ...S.primaryBtnSm, background: C.danger }} disabled={busy} onClick={deleteGrupo}>Confirmar exclusão</button>
            <button style={S.ghostBtn} onClick={() => setConfirmDelete(false)}>Cancelar</button>
          </span>
        </div>
      )}

      {editing && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 220px" }}>
            <div style={{ fontSize: 11, color: C.inkSoft, marginBottom: 4 }}>Limite consolidado do grupo (vale para todos os CNPJs juntos)</div>
            <input style={S.input} type="number" value={novoLimite} onChange={(e) => setNovoLimite(e.target.value)} />
          </div>
          <button style={S.primaryBtnSm} disabled={busy} onClick={saveLimite}>Salvar</button>
          <button style={S.ghostBtn} onClick={() => setEditing(false)}>Cancelar</button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <StatCard label="Limite do Grupo" value={fmtBRL(grupo.creditoAprovado)} />
        <StatCard label="Faturado em Aberto" value={fmtBRL(grupo.faturadoEmAberto)} sub="Soma de todos os CNPJs" color={C.gold} />
        <StatCard label="Crédito Disponível" value={fmtBRL(grupo.creditoDisponivel)} color={C.sage} />
        <StatCard label="CNPJs no grupo" value={grupo.clientesCount} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 14 }} className="done-two-col-grid">
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14.5, marginBottom: 10 }}>CNPJs do grupo</div>
          {grupo.clientes.length === 0 ? (
            <div style={{ fontSize: 12, color: C.muted }}>Nenhum CNPJ ainda. Abra um cliente na aba Clientes e escolha este grupo.</div>
          ) : (
            grupo.clientes.map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12.5 }}>
                <div>
                  <div style={{ fontWeight: 600, color: C.ink }}>{c.razaoSocial}</div>
                  <div style={{ fontSize: 10.5, color: C.muted }}>{c.cnpj}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700 }}>{fmtBRL(c.faturadoEmAberto)}</span>
                  <StatusBadge status={c.status} />
                </div>
              </div>
            ))
          )}
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14.5, marginBottom: 10 }}>
            <HistoryIcon size={14} /> Histórico de limite
          </div>
          {grupo.limiteHistorico.length === 0 ? (
            <div style={{ fontSize: 12, color: C.muted }}>Nenhuma mudança de limite ainda.</div>
          ) : (
            grupo.limiteHistorico.map((h) => (
              <div key={h.id} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                <span style={{ color: C.muted }}>{fmtDate(h.createdAt)} · {h.alteradoPor}</span>
                <span>{h.valorAnterior != null ? fmtBRL(h.valorAnterior) : "—"} → <b style={{ color: C.sage }}>{fmtBRL(h.valorNovo)}</b></span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
