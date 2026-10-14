import React, { useState, useEffect, useMemo } from "react";
import { UserPlus, Search, Mail, Pencil, Trash2, X, Check, ShieldCheck } from "lucide-react";
import { C, S, FONT_DISPLAY } from "../theme.js";
import { api, loadSession } from "../lib/api.js";
import ModuleError from "../components/ModuleError.jsx";

// Áreas e módulos — mesmas chaves do servidor (server/src/lib/acessos.js).
export const AREAS = [
  { key: "vendas", label: "Vendas" },
  { key: "produtos", label: "Produtos" },
  { key: "marketing", label: "Marketing" },
  { key: "administrativo", label: "Administrativo" },
  { key: "financeiro", label: "Financeiro" },
  { key: "logistica", label: "Logística" },
  { key: "diretoria", label: "Diretoria" },
  { key: "outra", label: "Outra" },
];
const AREA_LABEL = Object.fromEntries(AREAS.map((a) => [a.key, a.label]));

export const MODULOS = [
  { key: "coach", label: "Comercial Coach", hint: "diagnóstico e plano de ação" },
  { key: "vendas", label: "Ferramenta de Vendas", hint: "pipeline, metas e carteira" },
  { key: "gestao", label: "Ferramenta de Gestão", hint: "faturamento, margem e estoque" },
  { key: "credito", label: "Análise de Crédito", hint: "inclui clientes e grupos" },
  { key: "sortimento", label: "Gestão de Sortimento", hint: "produtos e tabela de preços" },
  { key: "dre", label: "DRE / Fluxo de Caixa", hint: "resultado e caixa" },
];
const MOD_LABEL = Object.fromEntries(MODULOS.map((m) => [m.key, m.label]));

// Sugestão de acessos ao escolher a área — o master pode marcar e desmarcar à vontade.
const SUGESTAO = {
  vendas: ["coach", "vendas", "credito"],
  produtos: ["sortimento"],
  marketing: ["coach"],
  administrativo: ["credito"],
  financeiro: ["credito", "gestao", "dre"],
  logistica: ["sortimento"],
  diretoria: MODULOS.map((m) => m.key),
  outra: [],
};

const iconBtn = { border: `1px solid ${C.border}`, background: C.card, borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: C.inkSoft, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 };
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : null);

function AreaBadge({ area }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: area ? C.goldSoft : C.paper, color: area ? "#8A6423" : C.muted, border: area ? "none" : `1px dashed ${C.border}`, whiteSpace: "nowrap" }}>
      {area ? AREA_LABEL[area] || area : "Sem área"}
    </span>
  );
}

