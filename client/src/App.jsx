import React, { useState, useEffect } from "react";
import { Activity, Trello, BarChart2 } from "lucide-react";
import { C, S } from "./theme.js";
import { api, saveSession, loadSession, clearSession } from "./lib/api.js";
import ComercialCoach from "./modules/ComercialCoach.jsx";
import FerramentaVendas from "./modules/Vendas.jsx";
import FerramentaGestao from "./modules/Gestao.jsx";

const FONT = `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');`;

export default function App() {
  const [session, setSession] = useState(() => loadSession());
  const [activeModule, setActiveModule] = useState("coach");

  // Rota pública de convite: /convite/:token (funciona mesmo sem sessão ativa)
  const path = window.location.pathname;
  if (path.startsWith("/convite/")) {
    const token = path.replace("/convite/", "");
    return <InviteAcceptScreen token={token} onAuth={(t, u) => { saveSession(t, u); setSession({ token: t, user: u }); window.history.replaceState(null, "", "/"); }} />;
  }

  if (!session) {
    return <AuthScreen onAuth={(token, user) => { saveSession(token, user); setSession({ token, user }); }} />;
  }

  return (
    <div style={S.app}>
      <style>{FONT}</style>
      <Sidebar
        active={activeModule}
        setActive={setActiveModule}
        profile={session.user}
        onLogout={() => { clearSession(); setSession(null); }}
      />
      <div style={S.content}>
        {activeModule === "coach" && <ComercialCoach goTo={setActiveModule} />}
        {activeModule === "vendas" && <FerramentaVendas />}
        {activeModule === "gestao" && <FerramentaGestao />}
      </div>
    </div>
  );
}

function InviteAcceptScreen({ token, onAuth }) {
  const [info, setInfo] = useState(null); // null=loading, false=inválido
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

  if (info === null) return <div style={{ ...S.app, alignItems: "center", justifyContent: "center" }}><style>{FONT}</style></div>;

  if (info === false) {
    return (
      <div style={{ ...S.app, alignItems: "center", justifyContent: "center" }}>
        <style>{FONT}</style>
        <div style={{ textAlign: "center" }}>
          <div style={S.wordmark}>D.O.N.E</div>
          <p style={{ ...S.lead, marginTop: 16 }}>Esse convite é inválido ou já expirou.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...S.app, alignItems: "center", justifyContent: "center" }}>
      <style>{FONT}</style>
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

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [form, setForm] = useState({ name: "", company: "", email: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

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
    <div style={{ fontFamily: "Inter, sans-serif", minHeight: "100vh", display: "grid", gridTemplateColumns: "1.1fr 1fr" }}>
      <style>{FONT}</style>

      <div style={{ background: C.ink, color: "#fff", padding: "56px 60px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: 2, color: C.gold }}>D.O.N.E</div>
        <div>
          <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 12, letterSpacing: "0.08em", color: C.gold, marginBottom: 14 }}>PLATAFORMA</div>
          <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 38, lineHeight: 1.15, margin: 0, maxWidth: 420 }}>
            Sua operação comercial, sob controle.
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "#C7CAD4", maxWidth: 380, marginTop: 18 }}>
            Diagnóstico, execução e gestão comercial num único lugar — comece pelo Comercial Coach, gratuito.
          </p>
        </div>
        <div style={{ fontSize: 12, color: C.muted }}>donestrategy.com</div>
      </div>

      <div style={{ background: C.paper, display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <div style={{ maxWidth: 360, width: "100%" }}>
          <h2 style={{ ...S.h1, fontSize: 24, margin: "0 0 6px" }}>
            {mode === "login" ? "Entrar na plataforma" : "Criar sua conta"}
          </h2>
          <p style={{ fontSize: 13, color: C.inkSoft, marginBottom: 22 }}>
            {mode === "login" ? "Bem-vindo de volta." : "Leva menos de um minuto."}
          </p>

          {mode === "register" && (
            <>
              <input style={S.input} placeholder="Seu nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input style={{ ...S.input, marginTop: 10 }} placeholder="Nome da empresa" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </>
          )}
          <input style={{ ...S.input, marginTop: 10 }} placeholder="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input style={{ ...S.input, marginTop: 10 }} placeholder="Senha" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />

          {error && <div style={{ color: C.danger, fontSize: 12.5, marginTop: 10 }}>{error}</div>}

          <button style={{ ...S.primaryBtn, marginTop: 18, width: "100%", justifyContent: "center", opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={submit}>
            {busy ? "Aguarde..." : mode === "login" ? "Entrar →" : "Criar conta →"}
          </button>

          <button
            style={{ background: "none", border: "none", color: C.inkSoft, fontSize: 12.5, marginTop: 16, cursor: "pointer", textDecoration: "underline" }}
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Não tem conta? Criar uma agora" : "Já tem conta? Entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ active, setActive, profile, onLogout }) {
  const isMaster = profile.role === "master";
  const items = [
    { key: "coach", label: "Comercial Coach", sub: "Diagnóstico", icon: Activity },
    { key: "vendas", label: "Ferramenta de Vendas", sub: "Pipeline & Metas", icon: Trello },
    ...(isMaster ? [{ key: "gestao", label: "Ferramenta de Gestão", sub: "Dashboard & Estoque", icon: BarChart2 }] : []),
  ];
  return (
    <aside style={S.sidebar}>
      <div style={S.wordmark}>D.O.N.E</div>
      <div style={S.sidebarSub}>{profile.company || profile.name}</div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10, flex: 1 }}>
        {items.map((it) => {
          const Icon = it.icon;
          const isActive = active === it.key;
          return (
            <button key={it.key} onClick={() => setActive(it.key)}
              style={{ ...S.navItem, background: isActive ? C.ink : "transparent", color: isActive ? C.paper : C.inkSoft, position: "relative" }}>
              {isActive && <span style={{ position: "absolute", left: -16, top: 8, bottom: 8, width: 3, borderRadius: 3, background: C.gold }} />}
              <Icon size={16} style={{ flexShrink: 0 }} />
              <span style={{ display: "flex", flexDirection: "column", gap: 1, textAlign: "left" }}>
                <span style={S.navLabel}>{it.label}</span>
                <span style={{ ...S.navSub, color: isActive ? C.goldSoft : C.muted }}>{it.sub}</span>
              </span>
            </button>
          );
        })}
      </nav>
      <button onClick={onLogout} style={{ ...S.ghostBtn, justifyContent: "center" }}>Sair</button>
    </aside>
  );
}

