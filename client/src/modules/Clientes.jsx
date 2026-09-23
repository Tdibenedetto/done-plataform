import React, { useState, useEffect } from "react";
import { Users, ArrowLeft, Lock, Unlock, History as HistoryIcon, Plus } from "lucide-react";
import { C, S, FONT_DISPLAY } from "../theme.js";
import { api } from "../lib/api.js";

const fmtBRL = (n) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
const fmtDate = (d) => new Date(d).toLocaleDateString("pt-BR");

const STATUS_LABEL = { ativo: "Ativo", atrasado: "Atrasado", bloqueado: "Bloqueado" };
const STATUS_COLOR = { ativo: C.sage, atrasado: "#8A6423", bloqueado: C.danger };
const STATUS_BG = { ativo: C.sageSoft, atrasado: C.goldSoft, bloqueado: C.dangerSoft };

function StatusBadge({ status }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 11px", borderRadius: 99, background: STATUS_BG[status], color: STATUS_COLOR[status] }}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export default function ClientesPanel() {
  const [clientes, setClientes] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [showNew, setShowNew] = useState(false);

  async function reload() {
    try {
      setClientes(await api.clientesList());
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { reload(); }, []);

  async function loadDetail(id) {
    try {
      setDetail(await api.clientesGet(id));
      setSelectedId(id);
    } catch (e) {
      setError(e.message);
    }
  }

  function backToList() {
    setSelectedId(null);
    setDetail(null);
    reload();
  }

  if (selectedId && detail) {
    return <ClienteDetail cliente={detail} onBack={backToList} onChanged={() => loadDetail(selectedId)} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: C.muted }}>Cada cliente reúne o histórico de negociações (Vendas) e o limite de crédito num só lugar.</div>
        <button style={S.ghostBtn} onClick={() => setShowNew((s) => !s)}><Plus size={14} /> Novo cliente</button>
      </div>

      {showNew && <NovoClienteForm onCreated={() => { setShowNew(false); reload(); }} onCancel={() => setShowNew(false)} />}
      {error && <div style={{ fontSize: 12, color: C.danger }}>{error}</div>}

      {clientes === null ? (
        <div style={{ color: C.muted, fontSize: 13 }}>Carregando...</div>
      ) : clientes.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 30, textAlign: "center" }}>
          <Users size={24} color={C.muted} />
          <div style={{ fontSize: 13, color: C.muted, marginTop: 10 }}>Nenhum cliente cadastrado ainda. Uma consulta de CNPJ na Análise de Crédito cria um automaticamente.</div>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
          {clientes.map((c, i) => (
            <button
              key={c.id}
              onClick={() => loadDetail(c.id)}
              style={{
                width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "14px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left",
                borderTop: i > 0 ? `1px solid ${C.border}` : "none",
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{c.razaoSocial}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{c.cnpj}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", fontWeight: 700 }}>Disponível</div>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 14, fontWeight: 700, color: C.sage }}>{fmtBRL(c.creditoDisponivel)}</div>
                </div>
                <StatusBadge status={c.status} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NovoClienteForm({ onCreated, onCancel }) {
  const [cnpj, setCnpj] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setBusy(true); setError(null);
    try {
      await api.clientesCreate(cnpj, razaoSocial);
      onCreated();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 180px" }}>
        <div style={{ fontSize: 11, color: C.inkSoft, marginBottom: 4 }}>CNPJ</div>
        <input style={S.input} placeholder="00.000.000/0000-00" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
      </div>
      <div style={{ flex: "2 1 220px" }}>
        <div style={{ fontSize: 11, color: C.inkSoft, marginBottom: 4 }}>Razão social</div>
        <input style={S.input} value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} />
      </div>
      <button style={S.primaryBtnSm} disabled={busy} onClick={save}>{busy ? "Salvando..." : "Criar"}</button>
      <button style={S.ghostBtn} onClick={onCancel}>Cancelar</button>
      {error && <div style={{ fontSize: 12, color: C.danger, width: "100%" }}>{error}</div>}
    </div>
  );
}

function ClienteDetail({ cliente, onBack, onChanged }) {
  const [editingLimite, setEditingLimite] = useState(false);
  const [novoLimite, setNovoLimite] = useState(cliente.creditoAprovado ?? "");
  const [blockingMotivo, setBlockingMotivo] = useState(null); // null = não mostrando o campo; string = editando
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function saveLimite() {
    setBusy(true); setError(null);
    try {
      await api.clientesSetLimite(cliente.id, Number(novoLimite));
      setEditingLimite(false);
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status, motivo) {
    setBusy(true); setError(null);
    try {
      await api.clientesSetStatus(cliente.id, status, motivo);
      setBlockingMotivo(null);
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: C.inkSoft, fontSize: 12.5, padding: 0, alignSelf: "flex-start" }}>
        <ArrowLeft size={14} /> Todos os clientes
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700, color: C.ink }}>{cliente.razaoSocial}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
            {cliente.cnpj} <StatusBadge status={cliente.status} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.ghostBtn} onClick={() => setEditingLimite((s) => !s)}>Editar limite</button>
          {cliente.status === "bloqueado" ? (
            <button style={{ ...S.ghostBtn, borderColor: C.sage, color: C.sage }} disabled={busy} onClick={() => setStatus("ativo", null)}>
              <Unlock size={13} /> Desbloquear cliente
            </button>
          ) : (
            <button style={{ ...S.ghostBtn, borderColor: C.danger, color: C.danger }} onClick={() => setBlockingMotivo("")}>
              <Lock size={13} /> Bloquear cliente
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: C.danger }}>{error}</div>}

      {cliente.status !== "ativo" && cliente.statusMotivo && (
        <div style={{ background: C.dangerSoft, borderRadius: 10, padding: "12px 16px", fontSize: 12.5, color: C.danger, fontWeight: 600 }}>
          ⚠ {cliente.statusMotivo}
        </div>
      )}

      {editingLimite && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 200px" }}>
            <div style={{ fontSize: 11, color: C.inkSoft, marginBottom: 4 }}>
              Novo limite aprovado {cliente.creditoSugeridoIA != null && <span style={{ color: C.muted }}>(sugestão da IA: {fmtBRL(cliente.creditoSugeridoIA)})</span>}
            </div>
            <input style={S.input} type="number" value={novoLimite} onChange={(e) => setNovoLimite(e.target.value)} />
          </div>
          <button style={S.primaryBtnSm} disabled={busy} onClick={saveLimite}>Salvar</button>
          <button style={S.ghostBtn} onClick={() => setEditingLimite(false)}>Cancelar</button>
        </div>
      )}

      {blockingMotivo !== null && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px" }}>
            <div style={{ fontSize: 11, color: C.inkSoft, marginBottom: 4 }}>Motivo do bloqueio (opcional)</div>
            <input style={S.input} placeholder="Ex: pagamento em atraso há 12 dias" value={blockingMotivo} onChange={(e) => setBlockingMotivo(e.target.value)} />
          </div>
          <button style={{ ...S.primaryBtnSm, background: C.danger }} disabled={busy} onClick={() => setStatus("bloqueado", blockingMotivo)}>Confirmar bloqueio</button>
          <button style={S.ghostBtn} onClick={() => setBlockingMotivo(null)}>Cancelar</button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <StatCard label="Limite Aprovado" value={fmtBRL(cliente.creditoAprovado)} />
        <StatCard label="Faturado em Aberto" value={fmtBRL(cliente.faturadoEmAberto)} sub="Puxado automaticamente de Vendas" color={C.gold} />
        <StatCard label="Crédito Disponível" value={fmtBRL(cliente.creditoDisponivel)} color={C.sage} />
        <StatCard label="Cliente desde" value={fmtDate(cliente.createdAt)} sub={`${cliente.leadsCount || 0} negociação(ões)`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 14 }} className="done-two-col-grid">
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14.5, marginBottom: 10 }}>
            <HistoryIcon size={14} /> Histórico de limite
          </div>
          {(!cliente.limiteHistorico || cliente.limiteHistorico.length === 0) ? (
            <div style={{ fontSize: 12, color: C.muted }}>Nenhuma mudança de limite ainda.</div>
          ) : (
            cliente.limiteHistorico.map((h) => (
              <div key={h.id} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                <span style={{ color: C.muted }}>{fmtDate(h.createdAt)} · {h.alteradoPor}</span>
                <span>{h.valorAnterior != null ? fmtBRL(h.valorAnterior) : "—"} → <b style={{ color: C.sage }}>{fmtBRL(h.valorNovo)}</b></span>
              </div>
            ))
          )}
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14.5, marginBottom: 10 }}>Negociações deste cliente</div>
          {(!cliente.leads || cliente.leads.length === 0) ? (
            <div style={{ fontSize: 12, color: C.muted }}>Nenhum lead vinculado ainda.</div>
          ) : (
            cliente.leads.map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12.5 }}>
                <div>
                  <div style={{ fontWeight: 600, color: C.ink }}>{l.name}</div>
                  <div style={{ fontSize: 10.5, color: C.muted }}>{l.stage}</div>
                </div>
                <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700 }}>{fmtBRL(l.value)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
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