function ModuleChecks({ value, onChange }) {
  const toggle = (k) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 8 }}>
      {MODULOS.map((m) => {
        const on = value.includes(m.key);
        return (
          <label key={m.key} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "9px 11px", borderRadius: 9, cursor: "pointer", border: `1px solid ${on ? C.sage : C.border}`, background: on ? C.sageSoft : C.card }}>
            <input type="checkbox" checked={on} onChange={() => toggle(m.key)} style={{ marginTop: 2, accentColor: C.sage }} />
            <span>
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: C.ink }}>{m.label}</span>
              <span style={{ display: "block", fontSize: 11, color: C.muted }}>{m.hint}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function AreaSelect({ value, onChange, placeholder = "Escolha a área" }) {
  return (
    <select style={{ ...S.input, width: "auto", minWidth: 190, flex: "0 1 220px" }} value={value || ""} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>{placeholder}</option>
      {AREAS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
    </select>
  );
}

export default function Equipe() {
  const [team, setTeam] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [filtro, setFiltro] = useState("todos");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState(null);
  const myId = loadSession()?.user?.id;

  async function reload() {
    try { setTeam(await api.teamGet()); setLoadError(null); }
    catch (e) { setLoadError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  const linhas = useMemo(() => {
    if (!team) return [];
    const pessoas = team.users.map((u) => ({ ...u, tipo: "usuario" }));
    const convites = team.invites.map((i) => ({ ...i, tipo: "convite", name: i.email }));
    return [...pessoas, ...convites];
  }, [team]);

  const contagem = useMemo(() => {
    const c = { todos: linhas.length, sem: 0 };
    linhas.forEach((l) => { if (l.area) c[l.area] = (c[l.area] || 0) + 1; else c.sem++; });
    return c;
  }, [linhas]);

  const visiveis = linhas.filter((l) => {
    if (filtro === "sem" ? l.area : filtro !== "todos" && l.area !== filtro) return false;
    const q = busca.trim().toLowerCase();
    return !q || `${l.name} ${l.email}`.toLowerCase().includes(q);
  });

  if (loadError && !team) return <ModuleError title="Não foi possível carregar a equipe" message={loadError} onRetry={reload} />;
  if (!team) return <div style={{ color: C.muted, fontSize: 13 }}>Carregando...</div>;

  const vagas = team.maxTeamSize - (team.users.length + team.invites.length);
  const chip = (key, label, n) => (
    <button key={key} onClick={() => setFiltro(key)} style={{ border: `1px solid ${filtro === key ? C.ink : C.border}`, background: filtro === key ? C.ink : C.card, color: filtro === key ? "#fff" : C.inkSoft, borderRadius: 99, padding: "6px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
      {label} <span style={{ opacity: 0.65, fontWeight: 500 }}>{n}</span>
    </button>
  );

  return (
    <div style={S.moduleCol}>
      <div>
        <div style={S.eyebrow}>EQUIPE</div>
        <h1 style={S.h1}>Equipe e acessos</h1>
        <p style={S.lead}>Cadastre cada colaborador com a área em que trabalha e escolha o que ele pode ver. Quem saiu da empresa, remova aqui: o acesso acaba na hora.</p>
      </div>

      <ConviteForm vagas={vagas} max={team.maxTeamSize} onDone={reload} />

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 16 }}>Quem está na plataforma</div>
          <div style={{ position: "relative", flex: "0 1 260px" }}>
            <Search size={14} color={C.muted} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input style={{ ...S.input, paddingLeft: 30, width: "100%", boxSizing: "border-box" }} placeholder="Buscar por nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {chip("todos", "Todos", contagem.todos)}
          {AREAS.filter((a) => contagem[a.key]).map((a) => chip(a.key, a.label, contagem[a.key]))}
          {contagem.sem > 0 && chip("sem", "Sem área", contagem.sem)}
        </div>

        {visiveis.length === 0 ? (
          <div style={{ fontSize: 13, color: C.muted, padding: "10px 0" }}>Ninguém nesta área{busca ? " com essa busca" : ""}.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {visiveis.map((l) => (
              <Linha key={l.tipo + l.id} l={l} isMe={l.id === myId} editando={editando === l.id}
                onEdit={() => setEditando(editando === l.id ? null : l.id)} onDone={() => { setEditando(null); reload(); }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConviteForm({ vagas, max, onDone }) {
  const [email, setEmail] = useState("");
  const [area, setArea] = useState("");
  const [modulos, setModulos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  function escolherArea(a) { setArea(a); setModulos(SUGESTAO[a] || []); }

  async function enviar() {
    setMsg(null);
    if (!email.trim()) return setMsg({ erro: true, t: "Informe o e-mail do colaborador." });
    if (!area) return setMsg({ erro: true, t: "Escolha a área do colaborador." });
    if (!modulos.length) return setMsg({ erro: true, t: "Marque pelo menos um módulo que ele vai poder ver." });
    setBusy(true);
    try {
      const r = await api.teamInvite(email.trim(), area, modulos);
      setMsg({ t: r.emailSent ? `Convite enviado para ${email.trim()}.` : `O e-mail não está configurado. Envie este link para a pessoa: ${r.inviteLink}` });
      setEmail(""); setArea(""); setModulos([]);
      onDone();
    } catch (e) {
      setMsg({ erro: true, t: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}><UserPlus size={16} /> Adicionar colaborador</div>
        <div style={{ fontSize: 12, color: C.muted }}>{max - vagas} de {max} vagas usadas</div>
      </div>
      {vagas <= 0 ? (
        <div style={{ fontSize: 13, color: C.inkSoft }}>As vagas do plano estão todas ocupadas. Remova alguém que saiu da empresa ou cancele um convite pendente para liberar uma vaga.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input style={{ ...S.input, flex: "1 1 240px" }} placeholder="E-mail do colaborador" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <AreaSelect value={area} onChange={escolherArea} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 8 }}>O que ele vai poder ver{area ? <span style={{ fontWeight: 400, color: C.muted }}> · sugestão para {AREA_LABEL[area]}, ajuste se precisar</span> : null}</div>
            <ModuleChecks value={modulos} onChange={setModulos} />
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Visão Geral e Planos aparecem para todos. Módulos que a empresa não contratou continuam bloqueados, mesmo marcados.</div>
          </div>
          <div>
            <button style={{ ...S.primaryBtn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={enviar}>{busy ? "Enviando..." : "Enviar convite"}</button>
          </div>
        </>
      )}
      {msg && <div style={{ fontSize: 12.5, color: msg.erro ? C.danger : C.sage, wordBreak: "break-all" }}>{msg.t}</div>}
    </div>
  );
}

function Linha({ l, isMe, editando, onEdit, onDone }) {
  const isMaster = l.role === "master";
  const isConvite = l.tipo === "convite";
  const [area, setArea] = useState(l.area || "");
  const [modulos, setModulos] = useState(l.modulos || []);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => { if (editando) { setArea(l.area || ""); setModulos(l.modulos || []); setErro(null); } }, [editando]);

  async function salvar() {
    setErro(null);
    if (!area) return setErro("Escolha a área.");
    if (!isMaster && !modulos.length) return setErro("Marque pelo menos um módulo.");
    setBusy(true);
    try {
      await api.teamUpdateMember(l.id, isMaster ? { area } : { area, modulos });
      onDone();
    } catch (e) { setErro(e.message); } finally { setBusy(false); }
  }
  async function remover() {
    setBusy(true);
    try {
      if (isConvite) await api.teamRevokeInvite(l.id); else await api.teamRemoveMember(l.id);
      onDone();
    } catch (e) { setErro(e.message); setBusy(false); }
  }

  return (
    <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 0", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: isConvite ? C.paper : isMaster ? C.ink : C.goldSoft, border: isConvite ? `1px dashed ${C.border}` : "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: isMaster ? "#fff" : "#8A6423", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13 }}>
          {isConvite ? <Mail size={14} color={C.muted} /> : (l.name?.[0] || "?").toUpperCase()}
        </div>
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: isConvite ? C.inkSoft : C.ink, overflow: "hidden", textOverflow: "ellipsis" }}>
            {isConvite ? l.email : l.name}{isMe ? <span style={{ color: C.muted, fontWeight: 500 }}> (você)</span> : null}
          </div>
          <div style={{ fontSize: 11.5, color: C.muted }}>
            {isConvite ? `Convite pendente · vence em ${fmtDate(l.expiresAt)}` : `${l.email}${isMaster ? " · Administrador" : ""}${l.lastLoginAt ? ` · último acesso em ${fmtDate(l.lastLoginAt)}` : " · ainda não entrou"}`}
          </div>
        </div>
        <AreaBadge area={l.area} />
        <div style={{ display: "flex", gap: 6 }}>
          {!isConvite && <button title="Editar área e acessos" style={{ ...iconBtn }} onClick={onEdit}><Pencil size={14} /></button>}
          {!isMaster && !confirmando && <button title={isConvite ? "Cancelar convite" : "Remover da equipe"} style={{ ...iconBtn, color: C.danger }} onClick={() => setConfirmando(true)}>{isConvite ? <X size={15} /> : <Trash2 size={14} />}</button>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", paddingLeft: 46 }}>
        {isMaster ? (
          <span style={{ fontSize: 11, color: C.sage, display: "flex", alignItems: "center", gap: 4 }}><ShieldCheck size={12} /> Vê todos os módulos e administra a equipe</span>
        ) : (l.modulos || []).length ? (
          l.modulos.map((m) => <span key={m} style={{ fontSize: 11, padding: "2px 9px", borderRadius: 99, background: C.sageSoft, color: C.sage, fontWeight: 600 }}>{MOD_LABEL[m] || m}</span>)
        ) : <span style={{ fontSize: 11, color: C.danger }}>Nenhum módulo liberado</span>}
      </div>

      {confirmando && (
        <div style={{ marginLeft: 46, background: C.dangerSoft, borderRadius: 10, padding: "10px 12px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: C.danger, flex: "1 1 260px" }}>
            {isConvite ? `Cancelar o convite de ${l.email}? O link deixa de funcionar.` : `Remover ${l.name}? O acesso acaba na hora. Os leads dele ficam sem responsável; notas, análises e histórico continuam na empresa.`}
          </span>
          <button style={{ ...S.primaryBtnSm, background: C.danger, borderColor: C.danger }} disabled={busy} onClick={remover}>{busy ? "Removendo..." : isConvite ? "Cancelar convite" : "Remover"}</button>
          <button style={S.ghostBtn} onClick={() => setConfirmando(false)}>Voltar</button>
        </div>
      )}

      {editando && (
        <div style={{ marginLeft: 46, background: C.paper, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.inkSoft }}>Área</span>
            <AreaSelect value={area} onChange={setArea} />
          </div>
          {!isMaster && <ModuleChecks value={modulos} onChange={setModulos} />}
          {erro && <div style={{ fontSize: 12, color: C.danger }}>{erro}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.primaryBtnSm} disabled={busy} onClick={salvar}><Check size={13} /> {busy ? "Salvando..." : "Salvar"}</button>
            <button style={S.ghostBtn} onClick={onEdit}>Cancelar</button>
          </div>
        </div>
      )}
      {!editando && !confirmando && erro && <div style={{ fontSize: 12, color: C.danger, paddingLeft: 46 }}>{erro}</div>}
    </div>
  );
}
