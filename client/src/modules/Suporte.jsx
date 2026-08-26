import React, { useState, useEffect, useRef } from "react";
import { LifeBuoy, CheckCircle2, Send } from "lucide-react";
import { C, S, FONT_DISPLAY } from "../theme.js";
import { api } from "../lib/api.js";

function fmtWhen(iso) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function Suporte() {
  const [threads, setThreads] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  async function reload() {
    setThreads(await api.chatThreadsInbox());
  }
  useEffect(() => { reload(); }, []);

  async function openThread(id) {
    setActiveId(id);
    setDetail(await api.chatThreadGet(id));
  }

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [detail]);

  async function sendReply() {
    const content = reply.trim();
    if (!content || !activeId) return;
    setBusy(true);
    setReply("");
    try {
      const { messages } = await api.chatThreadReply(activeId, content);
      setDetail((d) => ({ ...d, messages }));
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function resolve() {
    if (!activeId) return;
    setBusy(true);
    try {
      await api.chatThreadResolve(activeId);
      setActiveId(null);
      setDetail(null);
      reload();
    } finally {
      setBusy(false);
    }
  }

  if (threads === null) return <div style={{ color: C.muted, fontSize: 13 }}>Carregando...</div>;

  const open = threads.filter((t) => t.status === "escalated");
  const resolved = threads.filter((t) => t.status === "resolved");

  return (
    <div style={S.moduleCol}>
      <div>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 24, margin: 0 }}>Suporte</h2>
        <p style={{ fontSize: 14, color: C.inkSoft, margin: "4px 0 0" }}>Conversas do chat da plataforma que pediram para falar com um humano.</p>
      </div>

      {open.length === 0 && resolved.length === 0 && (
        <div style={{ border: `1.5px dashed ${C.border}`, borderRadius: 14, padding: 32, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <LifeBuoy size={24} color={C.gold} />
          <div style={{ fontSize: 13, color: C.muted }}>Nenhuma conversa escalada ainda.</div>
        </div>
      )}

      {open.length > 0 && (
        <ThreadList title="Aguardando resposta" items={open} activeId={activeId} onOpen={openThread} />
      )}

      {activeId && detail && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14.5 }}>{detail.thread.user?.name}</div>
            {detail.thread.status !== "resolved" && (
              <button onClick={resolve} disabled={busy} style={{ ...S.ghostBtn, fontSize: 11.5, padding: "6px 10px" }}>
                <CheckCircle2 size={13} /> Marcar como resolvida
              </button>
            )}
          </div>
          <div ref={scrollRef} style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, background: C.paper, borderRadius: 10, padding: 12 }}>
            {detail.messages.map((m) => (
              <div key={m.id} style={{ display: "flex", justifyContent: m.role === "support" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "80%", borderRadius: 10, padding: "8px 11px", fontSize: 12.5, lineHeight: 1.4,
                  background: m.role === "support" ? C.ink : C.card,
                  color: m.role === "support" ? "#fff" : C.ink,
                  border: m.role === "support" ? "none" : `1px solid ${C.border}`,
                  overflowWrap: "break-word", wordBreak: "break-word",
                }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.05em", color: m.role === "support" ? C.gold : C.muted, marginBottom: 2 }}>
                    {m.role === "user" ? "USUÁRIO" : m.role === "assistant" ? "IA" : "VOCÊ"}
                  </div>
                  {m.content}
                </div>
              </div>
            ))}
          </div>
          {detail.thread.status !== "resolved" && (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendReply()}
                placeholder="Responder como suporte..."
                style={{ ...S.input, flex: 1, minWidth: 0 }}
              />
              <button onClick={sendReply} disabled={busy || !reply.trim()} style={{ ...S.primaryBtnSm, flexShrink: 0 }}>
                <Send size={13} />
              </button>
            </div>
          )}
        </div>
      )}

      {resolved.length > 0 && (
        <ThreadList title="Resolvidas" items={resolved} activeId={activeId} onOpen={openThread} muted />
      )}
    </div>
  );
}

function ThreadList({ title, items, activeId, onOpen, muted }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14.5, marginBottom: 12, color: muted ? C.muted : C.ink }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((t) => (
          <button key={t.id} onClick={() => onOpen(t.id)} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, textAlign: "left",
            background: activeId === t.id ? C.goldSoft : C.paper, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: "10px 12px", cursor: "pointer", fontFamily: "Inter",
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{t.user?.name}</div>
              <div style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.messages[0]?.content || "Sem mensagens"}
              </div>
            </div>
            <div style={{ fontSize: 10.5, color: C.muted, flexShrink: 0 }}>{fmtWhen(t.updatedAt)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
