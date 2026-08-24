import React, { useState, useEffect } from "react";
import {
  Activity, Trello, BarChart2, LayoutGrid, Eye, EyeOff,
  ShieldCheck, Menu, X,
} from "lucide-react";
import { C, S, FONT_DISPLAY, FONT_IMPORT, RESPONSIVE_CSS } from "./theme.js";
import { api, saveSession, loadSession, clearSession } from "./lib/api.js";
import ComercialCoach from "./modules/ComercialCoach.jsx";
import FerramentaVendas from "./modules/Vendas.jsx";
import FerramentaGestao from "./modules/Gestao.jsx";
import VisaoGeral from "./modules/VisaoGeral.jsx";

export default function App() {
  const [session, setSession] = useState(() => loadSession());
  const [activeModule, setActiveModule] = useState("overview");
  const [coachResult, setCoachResult] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Rota pública de convite: /convite/:token
  const path = window.location.pathname;
  if (path.startsWith("/convite/")) {
    const token = path.replace("/convite/", "");
    return <InviteAcceptScreen token={token} onAuth={(t, u) => { saveSession(t, u); setSession({ token: t, user: u }); window.history.replaceState(null, "", "/"); }} />;
  }

  useEffect(() => {
    if (session) api.coachLatest().then(setCoachResult).catch(() => setCoachResult(null));
  }, [session]);

  if (!session) {
    return <AuthScreen onAuth={(token, user) => { saveSession(token, user); setSession({ token, user }); }} />;
  }

  function goTo(mod) {
    setActiveModule(mod);
    setMobileOpen(false);
  }

  return (
    <div style={S.app}>
      <style>{FONT_IMPORT}{RESPONSIVE_CSS}</style>

      <div className={`done-mobile-topbar`} style={{ alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: C.ink }}>
        <button onClick={() => setMobileOpen(true)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", display: "flex" }}><Menu size={22} /></button>
        <div style={{ ...S.wordmark, color: "#fff", padding: 0 }}>D.O.N.E</div>
        <div style={{ width: 22 }} />
      </div>

      <div className={`done-sidebar-overlay ${mobileOpen ? "open" : ""}`} onClick={() => setMobileOpen(false)} />

      <Sidebar
        active={activeModule}
        setActive={goTo}
        profile={session.user}
        onLogout={() => { clearSession(); setSession(null); }}
        coachResult={coachResult}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="done-content-wrap" style={S.content}>
        {activeModule === "overview" && <VisaoGeral coachResult={coachResult} goTo={goTo} />}
        {activeModule === "coach" && <ComercialCoach goTo={goTo} onResult={setCoachResult} />}
        {activeModule === "vendas" && <FerramentaVendas />}
        {activeModule === "gestao" && <FerramentaGestao />}
      </div>
    </div>
  );
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", company: "", email: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const fn = mode === "login" ? api.login : api.register;
      const { token, user } = await fn(form);
      onAuth(token, user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ fontFamily: "Inter, sans-serif", minHeight: "100vh", background: C.paper }}>
      <style>{FONT_IMPORT}{RESPONSIVE_CSS}</style>
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", minHeight: "100vh" }} className="done-auth-grid">

        <div style={{ background: C.ink, color: "#fff", padding: "48px 64px", display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", overflow: "hidden" }}>
          <div style={{ zIndex: 2 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 22, letterSpacing: 2, color: C.gold }}>D.O.N.E</div>
            <div style={{ fontSize: 10.5, letterSpacing: "0.12em", color: "#8A8F9C", marginTop: 4 }}>COMMERCIAL OPERATING SYSTEM</div>
          </div>

          <RadialGraphic />

          <div style={{ zIndex: 2 }}>
            <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", color: C.gold, marginBottom: 10 }}>PLATAFORMA</div>
            <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 34, lineHeight: 1.25, margin: 0 }}>
              Clareza para decidir.<br /><span style={{ color: C.gold }}>Disciplina para executar.</span>
            </h1>
            <p style={{ fontSize: 14, color: "#C7CAD4", lineHeight: 1.6, marginTop: 14, maxWidth: 360 }}>
              Diagnóstico, execução e gestão comercial num único lugar — comece pelo Comercial Coach, gratuito.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 28, fontSize: 11.5, color: "#8A8F9C" }}>
              <ShieldCheck size={14} /> Dados seguros. Decisões melhores.
            </div>
          </div>
        </div>

        <div style={{ background: C.card, padding: "48px 64px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ maxWidth: 380, width: "100%", margin: "0 auto" }}>
          <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 26, margin: "0 0 6px", color: C.ink }}>
            {mode === "login" ? "Entrar na plataforma" : "Criar sua conta"}
          </h2>
          <p style={{ fontSize: 13, color: C.inkSoft, marginBottom: 22 }}>
            {mode === "login" ? "Bem-vindo de volta." : "Leva menos de um minuto."}
          </p>

          {mode === "register" && (
            <>
              <input style={S.input} placeholder="Seu nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submit()} />
              <input style={{ ...S.input, marginTop: 10 }} placeholder="Nome da empresa" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submit()} />
            </>
          )}
          <input style={{ ...S.input, marginTop: mode === "register" ? 10 : 0 }} placeholder="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submit()} />
          <div style={{ position: "relative", marginTop: 10 }}>
            <input style={{ ...S.input, paddingRight: 40 }} placeholder="Senha" type={showPw ? "text" : "password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submit()} />
            <button type="button" onClick={() => setShowPw((s) => !s)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.muted, cursor: "pointer", display: "flex" }}>
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && <div style={{ color: C.danger, fontSize: 12.5, marginTop: 10 }}>{error}</div>}

          <button style={{ ...S.primaryBtn, marginTop: 18, width: "100%", justifyContent: "center", opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={submit}>
            {busy ? "Aguarde..." : mode === "login" ? "Entrar →" : "Criar conta →"}
          </button>

          <button
            style={{ background: "none", border: "none", color: C.inkSoft, fontSize: 12.5, marginTop: 16, cursor: "pointer", textDecoration: "underline", display: "block" }}
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Não tem conta? Criar uma agora" : "Já tem conta? Entrar"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.muted }}>
            <ShieldCheck size={13} /> Ambiente seguro e seus dados protegidos
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RadialGraphic() {
  return (
    <svg viewBox="0 0 400 260" style={{ position: "absolute", right: -40, top: "50%", transform: "translateY(-50%)", width: 420, opacity: 0.9, zIndex: 1 }}>
      <defs>
        <radialGradient id="doneGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={C.gold} stopOpacity="0.9" />
          <stop offset="100%" stopColor={C.gold} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="doneBeam" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={C.gold} stopOpacity="0.5" />
          <stop offset="100%" stopColor={C.gold} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="230" y1="130" x2="400" y2="230" stroke="url(#doneBeam)" strokeWidth="60" strokeLinecap="round" />
      {[100, 75, 50, 25].map((r) => (
        <circle key={r} cx="230" cy="130" r={r} fill="none" stroke={C.gold} strokeOpacity="0.25" strokeWidth="1" />
      ))}
      <circle cx="230" cy="130" r="20" fill="url(#doneGlow)" />
      <circle cx="230" cy="130" r="5" fill={C.gold} />
    </svg>
  );
}

function InviteAcceptScreen({ token, onAuth }) {
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ name: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.inviteInfo(token).then(setInfo).catch(() => setInfo(false));
  }, [token]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { token: t, user } = await api.inviteAccept(token, form);
      onAuth(t, user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (info === null) return <div style={{ ...S.app, alignItems: "center", justifyContent: "center" }}><style>{FONT_IMPORT}</style></div>;

  if (info === false) {
    return (
      <div style={{ ...S.app, alignItems: "center", justifyContent: "center" }}>
        <style>{FONT_IMPORT}</style>
        <div style={{ textAlign: "center" }}>
          <div style={S.wordmark}>D.O.N.E</div>
          <p style={{ ...S.lead, marginTop: 16 }}>Esse convite é inválido ou já expirou.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...S.app, alignItems: "center", justifyContent: "center" }}>
      <style>{FONT_IMPORT}</style>
      <div style={{ maxWidth: 380, width: "100%", padding: 32 }}>
        <div style={S.wordmark}>D.O.N.E</div>
        <h1 style={{ ...S.h1, fontSize: 24, marginTop: 16 }}>Bem-vindo à {info.orgName}</h1>
        <p style={{ ...S.lead, marginBottom: 22 }}>Você foi convidado como vendedor. Crie sua senha para {info.email}.</p>
        <input style={S.input} placeholder="Seu nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input style={{ ...S.input, marginTop: 10 }} placeholder="Crie uma senha" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {error && <div style={{ color: C.danger, fontSize: 12.5, marginTop: 10 }}>{error}</div>}
        <button style={{ ...S.primaryBtn, marginTop: 16, width: "100%", justifyContent: "center", opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={submit}>
          {busy ? "Aguarde..." : "Entrar na equipe →"}
        </button>
      </div>
    </div>
  );
}

function Sidebar({ active, setActive, profile, onLogout, coachResult, mobileOpen, onCloseMobile }) {
  const isMaster = profile.role === "master";
  const items = [
    { key: "overview", label: "Visão Geral", icon: LayoutGrid },
    { key: "coach", label: "Comercial Coach", icon: Activity },
    { key: "vendas", label: "Ferramenta de Vendas", icon: Trello },
    ...(isMaster ? [{ key: "gestao", label: "Ferramenta de Gestão", icon: BarChart2 }] : []),
  ];

  const dims = coachResult ? [
    { key: "processo", label: "Processo", v: coachResult.dimProcesso },
    { key: "preco", label: "Preço", v: coachResult.dimPreco },
    { key: "time", label: "Time", v: coachResult.dimTime },
    { key: "pipeline", label: "Pipeline", v: coachResult.dimPipeline },
  ] : [];
  const weakest = dims.length ? [...dims].sort((a, b) => a.v - b.v)[0] : null;

  return (
    <>
      <aside className={`done-sidebar ${mobileOpen ? "open" : ""}`} style={S.sidebar}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={S.wordmark}>D.O.N.E</div>
            <div style={{ fontSize: 9.5, letterSpacing: "0.1em", color: C.muted, padding: "0 10px" }}>COMMERCIAL OPERATING SYSTEM</div>
          </div>
          <button onClick={onCloseMobile} style={{ display: mobileOpen ? "flex" : "none", background: "none", border: "none", color: C.inkSoft, cursor: "pointer" }}><X size={18} /></button>
        </div>

        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: C.gold, padding: "20px 10px 8px" }}>NAVEGAÇÃO</div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((it) => {
            const Icon = it.icon;
            const isActive = active === it.key;
            return (
              <button key={it.key} onClick={() => setActive(it.key)}
                style={{ ...S.navItem, background: isActive ? C.ink : "transparent", color: isActive ? C.paper : C.inkSoft, position: "relative" }}>
                {isActive && <span style={{ position: "absolute", left: -16, top: 8, bottom: 8, width: 3, borderRadius: 3, background: C.gold }} />}
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: isActive ? C.gold : C.paper, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={13} color={isActive ? "#fff" : C.inkSoft} />
                </span>
                <span style={S.navLabel}>{it.label}</span>
              </button>
            );
          })}
        </nav>

        {coachResult && (
          <div style={{ marginTop: 24, background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: C.gold }}>NOTA COMERCIAL</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 6 }}>
              <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 26, color: "#fff" }}>{coachResult.final}</span>
              <span style={{ fontSize: 11, color: C.muted }}>/100</span>
            </div>
            {weakest && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.08)" }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", color: C.muted }}>FOCO DA SEMANA</div>
                <div style={{ fontSize: 12.5, color: "#fff", fontWeight: 600, marginTop: 4 }}>{weakest.label}</div>
                <div style={{ fontSize: 11, color: C.muted }}>nota {Math.round(weakest.v)} — sua prioridade agora</div>
              </div>
            )}
          </div>
        )}

        <div style={{ fontFamily: FONT_DISPLAY, fontStyle: "italic", fontSize: 12.5, color: "#8A8F9C", lineHeight: 1.5, marginTop: 24, padding: "0 10px" }}>
          "Clareza para decidir.<br />Disciplina para executar."
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", alignItems: "center", gap: 10, borderTop: `1px solid rgba(255,255,255,.08)`, paddingTop: 16, marginTop: 16 }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 12, color: "#fff", flexShrink: 0 }}>
            {profile.name?.[0]?.toUpperCase() || "?"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.name}</div>
            <div style={{ fontSize: 10.5, color: C.muted }}>{profile.role === "master" ? "Master" : "Vendedor"}</div>
          </div>
          <button onClick={onLogout} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 11 }}>Sair</button>
        </div>
      </aside>
    </>
  );
}

