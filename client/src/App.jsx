import React, { Component, useState, useEffect } from "react";
import {
  Activity, Trello, BarChart2, LayoutGrid, Eye, EyeOff,
  ShieldCheck, Menu, X, ChevronRight, CreditCard, LifeBuoy, Wallet, Building2, Tag, Package,
} from "lucide-react";
import { C, S, FONT_DISPLAY, FONT_IMPORT, RESPONSIVE_CSS } from "./theme.js";
import { api, saveSession, loadSession, clearSession } from "./lib/api.js";
import ComercialCoach from "./modules/ComercialCoach.jsx";
import FerramentaVendas from "./modules/Vendas.jsx";
import FerramentaGestao from "./modules/Gestao.jsx";
import Credito from "./modules/Credito.jsx";
import Sortimento from "./modules/Sortimento.jsx";
import VisaoGeral from "./modules/VisaoGeral.jsx";
import AdminOverview from "./modules/AdminOverview.jsx";
import Planos from "./modules/Planos.jsx";
import Suporte from "./modules/Suporte.jsx";
import Dre from "./modules/Dre.jsx";
import ChatWidget from "./components/ChatWidget.jsx";

// Evita que um erro de renderização em UM módulo derrube a tela inteira em branco —
// mostra uma mensagem dentro da área de conteúdo, mantendo sidebar e navegação de pé.
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("[ErrorBoundary]", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, background: "#F3E1DB", border: "1px solid #A6462F", borderRadius: 12, color: "#A6462F" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Algo deu errado ao carregar esta tela.</div>
          <div style={{ fontSize: 13 }}>Tente novamente pelo menu lateral. Se persistir, avise o suporte.</div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Lê (uma única vez, no carregamento) o retorno do Stripe que vem na URL:
//  /billing/success?session_id=...&product=...  → pagamento concluído, falta confirmar e liberar
//  /billing/cancel                              → desistiu no meio do pagamento
//  /billing/portal-return                       → voltou do "Gerenciar assinatura"
function readBillingReturn() {
  const path = window.location.pathname;
  if (!path.startsWith("/billing/")) return null;
  const params = new URLSearchParams(window.location.search);
  const kind = path.startsWith("/billing/success") ? "success" : path.startsWith("/billing/portal-return") ? "portal" : "cancel";
  return { kind, product: params.get("product"), sessionId: params.get("session_id") };
}

export default function App() {
  const [session, setSession] = useState(() => loadSession());
  // Qualquer retorno do Stripe cai na tela de Planos, que confirma o pagamento e mostra o resultado.
  const [billingReturn, setBillingReturn] = useState(() => readBillingReturn());
  const [activeModule, setActiveModule] = useState(() => (window.location.pathname.startsWith("/billing/") ? "planos" : "overview"));
  const [coachResult, setCoachResult] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authNotice, setAuthNotice] = useState(null);

  const path = window.location.pathname;

  // Limpa a URL de retorno do Stripe (o conteúdo já foi guardado em billingReturn).
  useEffect(() => {
    if (window.location.pathname.startsWith("/billing/")) {
      window.history.replaceState(null, "", "/");
    }
  }, []);

  // Sessão vencida (o servidor respondeu 401): volta para o login com um aviso claro,
  // em vez de deixar as telas mostrando erro ou "plano bloqueado".
  useEffect(() => {
    function onExpired() {
      clearSession();
      setSession(null);
      setAuthNotice("Sua sessão expirou. Entre de novo para continuar.");
    }
    window.addEventListener("done-session-expired", onExpired);
    return () => window.removeEventListener("done-session-expired", onExpired);
  }, []);

  useEffect(() => {
    if (session) api.coachLatest().then(setCoachResult).catch(() => setCoachResult(null));
  }, [session]);

  function enter(token, user) {
    saveSession(token, user);
    setSession({ token, user });
    setAuthNotice(null);
    window.history.replaceState(null, "", "/");
  }

  // Rota pública de convite: /convite/:token
  if (path.startsWith("/convite/")) {
    const token = path.replace("/convite/", "");
    return <InviteAcceptScreen token={token} onAuth={enter} />;
  }
  // Rota pública de "esqueci minha senha": /redefinir-senha/:token (link enviado por e-mail)
  if (path.startsWith("/redefinir-senha/")) {
    const token = path.replace("/redefinir-senha/", "").replace(/\/+$/, "");
    return <ResetPasswordScreen token={token} onAuth={enter} onBackToLogin={() => window.location.assign("/")} />;
  }

  if (!session) {
    return (
      <AuthScreen
        notice={authNotice}
        onAuth={(token, user, planoToHighlight) => {
          saveSession(token, user);
          setSession({ token, user });
          setAuthNotice(null);
          if (planoToHighlight) {
            localStorage.setItem("done_highlight_plan", planoToHighlight);
            setActiveModule("planos");
          }
        }}
      />
    );
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
        <ErrorBoundary>
          {activeModule === "overview" && <VisaoGeral coachResult={coachResult} goTo={goTo} />}
          {activeModule === "coach" && <ComercialCoach goTo={goTo} onResult={setCoachResult} />}
          {activeModule === "vendas" && <FerramentaVendas goTo={goTo} />}
          {activeModule === "gestao" && <FerramentaGestao goTo={goTo} />}
          {activeModule === "credito" && <Credito goTo={goTo} />}
          {activeModule === "sortimento" && <Sortimento goTo={goTo} />}
          {activeModule === "planos" && <Planos goTo={goTo} billingReturn={billingReturn} onBillingReturnHandled={() => setBillingReturn(null)} />}
          {activeModule === "suporte" && session.user.isPlatformAdmin && <Suporte />}
          {activeModule === "dre" && <Dre goTo={goTo} />}
          {activeModule === "admin" && <AdminOverview />}
        </ErrorBoundary>
      </div>

      <ChatWidget />
    </div>
  );
}

