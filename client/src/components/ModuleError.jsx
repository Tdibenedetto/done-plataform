import React from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { C, S, FONT_DISPLAY } from "../theme.js";

// Tela de "não consegui carregar" — usada quando o módulo falha por rede ou erro do servidor.
// É diferente da tela de plano bloqueado: aqui o cliente pode ter o plano em dia, e o que ele
// precisa é de um botão para tentar de novo, não de um convite para assinar.
export default function ModuleError({ title, message, onRetry }) {
  return (
    <div style={S.moduleCol}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 32, display: "flex", flexDirection: "column", gap: 14, alignItems: "center", textAlign: "center", maxWidth: 480, margin: "40px auto" }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: C.dangerSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <WifiOff size={22} color={C.danger} />
        </div>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 18 }}>{title || "Não foi possível carregar"}</div>
        <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, margin: 0 }}>
          {message || "Não foi possível carregar esta tela agora."}
        </p>
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, margin: 0 }}>
          Isso não tem relação com o seu plano. Seus dados continuam salvos.
        </p>
        {onRetry && (
          <button style={S.primaryBtn} onClick={onRetry}><RefreshCw size={14} /> Tentar novamente</button>
        )}
      </div>
    </div>
  );
}
