// Same design tokens used across every D.O.N.E deliverable (brand book, pitch deck, prototypes).
export const C = {
  paper: "#FAF9F5", card: "#FFFFFF", ink: "#1C2130", inkSoft: "#4B5163",
  muted: "#8A8F9C", border: "#E5E2D9", gold: "#B8863A", goldSoft: "#F1E3CB",
  sage: "#3B6B57", sageSoft: "#DCE8E1", danger: "#A6462F", dangerSoft: "#F3E1DB",
};

export const S = {
  app: { fontFamily: "Inter, sans-serif", background: C.paper, color: C.ink, minHeight: "100vh", display: "flex" },
  sidebar: { width: 240, borderRight: `1px solid ${C.border}`, padding: "24px 16px", display: "flex", flexDirection: "column", flexShrink: 0 },
  wordmark: { fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 18, padding: "0 10px" },
  sidebarSub: { fontSize: 11.5, color: C.muted, padding: "0 10px", marginBottom: 6 },
  navItem: { textAlign: "left", border: "none", borderRadius: 10, padding: "10px 12px", display: "flex", gap: 10, alignItems: "center", cursor: "pointer" },
  navLabel: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 13.5, fontWeight: 600 },
  navSub: { fontSize: 11 },
  content: { flex: 1, padding: "36px 40px", maxWidth: 940, overflowY: "auto" },
  moduleCol: { display: "flex", flexDirection: "column", gap: 22 },
  eyebrow: { fontFamily: "Inter", fontWeight: 700, fontSize: 12, letterSpacing: "0.08em", color: C.gold },
  h1: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 34, fontWeight: 700, lineHeight: 1.1, margin: "8px 0" },
  lead: { fontSize: 15, lineHeight: 1.6, color: C.inkSoft, margin: 0 },
  input: { fontFamily: "Inter", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", width: "100%" },
  primaryBtn: { fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 14, background: C.ink, color: C.paper, border: "none", borderRadius: 8, padding: "12px 20px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 },
  primaryBtnSm: { fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 12.5, background: C.ink, color: C.paper, border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 },
  ghostBtn: { fontFamily: "Inter", fontWeight: 500, fontSize: 13, background: "transparent", color: C.inkSoft, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 14px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 },
  qCard: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 12 },
  moveBtn: { border: `1px solid ${C.border}`, background: C.paper, borderRadius: 5, fontSize: 9, width: 20, height: 20, cursor: "pointer", color: C.inkSoft, display: "flex", alignItems: "center", justifyContent: "center" },
};
