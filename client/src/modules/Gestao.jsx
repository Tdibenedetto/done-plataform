import React, { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Upload, X, List, Target, Lightbulb, Link2 } from "lucide-react";
import { C, S, FONT_DISPLAY } from "../theme.js";
import { api, loadSession } from "../lib/api.js";

const fmtBRL = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const MES_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const currentMonthKey = () => new Date().toISOString().slice(0, 7);

const SAMPLE_CSV = `mes,categoria,produto,sku,valor,margem,estoque
Mar,Utilidades Domésticas,Jogo de Panelas,UD-1042,42000,34,ok
Abr,Eletroportáteis,Liquidificador,EP-220,38000,22,ruptura
Mai,Decoração,Vaso Cerâmica,DEC-330,29000,41,excesso
Jun,Organização,Caixa Organizadora,ORG-018,35000,29,ruptura
Jul,Utilidades Domésticas,Panela Pressão,UD-1090,41000,31,ok
Ago,Decoração,Espelho Decorativo,DEC-410,26000,38,ok`;

export default function FerramentaGestao() {
  const isMaster = loadSession()?.user?.role === "master";
  const [data, setData] = useState(null); // null=loading; { uploads, rows }
  const [goals, setGoals] = useState([]);
  const [leads, setLeads] = useState([]);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showSkus, setShowSkus] = useState(false);
  const [mapNotice, setMapNotice] = useState(null);

  async function reload() {
    const [all, gs, ls] = await Promise.all([api.gestaoAll(), api.gestaoGoals(), api.leadsList()]);
    setData(all);
    setGoals(gs);
    setLeads(ls);
  }
  useEffect(() => { reload(); }, []);

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setMapNotice(null);
    try {
      const result = await api.gestaoUpload(file);
      if (result.autoMapped) {
        setMapNotice("A planilha não estava no formato padrão — a IA identificou as colunas automaticamente.");
      }
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function loadSample() {
    setUploading(true);
    try {
      const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
      const file = new File([blob], "exemplo.csv", { type: "text/csv" });
      await api.gestaoUpload(file);
      await reload();
    } finally {
      setUploading(false);
    }
  }

  async function saveMonthGoal(value) {
    await api.gestaoGoalSet({ month: currentMonthKey(), target: Number(value) || 0 });
    reload();
  }

  if (data === null) return <div style={{ color: C.muted, fontSize: 13 }}>Carregando...</div>;

  const rows = data.rows;

  if (rows.length === 0) {
    return (
      <div style={S.moduleCol}>
        <div>
          <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 24, margin: 0 }}>Ferramenta de Gestão</h2>
          <p style={{ fontSize: 14, color: C.inkSoft, margin: "4px 0 0" }}>Suba sua planilha e veja vendas, margem e estoque num único painel.</p>
        </div>
        <div style={{ border: `1.5px dashed ${C.border}`, borderRadius: 14, padding: 40, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <Upload size={28} color={C.gold} />
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 15 }}>Envie um arquivo CSV</div>
          <div style={{ fontSize: 12.5, color: C.muted, maxWidth: 400 }}>
            Pode ser sua planilha do jeito que já usa — a IA identifica as colunas automaticamente. Se preferir o formato exato, use: mes, categoria, produto, sku, valor, margem, estoque.
          </div>
          <label style={{ ...S.primaryBtnSm, cursor: "pointer" }}>
            {uploading ? "Enviando..." : "Selecionar arquivo"}
            <input type="file" accept=".csv" onChange={handleFile} style={{ display: "none" }} disabled={uploading} />
          </label>
          <button style={S.ghostBtn} onClick={loadSample} disabled={uploading}>ou carregar dados de exemplo</button>
          {error && <div style={{ color: C.danger, fontSize: 12 }}>{error}</div>}
        </div>
      </div>
    );
  }

  // Faturamento por mês, combinando TODOS os uploads já feitos (histórico real, não só o último envio).
  const byMonth = {};
  rows.forEach((r) => { byMonth[r.mes] = (byMonth[r.mes] || 0) + r.valor; });
  const monthOrder = MES_ABBR.filter((m) => byMonth[m] !== undefined);
  const monthData = monthOrder.map((mes) => ({ mes, valor: byMonth[mes] }));

  const byCat = {}, catCount = {};
  rows.forEach((r) => { byCat[r.categoria] = (byCat[r.categoria] || 0) + r.margem; catCount[r.categoria] = (catCount[r.categoria] || 0) + 1; });
  const catData = Object.entries(byCat).map(([categoria, sum]) => ({ categoria, margem: Math.round(sum / catCount[categoria]) }));

  // Estoque: pega o status mais recente de cada SKU (evita alerta duplicado/desatualizado entre uploads antigos).
  const latestBySku = {};
  rows.forEach((r) => {
    if (!r.sku) return;
    if (!latestBySku[r.sku] || new Date(r._uploadDate) > new Date(latestBySku[r.sku]._uploadDate)) {
      latestBySku[r.sku] = r;
    }
  });
  const alerts = Object.values(latestBySku).filter((r) => r.estoque === "ruptura" || r.estoque === "excesso");

  const total = rows.reduce((s, r) => s + r.valor, 0);
  const thisMonthLabel = MES_ABBR[new Date().getMonth()];
  const thisMonthRevenue = byMonth[thisMonthLabel] || 0;
  const monthGoal = goals.find((g) => g.month === currentMonthKey());
  const monthTarget = monthGoal ? monthGoal.target : 0;
  const monthPct = monthTarget ? Math.min(100, Math.round((thisMonthRevenue / monthTarget) * 100)) : 0;

  // Drill-down por SKU: agrega faturamento total e margem média de cada SKU em todos os uploads.
  const skuAgg = {};
  rows.forEach((r) => {
    if (!r.sku) return;
    if (!skuAgg[r.sku]) skuAgg[r.sku] = { sku: r.sku, produto: r.produto, categoria: r.categoria, valor: 0, margens: [] };
    skuAgg[r.sku].valor += r.valor;
    skuAgg[r.sku].margens.push(r.margem);
  });
  const skuList = Object.values(skuAgg)
    .map((s) => ({ ...s, margemMedia: Math.round(s.margens.reduce((a, b) => a + b, 0) / s.margens.length), estoque: latestBySku[s.sku]?.estoque }))
    .sort((a, b) => b.valor - a.valor);

  // -------- Insight prescritivo: sugestões automáticas a partir dos dados já enviados --------
  const skuHistory = {};
  rows.forEach((r) => {
    if (!r.sku) return;
    if (!skuHistory[r.sku]) skuHistory[r.sku] = [];
    skuHistory[r.sku].push({ status: r.estoque, date: new Date(r._uploadDate) });
  });
  Object.values(skuHistory).forEach((h) => h.sort((a, b) => a.date - b.date));

  function daysInCurrentStatus(sku) {
    const hist = skuHistory[sku];
    if (!hist || !hist.length) return 0;
    const latestStatus = hist[hist.length - 1].status;
    let streakStart = hist[hist.length - 1].date;
    for (let i = hist.length - 1; i >= 0; i--) {
      if (hist[i].status !== latestStatus) break;
      streakStart = hist[i].date;
    }
    return Math.max(0, Math.round((hist[hist.length - 1].date - streakStart) / (1000 * 60 * 60 * 24)));
  }

  const overallAvgMargin = rows.length ? rows.reduce((s, r) => s + r.margem, 0) / rows.length : 0;

  // -------- Visão cruzada: vendas fechadas (Ferramenta de Vendas) x margem por categoria (Ferramenta de Gestão) --------
  const closedLeads = leads.filter((l) => ["Fechado", "Carteira", "Faturado Total"].includes(l.stage) && l.categoria);
  const marginByCategoria = {};
  catData.forEach((c) => { marginByCategoria[c.categoria] = c.margem; });

  const bySeller = {};
  closedLeads.forEach((l) => {
    const seller = l.assignedUser?.name || "Sem vendedor";
    if (!bySeller[seller]) bySeller[seller] = { total: 0, weightedMargin: 0, knownMarginTotal: 0 };
    bySeller[seller].total += l.value;
    // Usa a margem real informada no lead quando existir; senão, cai na média da categoria.
    const margin = l.margemReal !== null && l.margemReal !== undefined ? l.margemReal : marginByCategoria[l.categoria];
    if (margin !== undefined) {
      bySeller[seller].weightedMargin += l.value * margin;
      bySeller[seller].knownMarginTotal += l.value;
    }
  });
  const sellerCross = Object.entries(bySeller).map(([seller, d]) => ({
    seller,
    total: d.total,
    avgMargin: d.knownMarginTotal ? Math.round(d.weightedMargin / d.knownMarginTotal) : null,
  })).sort((a, b) => b.total - a.total);

  const insights = [];
  alerts.forEach((a) => {
    const days = daysInCurrentStatus(a.sku);
    if (a.estoque === "ruptura") {
      insights.push({
        tone: C.danger,
        text: days > 0
          ? `"${a.produto}" (${a.sku}) está sem estoque há ${days} dias entre uploads — considere reposição prioritária.`
          : `"${a.produto}" (${a.sku}) apareceu em ruptura nesta última planilha — vale confirmar o estoque real.`,
      });
    } else if (a.estoque === "excesso" && days >= 30) {
      insights.push({
        tone: C.gold,
        text: `"${a.produto}" (${a.sku}) está parado em excesso há ${days} dias — considere promoção ou desconto para girar o estoque.`,
      });
    }
  });
  catData.forEach((c) => {
    if (overallAvgMargin > 0 && c.margem < overallAvgMargin - 5) {
      insights.push({
        tone: C.ink,
        text: `A categoria "${c.categoria}" está com margem de ${c.margem}%, abaixo da média geral (${Math.round(overallAvgMargin)}%) — vale revisar a precificação.`,
      });
    }
  });

  return (
    <div style={S.moduleCol}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 24, margin: 0 }}>Ferramenta de Gestão</h2>
          <p style={{ fontSize: 14, color: C.inkSoft, margin: "4px 0 0" }}>
            {data.uploads.length} {data.uploads.length === 1 ? "planilha enviada" : "planilhas enviadas"} · última em {new Date(data.uploads[data.uploads.length - 1].createdAt).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.ghostBtn} onClick={() => setShowSkus((s) => !s)}><List size={14} /> {showSkus ? "Ocultar SKUs" : "Ver por SKU"}</button>
          <label style={{ ...S.ghostBtn, cursor: "pointer" }}>
            <Upload size={14} /> {uploading ? "Enviando..." : "Nova planilha"}
            <input type="file" accept=".csv" onChange={handleFile} style={{ display: "none" }} disabled={uploading} />
          </label>
        </div>
      </div>
      {error && <div style={{ color: C.danger, fontSize: 12 }}>{error}</div>}
      {mapNotice && (
        <div style={{ background: C.goldSoft, color: C.gold, fontSize: 12, padding: "8px 12px", borderRadius: 8 }}>
          ✨ {mapNotice}
        </div>
      )}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, display: "flex", alignItems: "center", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 4 }}><Target size={11} /> Meta do mês ({thisMonthLabel})</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 19 }}>
            {fmtBRL(thisMonthRevenue)} <span style={{ fontWeight: 400, fontSize: 13, color: C.muted }}>de {fmtBRL(monthTarget)}</span>
          </div>
        </div>
        <div style={{ flex: 1, height: 8, background: C.border, borderRadius: 999, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${monthPct}%`, background: C.sage, borderRadius: 999 }} />
        </div>
        {isMaster ? (
          <input style={{ ...S.input, width: 120, padding: "6px 10px", fontSize: 12 }} placeholder="Meta R$"
            defaultValue={monthTarget || ""} onBlur={(e) => saveMonthGoal(e.target.value)} />
        ) : (
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, color: C.sage }}>{monthPct}%</div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        <StatCard label="Faturamento total (histórico)" value={fmtBRL(total)} />
        <StatCard label="Ticket médio por linha" value={fmtBRL(Math.round(total / rows.length))} />
        <StatCard label="Alertas de estoque" value={`${alerts.length} SKUs`} tone={alerts.length ? C.danger : C.sage} />
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14.5, marginBottom: 12 }}>Faturamento por mês (todas as planilhas combinadas)</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthData}>
            <CartesianGrid stroke={C.border} vertical={false} />
            <XAxis dataKey="mes" tick={{ fill: C.inkSoft, fontSize: 12, fontFamily: "Inter" }} axisLine={{ stroke: C.border }} tickLine={false} />
            <YAxis tick={{ fill: C.muted, fontSize: 11, fontFamily: "Inter" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip formatter={(v) => fmtBRL(v)} contentStyle={{ borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: "Inter", fontSize: 13 }} />
            <Bar dataKey="valor" fill={C.gold} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14.5, marginBottom: 12 }}>Margem média por categoria</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {catData.map((m) => (
              <div key={m.categoria} style={{ display: "grid", gridTemplateColumns: "130px 1fr 34px", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 12, color: C.inkSoft }}>{m.categoria}</div>
                <div style={{ height: 7, background: C.border, borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, m.margem * 2)}%`, background: C.sage, borderRadius: 999 }} />
                </div>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 12, fontWeight: 600, textAlign: "right" }}>{m.margem}%</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14.5, marginBottom: 12 }}>Alertas de estoque</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {alerts.length === 0 && <div style={{ fontSize: 12.5, color: C.muted }}>Nenhum alerta na planilha atual.</div>}
            {alerts.map((a) => (
              <div key={a.sku} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{a.produto}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{a.sku}</div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, padding: "4px 9px", borderRadius: 999, background: a.estoque === "ruptura" ? C.dangerSoft : C.goldSoft, color: a.estoque === "ruptura" ? C.danger : C.gold }}>
                  {a.estoque === "ruptura" ? "Ruptura" : "Excesso"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {insights.length > 0 && (
        <div style={{ background: C.ink, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.gold, fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14.5 }}>
            <Lightbulb size={16} /> Sugestões para essa operação
          </div>
          {insights.map((ins, i) => (
            <div key={i} style={{ display: "flex", gap: 10, fontSize: 12.5, lineHeight: 1.5, color: "#E2E4EA" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: ins.tone === C.danger ? "#E27C63" : ins.tone === C.gold ? C.gold : C.sage, marginTop: 6, flexShrink: 0 }} />
              <span>{ins.text}</span>
            </div>
          ))}
        </div>
      )}

      {sellerCross.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14.5, marginBottom: 4 }}>
            <Link2 size={15} color={C.gold} /> Vendas x Margem por vendedor
          </div>
          <p style={{ fontSize: 11.5, color: C.muted, margin: "0 0 14px" }}>
            Cruza os negócios fechados na Ferramenta de Vendas (por categoria) com a margem real dessa categoria nesta planilha.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sellerCross.map((s) => {
              const belowAvg = s.avgMargin !== null && overallAvgMargin > 0 && s.avgMargin < overallAvgMargin - 5;
              return (
                <div key={s.seller} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{s.seller}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{fmtBRL(s.total)} fechados em categorias com margem cruzada</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: belowAvg ? C.danger : C.sage, fontFamily: FONT_DISPLAY }}>
                    {s.avgMargin === null ? "—" : `${s.avgMargin}% margem méd.`}
                    {belowAvg && <div style={{ fontSize: 10, fontWeight: 400, color: C.muted }}>abaixo da média geral</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showSkus && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14.5, marginBottom: 12 }}>Todos os SKUs (histórico combinado)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 1fr 100px 80px 90px", gap: 8, fontSize: 10.5, color: C.muted, fontWeight: 600, padding: "0 8px 8px", borderBottom: `1px solid ${C.border}` }}>
              <span>SKU</span><span>Produto</span><span>Categoria</span><span>Faturamento</span><span>Margem</span><span>Estoque</span>
            </div>
            {skuList.map((s) => (
              <div key={s.sku} style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 1fr 100px 80px 90px", gap: 8, fontSize: 12, padding: "8px", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ color: C.muted }}>{s.sku}</span>
                <span>{s.produto}</span>
                <span style={{ color: C.inkSoft }}>{s.categoria}</span>
                <span style={{ fontFamily: FONT_DISPLAY, color: C.gold, fontWeight: 600 }}>{fmtBRL(s.valor)}</span>
                <span>{s.margemMedia}%</span>
                <span style={{ color: s.estoque === "ruptura" ? C.danger : s.estoque === "excesso" ? C.gold : C.sage }}>{s.estoque || "ok"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 11.5, color: C.muted }}>{label}</div>
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 19, color: tone || C.ink }}>{value}</div>
    </div>
  );
}

