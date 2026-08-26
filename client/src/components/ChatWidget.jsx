import React, { useState, useEffect, useRef } from "react";
import { MessageCircle, X, Send, UserRound } from "lucide-react";
import { C, FONT_DISPLAY } from "../theme.js";
import { api } from "../lib/api.js";

const GREETING = {
  role: "assistant",
  content: "Oi! Posso te ajudar a entender qualquer parte da plataforma D.O.N.E. O que você quer saber?",
};

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(false);
  const scrollRef = useRef(null);
  const pollRef = useRef(null);

  async function load() {
    try {
      const { thread: t, messages: m } = await api.chatThread();
      setThread(t);
      setMessages(m);
    } catch (e) {
      console.error("[chat] falha ao carregar conversa:", e.message);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    if (open && !loaded) load();
  }, [open]);

  // Enquanto a conversa está escalada, faz polling leve para pegar respostas do suporte humano.
  useEffect(() => {
    if (open && thread?.status === "escalated") {
      pollRef.current = setInterval(async () => {
        try {
          const { thread: t, messages: m } = await api.chatThread();
          setThread(t);
          if (m.length > messages.length && !open) setUnread(true);
          setMessages(m);
        } catch { /* silencioso */ }
      }, 8000);
      return () => clearInterval(pollRef.current);
    }
  }, [open, thread?.status, messages.length]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  function toggle() {
    setOpen((o) => !o);
    setUnread(false);
  }

  async function send() {
    const content = input.trim();
    if (!content || sending) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", content, createdAt: new Date().toISOString(), _pending: true }]);
    try {
      const { messages: m } = await api.chatSend(content);
      setMessages(m);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Não consegui enviar sua mensagem agora. Tente de novo." }]);
    } finally {
      setSending(false);
    }
  }

  async function escalate() {
    setSending(true);
    try {
      const { messages: m } = await api.chatEscalate();
      setMessages(m);
      setThread((t) => ({ ...t, status: "escalated" }));
    } catch { /* silencioso */ } finally {
      setSending(false);
    }
  }

  const showEscalate = thread && thread.status !== "escalated" && thread.status !== "resolved";
  const displayMessages = messages.length ? messages : [GREETING];

  return (
    <>
      <button
        onClick={toggle}
        aria-label="Abrir chat de suporte"
        style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 130,
          width: 54, height: 54, borderRadius: "50%", border: "none",
          background: C.ink, color: C.gold, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 6px 20px rgba(28,33,48,.35)",
        }}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
        {unread && !open && (
          <span style={{ position: "absolute", top: 4, right: 4, width: 10, height: 10, borderRadius: "50%", background: C.danger, border: `2px solid ${C.ink}` }} />
        )}
      </button>

      {open && (
        <div className="done-chat-panel" style={{
          position: "fixed", bottom: 84, right: 20, zIndex: 129,
          width: 360, maxWidth: "calc(100vw - 32px)", height: 480, maxHeight: "calc(100vh - 120px)",
          background: C.card, borderRadius: 16, boxShadow: "0 12px 40px rgba(28,33,48,.28)",
          display: "flex", flexDirection: "column", overflow: "hidden", border: `1px solid ${C.border}`,
        }}>
          <div style={{ background: C.ink, color: "#fff", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div>
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14.5 }}>Suporte D.O.N.E</div>
              <div style={{ fontSize: 10.5, color: "#8A8F9C" }}>
                {thread?.status === "escalated" ? "Falando com o suporte" : "Assistente automático"}
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#C7CAD4", cursor: "pointer", display: "flex" }}><X size={18} /></button>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {displayMessages.map((m, i) => (
              <ChatBubble key={m.id || i} role={m.role} content={m.content} />
            ))}
            {sending && <ChatBubble role="assistant" content="digitando..." muted />}
          </div>

          {showEscalate && (
            <div style={{ padding: "0 14px 10px", flexShrink: 0 }}>
              <button onClick={escalate} disabled={sending} style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px",
                fontSize: 12, color: C.inkSoft, cursor: "pointer", fontFamily: "Inter",
              }}>
                <UserRound size={13} /> Falar com um humano
              </button>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Digite sua dúvida..."
              style={{ flex: 1, fontFamily: "Inter", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", boxSizing: "border-box", minWidth: 0 }}
            />
            <button onClick={send} disabled={sending || !input.trim()} style={{
              background: C.ink, color: C.gold, border: "none", borderRadius: 8, width: 38, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: sending ? 0.6 : 1,
            }}>
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ChatBubble({ role, content, muted }) {
  const isUser = role === "user";
  const isSupport = role === "support";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div style={{
        maxWidth: "82%", borderRadius: 12, padding: "9px 12px", fontSize: 13, lineHeight: 1.45,
        background: isUser ? C.ink : isSupport ? C.goldSoft : C.paper,
        color: isUser ? "#fff" : muted ? C.muted : C.ink,
        border: isUser ? "none" : `1px solid ${C.border}`,
        fontStyle: muted ? "italic" : "normal",
        overflowWrap: "break-word", wordBreak: "break-word",
      }}>
        {isSupport && <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.05em", color: C.gold, marginBottom: 3 }}>SUPORTE</div>}
        {content}
      </div>
    </div>
  );
}
