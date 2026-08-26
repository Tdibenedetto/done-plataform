// Same design tokens used across every D.O.N.E deliverable (brand book, pitch deck, prototypes).
export const C = {
  paper: "#FAF9F5", card: "#FFFFFF", ink: "#1C2130", inkSoft: "#4B5163",
  muted: "#8A8F9C", border: "#E5E2D9", gold: "#B8863A", goldSoft: "#F1E3CB",
  sage: "#3B6B57", sageSoft: "#DCE8E1", danger: "#A6462F", dangerSoft: "#F3E1DB",
};

// Fonte serifada nova, usada em todos os títulos de destaque (novo guideline visual).
export const FONT_DISPLAY = "'Lora', Georgia, serif";
export const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,500;0,600;0,700;1,600&family=Inter:wght@400;500;600;700&display=swap');`;

// Breakpoint único usado em toda a plataforma para o comportamento mobile.
export const RESPONSIVE_CSS = `
  .done-sidebar { transition: left .25s ease; }
  .done-mobile-topbar { display: none; }
  .done-sidebar-overlay { display: none; }
  @media (max-width: 860px) {
    .done-sidebar { position: fixed; left: -280px; top: 0; bottom: 0; width: 260px; z-index: 100; box-shadow: 8px 0 30px rgba(0,0,0,.25); }
    .done-sidebar.open { left: 0; }
    .done-mobile-topbar { display: flex !important; position: fixed; top: 0; left: 0; right: 0; z-index: 80; }
    .done-content-wrap { padding-top: 66px !important; padding-left: 16px !important; padding-right: 16px !important; max-width: 100% !important; }
    .done-sidebar-overlay.open { display: block; position: fixed; inset: 0; background: rgba(10,14,26,.45); z-index: 90; }
    .done-auth-grid { grid-template-columns: 1fr !important; max-width: 420px !important; }
    .done-auth-grid > div:first-child { min-height: 220px !important; padding: 32px 28px !important; }
    .done-auth-grid > div:first-child h1 { font-size: 22px !important; }
    .done-auth-grid > div:first-child svg { display: none; }
    .done-metrics-grid { grid-template-columns: 1fr !important; }
    .done-two-col-grid { grid-template-columns: 1fr !important; }
    .done-chat-panel { right: 12px !important; left: 12px !important; width: auto !important; max-width: none !important; bottom: 78px !important; height: min(70vh, 520px) !important; }
  }
`;

export const S = {
  app: { fontFamily: "Inter, sans-serif", background: C.paper, color: C.ink, minHeight: "100vh", display: "flex" },
  sidebar: { width: 240, background: C.ink, color: "#C7CAD4", padding: "24px 16px", display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto" },
  wordmark: { fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 18, padding: "0 10px", color: C.gold },
  sidebarSub: { fontSize: 11.5, color: C.muted, padding: "0 10px", marginBottom: 6 },
  navItem: { textAlign: "left", border: "none", borderRadius: 10, padding: "10px 12px", display: "flex", gap: 10, alignItems: "center", cursor: "pointer" },
  navLabel: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 13.5, fontWeight: 600 },
  navSub: { fontSize: 11 },
  content: { flex: 1, padding: "36px 40px", maxWidth: 940, overflowY: "auto" },
  moduleCol: { display: "flex", flexDirection: "column", gap: 22 },
  eyebrow: { fontFamily: "Inter", fontWeight: 700, fontSize: 12, letterSpacing: "0.08em", color: C.gold },
  h1: { fontFamily: FONT_DISPLAY, fontSize: 34, fontWeight: 700, lineHeight: 1.1, margin: "8px 0" },
  lead: { fontSize: 15, lineHeight: 1.6, color: C.inkSoft, margin: 0 },
  input: { fontFamily: "Inter", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", width: "100%", boxSizing: "border-box" },
  primaryBtn: { fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 14, background: C.ink, color: C.paper, border: "none", borderRadius: 8, padding: "12px 20px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 },
  primaryBtnSm: { fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 12.5, background: C.ink, color: C.paper, border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 },
  ghostBtn: { fontFamily: "Inter", fontWeight: 500, fontSize: 13, background: "transparent", color: C.inkSoft, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 14px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 },
  qCard: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 12 },
  moveBtn: { border: `1px solid ${C.border}`, background: C.paper, borderRadius: 5, fontSize: 9, width: 20, height: 20, cursor: "pointer", color: C.inkSoft, display: "flex", alignItems: "center", justifyContent: "center" },
};

