import React, { useState, useEffect, useMemo } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Plus, Trash2, Wallet, TrendingUp, TrendingDown, Upload } from "lucide-react";
import { C, S, FONT_DISPLAY } from "../theme.js";
import { api } from "../lib/api.js";

const MES_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const fmtBRL = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const TYPE_LABEL = { receita: "Receita", cmv: "CMV / Custo variável", despesa: "Despesa fixa", imposto: "Imposto" };
const CATEGORY_SUGGESTIONS = {
  receita: ["Vendas de produtos", "Serviços", "Outras receitas"],
  cmv: ["Custo da mercadoria vendida", "Frete de compra", "Comissão de venda"],
  despesa: ["Folha de pagamento", "Aluguel", "Marketing", "Softwares e ferramentas", "Contabilidade", "Outras despesas fixas"],
  imposto: ["Simples Nacional", "ICMS", "ISS", "Outros impostos"],
};

function last12Months() {
  const out = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MES_ABBR[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` });
  }
  return out;
}

export default function Dre() {
  const months = useMemo(() => last12Months(), []);
  const [month, setMonth] = useState(months[months.length - 1].key);
  const [entries, setEntries] = useState(null);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [draft, setDraft] = useState({ type: "receita", category: "", amount: "" });
  const [busy, setBusy] = useState(false);
  const [saldoDraft, setSaldoDraft] = useState("");
  const [savingSaldo, setSavingSaldo] = useState(false);
  const [pullingGestao, setPullingGestao] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);
  const [error, setError] = useState(null);
  const [locked, setLocked] = useState(null); // mensagem de bloqueio, se a org não tem o add-on ativo
  const [granting, setGranting] = useState(false);

  async function reload() {
    const r = await api.dreList();
    setEntries(r.entries);
    setSaldoInicial(r.saldoInicial);
    setSaldoDraft(String(r.saldoInicial));
  }
  useEffect(() => {
    reload().catch((e) => setLocked(e.message));
  }, []);

  async function grantTestAccess() {
    setGranting(true);
    try {
      await api.teamGrantTestAccess(["gestao", "dre"]);
      setLocked(null);
      setEntries(null);
      await reload();
    } catch (e) {
      setLocked(e.message);
    } finally {
      setGranting(false);
    }
  }

  const monthEntries = useMemo(() => (entries || []).filter((e) => e.month === month), [entries, month]);

  const dre = useMemo(() => {
    const sum = (type) => monthEntries.filter((e) => e.type === type).reduce((s, e) => s + e.amount, 0);
    const receitaBruta = sum("receita");
    const impostos = sum("imposto");
    const receitaLiquida = receitaBruta - impostos;
    const cmv = sum("cmv");
    const margemContribuicao = receitaLiquida - cmv;
    const despesas = sum("despesa");
    const resultado = margemContribuicao - despesas;
    return { receitaBruta, impostos, receitaLiquida, cmv, margemContribuicao, despesas, resultado };
  }, [monthEntries]);

  const fluxoCaixa = useMemo(() => {
    const byMonth = {};
    (entries || []).forEach((e) => {
      byMonth[e.month] = byMonth[e.month] || { receita: 0, cmv: 0, despesa: 0, imposto: 0 };
      byMonth[e.month][e.type] += e.amount;
    });
    let acumulado = saldoInicial;
    return months.map((m) => {
      const v = byMonth[m.key] || { receita: 0, cmv: 0, despesa: 0, imposto: 0 };
      const net = v.receita - v.cmv - v.despesa - v.imposto;
      acumulado += net;
      return { mes: m.label, Saldo: Math.round(acumulado), net };
    });
  }, [entries, months, saldoInicial]);

  async function addEntry() {
    const n = Number(draft.amount);
    if (!draft.category.trim() || isNaN(n) || n <= 0) {
      setError("Preencha categoria e um valor válido.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.dreAdd({ month, type: draft.type, category: draft.category.trim(), amount: n });
      setDraft({ type: draft.type, category: "", amount: "" });
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(id) {
    await api.dreDelete(id);
    reload();
  }

  async function saveSaldoInicial() {
    const n = Number(saldoDraft);
    if (isNaN(n)) return;
    setSavingSaldo(true);
    try {
      await api.dreSetSaldoInicial(n);
      await reload();
    } finally {
      setSavingSaldo(false);
    }
  }

  async function pullFromGestao() {
    setPullingGestao(true);
    setError(null);
    try {
      const { rows } = await api.gestaoAll();
      const label = MES_ABBR[Number(month.slice(5, 7)) - 1];
      const total = rows.filter((r) => r.mes === label).reduce((s, r) => s + r.valor, 0);
      if (total <= 0) {
        setError(`Não encontrei faturamento de "${label}" nos uploads da Gestão.`);
        return;
      }
      await api.dreAdd({ month, type: "receita", category: "Faturamento (Gestão)", amount: total });
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setPullingGestao(false);
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setUploadMsg(null);
    try {
      const r = await api.dreUpload(file);
      setUploadMsg(
        r.autoMapped
          ? `${r.imported} lançamento(s) importado(s) — colunas identificadas automaticamente pela IA.${r.skipped ? ` ${r.skipped} linha(s) ignorada(s) por falta de mês/valor.` : ""}`
          : `${r.imported} lançamento(s) importado(s).${r.skipped ? ` ${r.skipped} linha(s) ignorada(s) por falta de mês/valor.` : ""}`
      );
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  if (locked) {
    return (
      <div style={S.moduleCol}>
        <div>
          <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 24, margin: 0 }}>DRE Simplificado / Fluxo de Caixa</h2>
        </div>
        <div style={{ border: `1.5px dashed ${C.border}`, borderRadius: 14, padding: 32, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <Wallet size={24} color={C.gold} />
          <div style={{ fontSize: 13.5, color: C.inkSoft, maxWidth: 380 }}>{locked}</div>
          <button style={S.ghostBtn} disabled={granting} onClick={grantTestAccess}>
            {granting ? "Liberando..." : "Liberar acesso de teste (sem cobrar)"}
          </button>
        </div>
      </div>
    );
  }

  if (entries === null) return <div style={{ color: C.muted, fontSize: 13 }}>Carregando...</div>;

  return (
    <div style={S.moduleCol}>
      <div>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 24, margin: 0 }}>DRE Simplificado / Fluxo de Caixa</h2>
        <p style={{ fontSize: 14, color: C.inkSoft, margin: "4px 0 0" }}>Lançamentos manuais de receita, custo e despesa — visão simples de resultado e caixa, mês a mês.</p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...S.input, width: "auto", padding: "8px 12px" }}>
          {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <button style={S.ghostBtn} disabled={pullingGestao} onClick={pullFromGestao}>
          {pullingGestao ? "Puxando..." : "Puxar faturamento da Gestão"}
        </button>
        <label style={{ ...S.ghostBtn, cursor: "pointer" }}>
          <Upload size={14} /> {uploading ? "Enviando..." : "Subir planilha"}
          <input type="file" accept=".csv" onChange={handleUpload} style={{ display: "none" }} disabled={uploading} />
        </label>
      </div>

      {uploadMsg && <div style={{ fontSize: 12, color: C.sage }}>{uploadMsg}</div>}
      <div style={{ fontSize: 11, color: C.muted, marginTop: -8 }}>
        Aceita CSV em qualquer formato — a IA identifica as colunas. Se preferir montar na mão, use as colunas: mes, tipo (receita/cmv/despesa/imposto), categoria, valor.
      </div>

      {error && <div style={{ fontSize: 12, color: C.danger }}>{error}</div>}

      <div className="done-two-col-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 14 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14.5, marginBottom: 4 }}>DRE — {months.find((m) => m.key === month)?.label}</div>
          <DreLine label="Receita Bruta" value={dre.receitaBruta} />
          <DreLine label="(–) Impostos" value={-dre.impostos} sub />
          <DreLine label="= Receita Líquida" value={dre.receitaLiquida} strong />
          <DreLine label="(–) CMV / Custo variável" value={-dre.cmv} sub />
          <DreLine label="= Margem de Contribuição" value={dre.margemContribuicao} strong />
          <DreLine label="(–) Despesas Fixas" value={-dre.despesas} sub />
          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 10 }}>
            <DreLine label="= Resultado Operacional" value={dre.resultado} strong big />
          </div>
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14.5 }}><Wallet size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Fluxo de caixa acumulado</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11.5, color: C.inkSoft }}>Saldo inicial de caixa</span>
            <input type="number" style={{ ...S.input, width: 120, padding: "6px 10px" }} value={saldoDraft} onChange={(e) => setSaldoDraft(e.target.value)} />
            <button style={S.ghostBtn} disabled={savingSaldo} onClick={saveSaldoInicial}>{savingSaldo ? "..." : "Salvar"}</button>
          </div>
          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={fluxoCaixa}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: C.muted }} axisLine={{ stroke: C.border }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => fmtBRL(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}` }} />
                <Line type="monotone" dataKey="Saldo" stroke={C.gold} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14.5 }}>Novo lançamento — {months.find((m) => m.key === month)?.label}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value, category: "" })} style={{ ...S.input, width: "auto", padding: "8px 12px" }}>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input
            list={`cats-${draft.type}`}
            style={{ ...S.input, flex: 1, minWidth: 160 }}
            placeholder="Categoria"
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          />
          <datalist id={`cats-${draft.type}`}>
            {CATEGORY_SUGGESTIONS[draft.type].map((c) => <option key={c} value={c} />)}
          </datalist>
          <input type="number" style={{ ...S.input, width: 130 }} placeholder="Valor" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
          <button style={S.primaryBtnSm} disabled={busy} onClick={addEntry}><Plus size={14} /> Adicionar</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {monthEntries.length === 0 && <div style={{ fontSize: 12.5, color: C.muted }}>Nenhum lançamento neste mês ainda.</div>}
          {monthEntries.map((e) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
              <span>
                <span style={{ color: C.muted }}>{TYPE_LABEL[e.type]} · </span>
                {e.category}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, color: e.type === "receita" ? C.sage : C.danger }}>{fmtBRL(e.amount)}</span>
                <button onClick={() => removeEntry(e.id)} style={{ ...S.moveBtn, color: C.danger }}><Trash2 size={11} /></button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DreLine({ label, value, strong, sub, big }) {
  const positive = value >= 0;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={{ fontSize: big ? 13.5 : 12.5, color: sub ? C.muted : strong ? C.ink : C.inkSoft, fontWeight: strong ? 600 : 400 }}>{label}</span>
      <span style={{
        fontFamily: FONT_DISPLAY, fontWeight: strong ? 700 : 600, fontSize: big ? 18 : 13,
        color: !positive ? C.danger : big ? (positive ? C.sage : C.danger) : C.ink,
      }}>
        {fmtBRL(value)}
      </span>
    </div>
  );
}
