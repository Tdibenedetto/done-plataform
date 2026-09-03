import React, { useState, useEffect } from "react";
import { CreditCard, Search, Upload, CheckCircle2, XCircle, Building2, History, Bell, BellOff, AlertTriangle } from "lucide-react";
import { C, S, FONT_DISPLAY } from "../theme.js";
import { api, loadSession } from "../lib/api.js";

const fmtBRL = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function Credito() {
  const [history, setHistory] = useState(null);
  const [locked, setLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState(null);
  const [cnpjInput, setCnpjInput] = useState("");
  const [busyCnpj, setBusyCnpj] = useState(false);
  const [error, setError] = useState(null);
  const [current, setCurrent] = useState(null); // análise ativa sendo trabalhada
  const [uploadingBalanco, setUploadingBalanco] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [granting, setGranting] = useState(false);
  const [togglingMonitor, setTogglingMonitor] = useState(false);
  const [testingMonitor, setTestingMonitor] = useState(false);
  const [monitorTestMsg, setMonitorTestMsg] = useState(null);
  const isMaster = loadSession()?.user?.role === "master";
  const isPlatformAdmin = loadSession()?.user?.isPlatformAdmin;

  async function reload() {
    try {
      setHistory(await api.creditoList());
    } catch (e) {
      setLocked(true);
      setLockMessage(e.message);
    }
  }
  useEffect(() => { reload(); }, []);

  async function toggleMonitoring() {
    if (!current) return;
    setTogglingMonitor(true);
    try {
      const updated = await api.creditoSetMonitoring(current.id, !current.monitoring);
      setCurrent(updated);
      reload();
    } finally {
      setTogglingMonitor(false);
    }
  }

  // Igual a toggleMonitoring, mas a partir de qualquer item da lista do Histórico
  // (não precisa abrir o card pra ligar/desligar o monitoramento).
  async function toggleMonitoringFor(item) {
    const updated = await api.creditoSetMonitoring(item.id, !item.monitoring);
    setHistory((prev) => prev.map((h) => (h.id === item.id ? updated : h)));
    if (current?.id === item.id) setCurrent(updated);
  }

  async function testMonitorNow() {
    setTestingMonitor(true);
    setMonitorTestMsg(null);
    try {
      const r = await api.creditoMonitorTest();
      setMonitorTestMsg(`${r.checked} CNPJ(s) checado(s), ${r.changed} mudança(s) encontrada(s).`);
      reload();
      if (current) {
        const fresh = (await api.creditoList()).find((h) => h.id === current.id);
        if (fresh) setCurrent(fresh);
      }
    } catch (e) {
      setMonitorTestMsg(e.message);
    } finally {
      setTestingMonitor(false);
    }
  }

  async function grantTestAccess() {
    setGranting(true);
    try {
      await api.teamGrantTestAccess(["gestao"]);
      setLocked(false);
      setHistory(null);
      await reload();
    } catch (e) {
      setLockMessage(e.message);
    } finally {
      setGranting(false);
    }
  }

  async function buscarCnpj() {
    setError(null);
    setBusyCnpj(true);
    try {
      const result = await api.creditoCnpj(cnpjInput);
      setCurrent(result);
      setCnpjInput("");
      reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyCnpj(false);
    }
  }

  async function handleBalanco(e) {
    const file = e.target.files[0];
    if (!file || !current) return;
    setUploadingBalanco(true);
    setError(null);
    try {
      const result = await api.creditoBalanco(current.id, file);
      setCurrent(result);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingBalanco(false);
    }
  }

  if (locked) {
    return (
      <div style={S.moduleCol}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 32, display: "flex", flexDirection: "column", gap: 14, alignItems: "center", textAlign: "center", maxWidth: 480, margin: "40px auto" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CreditCard size={22} color="#fff" />
          </div>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 18 }}>Análise de Crédito</div>
          <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, margin: 0 }}>{lockMessage || "Este recurso é exclusivo para assinantes de Vendas, Gestão ou do Pacote Completo."}</p>
          {isPlatformAdmin && (
            <button style={S.ghostBtn} disabled={granting} onClick={grantTestAccess}>
              {granting ? "Liberando..." : "Liberar acesso de teste (sem cobrar)"}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (history === null) return <div style={{ color: C.muted, fontSize: 13 }}>Carregando...</div>;

  return (
    <div style={S.moduleCol}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 24, margin: 0 }}>Análise de Crédito</h2>
          <p style={{ fontSize: 14, color: C.inkSoft, margin: "4px 0 0" }}>Consulte o CNPJ e, se quiser, analise o balanço para sugestão de limite.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {isMaster && (
            <button style={S.ghostBtn} disabled={testingMonitor} onClick={testMonitorNow}>
              {testingMonitor ? "Checando..." : "Testar monitoramento agora"}
            </button>
          )}
          <button style={S.ghostBtn} onClick={() => setShowHistory((s) => !s)}><History size={14} /> Histórico</button>
        </div>
      </div>

      {monitorTestMsg && <div style={{ fontSize: 12, color: C.inkSoft }}>{monitorTestMsg}</div>}

      <div style={{ background: C.goldSoft, borderRadius: 10, padding: "10px 14px", fontSize: 11.5, color: C.inkSoft, lineHeight: 1.5 }}>
        ⚠️ Esta é uma análise interna, baseada em dados públicos da Receita Federal e nos números do balanço enviado — <strong>não é uma consulta a birô de crédito oficial</strong> (Serasa, Boa Vista). Use como apoio à decisão, não como resposta definitiva.
      </div>

      {showHistory && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>Análises anteriores</div>
          <p style={{ fontSize: 11, color: C.muted, margin: "0 0 12px" }}>Clique no sino para ligar/desligar o monitoramento contínuo de cada CNPJ.</p>
          {history.length === 0 && <div style={{ fontSize: 12, color: C.muted }}>Nenhuma análise feita ainda.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.map((h) => (
              <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}`, padding: "8px 0" }}>
                <button onClick={() => setCurrent(h)} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", textAlign: "left", flex: 1, minWidth: 0 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{h.companyName || h.cnpj}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{h.requestedBy?.name} · {new Date(h.createdAt).toLocaleDateString("pt-BR")}</div>
                  </div>
                  {h.status && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 9px", borderRadius: 999, background: h.status === "aprovado" ? C.sageSoft : C.dangerSoft, color: h.status === "aprovado" ? C.sage : C.danger, flexShrink: 0 }}>
                      {h.status === "aprovado" ? "Aprovado" : "Reprovado"}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => toggleMonitoringFor(h)}
                  title={h.monitoring ? "Desativar monitoramento" : "Ativar monitoramento"}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 8px", flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}
                >
                  {h.monitoring ? <Bell size={15} color={C.gold} /> : <BellOff size={15} color={C.muted} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!current && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, display: "flex", flexDirection: "column", gap: 14, alignItems: "center", textAlign: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CreditCard size={20} color="#fff" />
          </div>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16 }}>Análise Básica</div>
          <p style={{ fontSize: 12.5, color: C.inkSoft, maxWidth: 380 }}>Digite o CNPJ do cliente — buscamos a situação cadastral, atividade e data de abertura direto na Receita Federal.</p>
          <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 340 }}>
            <input style={S.input} placeholder="00.000.000/0000-00" value={cnpjInput} onChange={(e) => setCnpjInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscarCnpj()} />
            <button style={S.primaryBtnSm} disabled={busyCnpj} onClick={buscarCnpj}><Search size={13} /> {busyCnpj ? "Buscando..." : "Buscar"}</button>
          </div>
          {error && <div style={{ color: C.danger, fontSize: 12 }}>{error}</div>}
        </div>
      )}

      {current && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <Building2 size={18} color={C.gold} />
              <div>
                <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16 }}>{current.companyName || "Empresa"}</div>
                <div style={{ fontSize: 11.5, color: C.muted }}>{current.cnpj}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, fontSize: 12.5 }}>
              <div><span style={{ color: C.muted }}>Situação: </span><strong style={{ color: current.situacao === "ATIVA" ? C.sage : C.danger }}>{current.situacao || "—"}</strong></div>
              <div><span style={{ color: C.muted }}>Aberta em: </span><strong>{current.dataAbertura ? new Date(current.dataAbertura).toLocaleDateString("pt-BR") : "—"}</strong></div>
              <div style={{ gridColumn: "1 / -1" }}><span style={{ color: C.muted }}>Atividade: </span><strong>{current.atividade || "—"}</strong></div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12, color: C.inkSoft, display: "flex", alignItems: "center", gap: 6 }}>
                {current.monitoring ? <Bell size={13} color={C.gold} /> : <BellOff size={13} color={C.muted} />}
                Monitoramento contínuo {current.monitoring ? "ativo" : "desativado"}
                {current.monitoring && current.lastCheckedAt && (
                  <span style={{ color: C.muted }}>· última checagem {new Date(current.lastCheckedAt).toLocaleDateString("pt-BR")}</span>
                )}
              </div>
              <button style={S.ghostBtn} disabled={togglingMonitor} onClick={toggleMonitoring}>
                {togglingMonitor ? "..." : current.monitoring ? "Desativar" : "Monitorar este CNPJ"}
              </button>
            </div>

            {current.alerts?.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                {current.alerts.map((a) => (
                  <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 11.5, color: C.inkSoft, background: C.dangerSoft, borderRadius: 8, padding: "8px 10px" }}>
                    <AlertTriangle size={13} color={C.danger} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>Situação mudou de <strong>{a.previousSituacao || "—"}</strong> para <strong>{a.newSituacao}</strong> em {new Date(a.createdAt).toLocaleDateString("pt-BR")}</span>
                  </div>
                ))}
              </div>
            )}

            <button style={{ ...S.ghostBtn, marginTop: 14, fontSize: 11.5 }} onClick={() => { setCurrent(null); setError(null); }}>← Nova consulta</button>
          </div>

          {!current.hasFinancials && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15 }}>Análise Avançada (opcional)</div>
              <p style={{ fontSize: 12.5, color: C.inkSoft, margin: 0 }}>Suba o balanço patrimonial e/ou DRE (PDF) do cliente para receber uma sugestão de limite de crédito.</p>
              <label style={{ ...S.primaryBtnSm, cursor: "pointer" }}>
                <Upload size={13} /> {uploadingBalanco ? "Analisando..." : "Subir balanço (PDF)"}
                <input type="file" accept="application/pdf" onChange={handleBalanco} style={{ display: "none" }} disabled={uploadingBalanco} />
              </label>
              {error && <div style={{ color: C.danger, fontSize: 12 }}>{error}</div>}
            </div>
          )}

          {current.hasFinancials && current.status && (
            <div style={{ background: current.status === "aprovado" ? C.sageSoft : C.dangerSoft, borderRadius: 14, padding: 24, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {current.status === "aprovado" ? <CheckCircle2 size={22} color={C.sage} /> : <XCircle size={22} color={C.danger} />}
                <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 18, color: current.status === "aprovado" ? C.sage : C.danger }}>
                  {current.status === "aprovado" ? "Crédito recomendado" : "Crédito não recomendado"}
                </div>
              </div>
              {current.status === "aprovado" ? (
                <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 28, color: C.ink }}>{fmtBRL(current.limiteSugerido)}</div>
              ) : (
                <p style={{ fontSize: 13, color: C.inkSoft, margin: 0 }}>{current.motivoRecusa}</p>
              )}
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                Receita: {current.receita ? fmtBRL(current.receita) : "—"} · Lucro líquido: {current.lucroLiquido ? fmtBRL(current.lucroLiquido) : "—"}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