function AuthScreen({ onAuth, notice }) {
  const [mode, setMode] = useState("login"); // "login" | "register" | "forgot"
  const [forgotSent, setForgotSent] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", email: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  // Vem do botão de plano no site institucional (ex: donestrategy.com/?plano=completo) —
  // preservado durante o cadastro para pré-destacar esse plano na tela de Planos depois.
  const planoParam = new URLSearchParams(window.location.search).get("plano");

  async function submit() {
    if (busy) return;
    // Conferência rápida antes de chamar o servidor — evita esperar uma resposta só para ver um erro óbvio.
    if (!form.email.trim()) return setError("Informe seu e-mail.");
    if (mode === "register" && !form.name.trim()) return setError("Informe seu nome.");
    if (mode === "register" && form.password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    if (mode === "login" && !form.password) return setError("Informe sua senha.");

    setBusy(true);
    setError(null);
    try {
      if (mode === "forgot") {
        await api.forgotPassword(form.email);
        setForgotSent(true);
        return;
      }
      const fn = mode === "login" ? api.login : api.register;
      const { token, user } = await fn(form);
      onAuth(token, user, mode === "register" ? planoParam : null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next) {
    setMode(next);
    setError(null);
    setForgotSent(false);
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
            {mode === "login" ? "Entrar na plataforma" : mode === "register" ? "Criar sua conta" : "Criar nova senha"}
          </h2>
          <p style={{ fontSize: 13, color: C.inkSoft, marginBottom: 22 }}>
            {mode === "login" ? "Bem-vindo de volta." : mode === "register" ? "Leva menos de um minuto." : "Informe o e-mail da sua conta e enviamos um link para você criar uma senha nova."}
          </p>

          {notice && mode === "login" && (
            <div style={{ background: C.goldSoft, color: "#8A6423", borderRadius: 8, padding: "10px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>{notice}</div>
          )}

          {mode === "forgot" && forgotSent ? (
            <div>
              <div style={{ background: C.sageSoft, color: C.sage, borderRadius: 10, padding: "14px 16px", fontSize: 13, lineHeight: 1.55 }}>
                <b>Confira seu e-mail.</b> Se existir uma conta com <b>{form.email.trim()}</b>, o link para criar a nova senha chega em alguns minutos. Ele vale por 1 hora.
              </div>
              <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginTop: 12 }}>Não chegou? Veja a caixa de spam ou confira se digitou o e-mail do cadastro.</p>
              <button style={{ ...S.primaryBtn, marginTop: 14, width: "100%", justifyContent: "center" }} onClick={() => switchMode("login")}>Voltar para o login</button>
            </div>
          ) : (
          <>

          {mode === "register" && (
            <>
              <input style={S.input} placeholder="Seu nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submit()} />
              <input style={{ ...S.input, marginTop: 10 }} placeholder="Nome da empresa" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submit()} />
            </>
          )}
          <input style={{ ...S.input, marginTop: mode === "register" ? 10 : 0 }} placeholder="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submit()} />
          {mode !== "forgot" && (
          <div style={{ position: "relative", marginTop: 10 }}>
            <input style={{ ...S.input, paddingRight: 40 }} placeholder={mode === "register" ? "Crie uma senha (mínimo 8 caracteres)" : "Senha"} type={showPw ? "text" : "password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submit()} />
            <button type="button" onClick={() => setShowPw((s) => !s)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.muted, cursor: "pointer", display: "flex" }}>
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          )}

          {mode === "login" && (
            <button
              style={{ background: "none", border: "none", color: C.inkSoft, fontSize: 12, marginTop: 8, cursor: "pointer", textDecoration: "underline", padding: 0 }}
              onClick={() => switchMode("forgot")}
            >
              Esqueci minha senha
            </button>
          )}

          {error && <div style={{ color: C.danger, fontSize: 12.5, marginTop: 10 }}>{error}</div>}

          <button style={{ ...S.primaryBtn, marginTop: 18, width: "100%", justifyContent: "center", opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={submit}>
            {busy ? "Aguarde..." : mode === "login" ? "Entrar →" : mode === "register" ? "Criar conta →" : "Enviar link por e-mail →"}
          </button>

          <button
            style={{ background: "none", border: "none", color: C.inkSoft, fontSize: 12.5, marginTop: 16, cursor: "pointer", textDecoration: "underline", display: "block" }}
            onClick={() => switchMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Não tem conta? Criar uma agora" : mode === "register" ? "Já tem conta? Entrar" : "Voltar para o login"}
          </button>
          </>
          )}

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
  const cx = 200, cy = 200;
  const rings = [50, 90, 130, 170];
  // Cone de varredura do radar — agora apontando na diagonal para baixo.
  const sweepAngle = 34; // largura do feixe, em graus
  const sweepDir = 55; // direção do feixe (graus; 0 = direita, 90 = baixo)
  const a1 = ((sweepDir - sweepAngle / 2) * Math.PI) / 180;
  const a2 = ((sweepDir + sweepAngle / 2) * Math.PI) / 180;
  const sweepR = 260;
  const x1 = cx + sweepR * Math.cos(a1), y1 = cy + sweepR * Math.sin(a1);
  const x2 = cx + sweepR * Math.cos(a2), y2 = cy + sweepR * Math.sin(a2);

  // Pequenas estrelas espalhadas, com posições fixas (determinísticas, sem Math.random no render).
  const stars = [
    [70, 60, 1.4], [330, 90, 1.1], [40, 260, 1.2], [360, 300, 1.6],
    [90, 340, 1], [300, 45, 1.3], [20, 150, 1], [370, 190, 1.2],
  ];

  return (
    <svg viewBox="0 0 400 400" style={{ position: "absolute", right: -60, top: "50%", transform: "translateY(-50%)", width: 440, opacity: 0.95, zIndex: 1 }}>
      <defs>
        <radialGradient id="doneGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={C.gold} stopOpacity="1" />
          <stop offset="100%" stopColor={C.gold} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="doneSweep" x1={cx} y1={cy} x2={x2} y2={y2} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={C.gold} stopOpacity="0.5" />
          <stop offset="100%" stopColor={C.gold} stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={`M ${cx} ${cy} L ${x1} ${y1} A ${sweepR} ${sweepR} 0 0 1 ${x2} ${y2} Z`} fill="url(#doneSweep)" />

      {rings.map((r) => (
        <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke={C.gold} strokeOpacity="0.22" strokeWidth="1" />
      ))}

      {stars.map(([sx, sy, r], i) => (
        <circle key={i} cx={sx} cy={sy} r={r} fill={C.gold} fillOpacity="0.5" />
      ))}

      <circle cx={cx} cy={cy} r="26" fill="url(#doneGlow)" />
      <circle cx={cx} cy={cy} r="4.5" fill={C.gold} />
    </svg>
  );
}

// Tela aberta pelo link do e-mail de "esqueci minha senha".
function ResetPasswordScreen({ token, onAuth, onBackToLogin }) {
  const [info, setInfo] = useState(null); // null = conferindo o link | false = link inválido | { email }
  const [invalidMsg, setInvalidMsg] = useState(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.resetInfo(token).then(setInfo).catch((e) => { setInvalidMsg(e.message); setInfo(false); });
  }, [token]);

  async function submit() {
    if (busy) return;
    if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    if (password !== confirm) return setError("As duas senhas não estão iguais.");
    setBusy(true);
    setError(null);
    try {
      const { token: t, user } = await api.resetPassword(token, password);
      onAuth(t, user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...S.app, alignItems: "center", justifyContent: "center" }}>
      <style>{FONT_IMPORT}</style>
      <div style={{ maxWidth: 380, width: "100%", padding: 32 }}>
        <div style={S.wordmark}>D.O.N.E</div>
        {info === null && <p style={{ ...S.lead, marginTop: 16 }}>Conferindo o link...</p>}
        {info === false && (
          <>
            <h1 style={{ ...S.h1, fontSize: 24, marginTop: 16 }}>Link inválido ou vencido</h1>
            <p style={{ ...S.lead, marginBottom: 22 }}>{invalidMsg || "Este link de redefinição não vale mais."} O link funciona uma única vez e por 1 hora.</p>
            <button style={{ ...S.primaryBtn, width: "100%", justifyContent: "center" }} onClick={onBackToLogin}>Voltar para o login</button>
          </>
        )}
        {info && (
          <>
            <h1 style={{ ...S.h1, fontSize: 24, marginTop: 16 }}>Criar nova senha</h1>
            <p style={{ ...S.lead, marginBottom: 22 }}>Para a conta {info.email}.</p>
            <input style={S.input} placeholder="Nova senha (mínimo 8 caracteres)" type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
            <input style={{ ...S.input, marginTop: 10 }} placeholder="Repita a nova senha" type={showPw ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.inkSoft, marginTop: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} /> Mostrar a senha
            </label>
            {error && <div style={{ color: C.danger, fontSize: 12.5, marginTop: 10 }}>{error}</div>}
            <button style={{ ...S.primaryBtn, marginTop: 16, width: "100%", justifyContent: "center", opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={submit}>
              {busy ? "Aguarde..." : "Salvar e entrar →"}
            </button>
          </>
        )}
      </div>
    </div>
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
        <input style={{ ...S.input, marginTop: 10 }} placeholder="Crie uma senha (mínimo 8 caracteres)" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {error && <div style={{ color: C.danger, fontSize: 12.5, marginTop: 10 }}>{error}</div>}
        <button style={{ ...S.primaryBtn, marginTop: 16, width: "100%", justifyContent: "center", opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={submit}>
          {busy ? "Aguarde..." : "Entrar na equipe →"}
        </button>
      </div>
    </div>
  );
}

const MODULE_HINT = { processo: "vendas", time: "vendas", preco: "gestao", pipeline: "gestao" };

function MiniRadar({ coachResult }) {
  const axes = [
    { label: "Nota", value: coachResult.final, angle: -90 },
    { label: "Processo", value: coachResult.dimProcesso, angle: -18 },
    { label: "Preço", value: coachResult.dimPreco, angle: 54 },
    { label: "Time", value: coachResult.dimTime, angle: 126 },
    { label: "Pipeline", value: coachResult.dimPipeline, angle: 198 },
  ];
  const cx = 90, cy = 78, R = 52;
  const pt = (angleDeg, r) => {
    const a = (angleDeg * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const outer = axes.map((ax) => pt(ax.angle, R).join(",")).join(" ");
  const mid = axes.map((ax) => pt(ax.angle, R * 0.55).join(",")).join(" ");
  const data = axes.map((ax) => pt(ax.angle, (Math.max(5, ax.value) / 100) * R).join(",")).join(" ");

  return (
    <svg viewBox="0 0 180 156" width="100%" height="150">
      <polygon points={outer} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      <polygon points={mid} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      <polygon points={data} fill={C.gold} fillOpacity="0.28" stroke={C.gold} strokeWidth="1.8" strokeLinejoin="round" />
      {axes.map((ax, i) => {
        const [dx, dy] = pt(ax.angle, (Math.max(5, ax.value) / 100) * R);
        const [lx, ly] = pt(ax.angle, R + 20);
        const anchor = Math.cos((ax.angle * Math.PI) / 180) > 0.3 ? "start" : Math.cos((ax.angle * Math.PI) / 180) < -0.3 ? "end" : "middle";
        return (
          <g key={i}>
            <circle cx={dx} cy={dy} r="2.8" fill={C.gold} />
            <text x={lx} y={ly - 3} fontSize="8" fill="#C7CAD4" fontFamily="Inter" textAnchor={anchor}>{ax.label}</text>
            <text x={lx} y={ly + 7} fontSize="9.5" fontWeight="700" fill="#fff" fontFamily="Inter" textAnchor={anchor}>{Math.round(ax.value)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Sidebar({ active, setActive, profile, onLogout, coachResult, mobileOpen, onCloseMobile }) {
  const isMaster = profile.role === "master";
  const items = [
    { key: "overview", label: "Visão Geral", icon: LayoutGrid },
    { key: "coach", label: "Comercial Coach", icon: Activity },
    { key: "vendas", label: "Ferramenta de Vendas", icon: Trello },
    ...(isMaster ? [{ key: "gestao", label: "Ferramenta de Gestão", icon: BarChart2 }] : []),
    { key: "credito", label: "Análise de Crédito", icon: CreditCard },
    ...(isMaster ? [{ key: "sortimento", label: "Gestão de Sortimento", icon: Package }] : []),
    ...(isMaster ? [{ key: "dre", label: "DRE / Fluxo de Caixa", icon: Wallet }] : []),
    { key: "planos", label: "Planos", icon: Tag },
    // Caixa de entrada do suporte: só o time D.O.N.E (Admin Geral) atende. Clientes falam pelo chat.
    ...(profile.isPlatformAdmin ? [{ key: "suporte", label: "Suporte", icon: LifeBuoy }] : []),
    ...(profile.isPlatformAdmin ? [{ key: "admin", label: "Admin Geral", icon: Building2 }] : []),
  ];

  const dims = coachResult ? [
    { key: "processo", label: "Processo", v: coachResult.dimProcesso },
    { key: "preco", label: "Preço", v: coachResult.dimPreco },
    { key: "time", label: "Time", v: coachResult.dimTime },
    { key: "pipeline", label: "Pipeline", v: coachResult.dimPipeline },
  ] : [];
  const weakest = dims.length ? [...dims].sort((a, b) => a.v - b.v)[0] : null;

  return (
    <aside className={`done-sidebar ${mobileOpen ? "open" : ""}`} style={S.sidebar}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={S.wordmark}>D.O.N.E</div>
          <div style={{ fontSize: 9.5, letterSpacing: "0.1em", color: "#6E7484", padding: "0 10px" }}>COMMERCIAL OPERATING SYSTEM</div>
        </div>
        <button onClick={onCloseMobile} style={{ display: mobileOpen ? "flex" : "none", background: "none", border: "none", color: "#C7CAD4", cursor: "pointer" }}><X size={18} /></button>
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: C.gold, padding: "20px 10px 8px" }}>NAVEGAÇÃO</div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((it) => {
          const Icon = it.icon;
          const isActive = active === it.key;
          return (
            <button key={it.key} onClick={() => setActive(it.key)}
              style={{ ...S.navItem, background: isActive ? "rgba(255,255,255,0.06)" : "transparent", color: isActive ? "#fff" : "#9099AB", position: "relative", fontWeight: isActive ? 600 : 500 }}>
              {isActive && <span style={{ position: "absolute", left: -16, top: 6, bottom: 6, width: 3, borderRadius: 3, background: C.gold }} />}
              <span style={{ width: 26, height: 26, borderRadius: "50%", background: isActive ? C.gold : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={13} color={isActive ? C.ink : "#9099AB"} />
              </span>
              <span style={S.navLabel}>{it.label}</span>
            </button>
          );
        })}
      </nav>

      {coachResult && (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: C.gold, padding: "22px 10px 10px" }}>INTELIGÊNCIA</div>
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: C.gold }}>NOTA COMERCIAL</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 6 }}>
              <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 26, color: "#fff" }}>{coachResult.final}</span>
              <span style={{ fontSize: 11, color: "#6E7484" }}>/100</span>
            </div>
            <MiniRadar coachResult={coachResult} />
          </div>

          {weakest && (
            <button onClick={() => setActive(MODULE_HINT[weakest.key])} style={{ marginTop: 10, background: "rgba(255,255,255,0.04)", border: "none", borderRadius: 12, padding: 14, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textAlign: "left", width: "100%" }}>
              <span style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Activity size={14} color={C.gold} />
              </span>
              <span style={{ flex: 1 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", color: "#6E7484" }}>FOCO DA SEMANA</div>
                <div style={{ fontSize: 12.5, color: "#fff", fontWeight: 600, marginTop: 2 }}>{weakest.label}</div>
                <div style={{ fontSize: 10.5, color: "#6E7484" }}>nota {Math.round(weakest.v)} — sua prioridade agora</div>
              </span>
              <ChevronRight size={14} color="#6E7484" />
            </button>
          )}
        </>
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
          <div style={{ fontSize: 10.5, color: "#6E7484" }}>{profile.role === "master" ? "Administrador" : "Vendedor"}</div>
        </div>
        <button onClick={onLogout} style={{ background: "none", border: "none", color: "#6E7484", cursor: "pointer", fontSize: 11 }}>Sair</button>
      </div>
    </aside>
  );
}

