import React, { useState, useEffect } from "react";
import { Package, Plus, Upload, ArrowLeft, AlertTriangle } from "lucide-react";
import { C, S, FONT_DISPLAY } from "../theme.js";
import { api } from "../lib/api.js";

const fmtBRL = (n) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }));
const fmtPct = (n) => (n == null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%");
const fmtDate = (d) => new Date(d).toLocaleDateString("pt-BR");

const STATUS_LABEL = { ativo: "Ativo", pausado: "Pausado", descontinuado: "Descontinuado" };
const STATUS_BG = { ativo: C.sageSoft, pausado: C.goldSoft, descontinuado: "#EDEDEF" };
const STATUS_COLOR = { ativo: C.sage, pausado: "#8A6423", descontinuado: C.muted };
const ABC_BG = { A: C.sageSoft, B: C.goldSoft, C: "#EDEDEF" };
const ABC_COLOR = { A: C.sage, B: "#8A6423", C: C.muted };

function monthOptions() {
  const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const out = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push({ value: d.toISOString().slice(0, 10), label: `${meses[d.getMonth()]}/${d.getFullYear()}` });
  }
  return out;
}

function StatusBadge({ status }) {
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 99, background: STATUS_BG[status], color: STATUS_COLOR[status] }}>{STATUS_LABEL[status]}</span>;
}
function AbcBadge({ curva }) {
  if (!curva) return <span style={{ color: C.muted }}>—</span>;
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 99, background: ABC_BG[curva], color: ABC_COLOR[curva] }}>{curva}</span>;
}

export default function Sortimento({ goTo }) {
  const [locked, setLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState(null);
  const [payload, setPayload] = useState(null); // { criterio, produtos }
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("todos");
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);

  async function reload(criterio) {
    try {
      const r = await api.produtosList(criterio);
      setPayload(r);
    } catch (e) {
      setLocked(true);
      setLockMessage(e.message);
    }
  }
  useEffect(() => { reload(); }, []);

  async function setCriterio(criterio) {
    await api.produtosSetAbcCriterio(criterio).catch(() => {});
    reload(criterio);
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true); setUploadMsg(null); setError(null);
    try {
      const r = await api.produtosUpload(file);
      setUploadMsg(`${r.created} criado(s), ${r.updated} atualizado(s)${r.skipped ? `, ${r.skipped} linha(s) ignorada(s)` : ""}.`);
      reload(payload?.criterio);
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
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 32, display: "flex", flexDirection: "column", gap: 14, alignItems: "center", textAlign: "center", maxWidth: 480, margin: "40px auto" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Package size={22} color="#fff" />
          </div>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 18 }}>Gestão de Sortimento</div>
          <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, margin: 0 }}>{lockMessage || "Este recurso é exclusivo para assinantes de Vendas, Gestão ou do Pacote Completo."}</p>
          <button style={S.primaryBtn} onClick={() => goTo?.("planos")}>Ver planos</button>
        </div>
      </div>
    );
  }

  if (payload === null) return <div style={{ color: C.muted, fontSize: 13 }}>Carregando...</div>;

  const selected = selectedId ? payload.produtos.find((p) => p.id === selectedId) : null;
  if (selected) {
    return <ProdutoDetail produto={selected} onBack={() => { setSelectedId(null); reload(payload.criterio); }} onChanged={() => reload(payload.criterio)} />;
  }

  const produtos = payload.produtos;
  const curvaCount = { A: 0, B: 0, C: 0 };
  let abaixoCount = 0, terminoCount = 0;
  for (const p of produtos) {
    if (p.curva) curvaCount[p.curva]++;
    if (p.abaixoCobertura) abaixoCount++;
    if (p.terminoDeEstoque) terminoCount++;
  }
  const ativos = produtos.filter((p) => p.status === "ativo").length;

  const filtered = produtos.filter((p) => {
    if (filter === "A" || filter === "B" || filter === "C") return p.curva === filter;
    if (filter === "abaixo") return p.abaixoCobertura;
    if (filter === "termino") return p.terminoDeEstoque;
    return true;
  });

  return (
    <div style={S.moduleCol}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700, color: C.ink }}>Gestão de Sortimento</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>Catálogo, giro, curva ABC e cobertura de estoque — por produto.</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Curva ABC por:</span>
              <div style={{ display: "inline-flex", background: "#EDEBE4", borderRadius: 99, padding: 2, gap: 2 }}>
                {["giro", "faturamento"].map((c) => (
                  <div key={c} onClick={() => setCriterio(c)} style={{ fontSize: 11, fontWeight: 600, padding: "5px 11px", borderRadius: 99, cursor: "pointer", color: payload.criterio === c ? C.ink : C.muted, background: payload.criterio === c ? "#fff" : "transparent" }}>
                    {c === "giro" ? "Volume (giro)" : "Faturamento"}
                  </div>
                ))}
              </div>
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label style={{ ...S.ghostBtn, cursor: "pointer" }}>
            <Upload size={14} /> {uploading ? "Enviando..." : "Enviar planilha"}
            <input type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={handleUpload} disabled={uploading} />
          </label>
          <button style={S.primaryBtnSm} onClick={() => setShowNew((s) => !s)}><Plus size={14} /> Novo produto</button>
        </div>
      </div>

      {uploadMsg && <div style={{ fontSize: 12, color: C.sage }}>{uploadMsg}</div>}
      {error && <div style={{ fontSize: 12, color: C.danger }}>{error}</div>}
      {showNew && <NovoProdutoForm onCreated={() => { setShowNew(false); reload(payload.criterio); }} onCancel={() => setShowNew(false)} />}

      <div className="done-metrics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
        <StatCard label="SKUs Ativos" value={ativos} sub={`de ${produtos.length} cadastrados`} />
        <StatCard label="Curva A" value={curvaCount.A} color={C.sage} sub="80% do critério" />
        <StatCard label="Curva B" value={curvaCount.B} color={C.gold} sub="15% do critério" />
        <StatCard label="Curva C" value={curvaCount.C} sub="5% do critério" />
        <StatCard label="Abaixo da Cobertura" value={abaixoCount} color={C.danger} sub="precisam de reposição" />
        <StatCard label="Término de Estoque" value={terminoCount} color="#8A6423" sub="descontinuados, sem recompra" />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[["todos", `Todos (${produtos.length})`], ["A", `Curva A (${curvaCount.A})`], ["B", `Curva B (${curvaCount.B})`], ["C", `Curva C (${curvaCount.C})`], ["abaixo", `⚠ Abaixo da cobertura (${abaixoCount})`], ["termino", `Término de estoque (${terminoCount})`]].map(([key, label]) => (
          <div key={key} onClick={() => setFilter(key)} style={{ fontSize: 11.5, fontWeight: 600, padding: "7px 13px", borderRadius: 99, border: `1px solid ${filter === key ? C.ink : C.border}`, background: filter === key ? C.ink : C.card, color: filter === key ? "#fff" : C.ink, cursor: "pointer" }}>
            {label}
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 30, textAlign: "center" }}>
          <Package size={24} color={C.muted} />
          <div style={{ fontSize: 13, color: C.muted, marginTop: 10 }}>Nenhum produto aqui ainda. Cadastre manualmente ou envie uma planilha.</div>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr>
                {["Produto", "Categoria", "Curva", "Giro médio/mês", "Estoque atual", "Cobertura (atual → ideal)", "Status"].map((h) => (
                  <th key={h} style={{ textAlign: "left", fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, color: C.muted, textTransform: "uppercase", padding: "11px 14px", background: C.paper, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const pct = p.coberturaIdealDias && p.coberturaAtualDias != null ? Math.min(100, Math.round((p.coberturaAtualDias / p.coberturaIdealDias) * 100)) : 0;
                const barColor = p.abaixoCobertura ? C.danger : C.sage;
                return (
                  <tr key={p.id} onClick={() => setSelectedId(p.id)} style={{ cursor: "pointer", background: p.abaixoCobertura ? "#FBF3F0" : "transparent" }}>
                    <td style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ fontWeight: 700, color: C.ink, fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
                        {p.abaixoCobertura && <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.danger, display: "inline-block" }} />}
                        {p.produto}
                      </div>
                      <div style={{ fontSize: 10.5, color: C.muted }}>{p.sku}</div>
                    </td>
                    <td style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 12.5 }}>{p.categoria || "—"}</td>
                    <td style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}><AbcBadge curva={p.curva} /></td>
                    <td style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 12.5 }}>{p.giroMedioMensal != null ? `${p.giroMedioMensal} un` : "—"}</td>
                    <td style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 12.5 }}>{p.estoqueAtual} un</td>
                    <td style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
                      {p.coberturaIdealDias ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 70, height: 6, background: "#EDEBE4", borderRadius: 99, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 99 }} /></div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: barColor }}>{p.coberturaAtualDias ?? "—"}d → {p.coberturaIdealDias}d</span>
                        </div>
                      ) : <span style={{ fontSize: 11, color: C.muted }}>—</span>}
                    </td>
                    <td style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}><StatusBadge status={p.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 15px" }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, color: C.muted, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700, color: color || C.ink, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function NovoProdutoForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({ produto: "", sku: "", categoria: "", marca: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setBusy(true); setError(null);
    try {
      await api.produtosCreate(form);
      onCreated();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 180px" }}><div style={{ fontSize: 11, color: C.inkSoft, marginBottom: 4 }}>Produto</div><input style={S.input} value={form.produto} onChange={(e) => setForm({ ...form, produto: e.target.value })} /></div>
      <div style={{ flex: "1 1 120px" }}><div style={{ fontSize: 11, color: C.inkSoft, marginBottom: 4 }}>SKU</div><input style={S.input} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
      <div style={{ flex: "1 1 140px" }}><div style={{ fontSize: 11, color: C.inkSoft, marginBottom: 4 }}>Categoria</div><input style={S.input} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} /></div>
      <div style={{ flex: "1 1 140px" }}><div style={{ fontSize: 11, color: C.inkSoft, marginBottom: 4 }}>Marca</div><input style={S.input} value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} /></div>
      <button style={S.primaryBtnSm} disabled={busy} onClick={save}>{busy ? "Salvando..." : "Criar"}</button>
      <button style={S.ghostBtn} onClick={onCancel}>Cancelar</button>
      {error && <div style={{ fontSize: 12, color: C.danger, width: "100%" }}>{error}</div>}
    </div>
  );
}

function ProdutoDetail({ produto, onBack, onChanged }) {
  const [form, setForm] = useState(produto);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { setForm(produto); }, [produto.id]);

  async function save(fields) {
    setBusy(true); setError(null); setMsg(null);
    try {
      await api.produtosUpdate(produto.id, fields);
      setMsg("Salvo.");
      onChanged();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const months = monthOptions();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: C.inkSoft, fontSize: 12.5, padding: 0, alignSelf: "flex-start" }}>
        <ArrowLeft size={14} /> Todos os produtos
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700, color: C.ink, display: "flex", alignItems: "center", gap: 10 }}>
            {produto.produto} <AbcBadge curva={produto.curva} />
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{produto.sku} · {produto.categoria || "sem categoria"}</div>
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: C.danger }}>{error}</div>}
      {msg && <div style={{ fontSize: 12, color: C.sage }}>{msg}</div>}

      {produto.abaixoCobertura && (
        <div style={{ background: C.dangerSoft, borderRadius: 10, padding: "12px 16px", fontSize: 12.5, color: C.danger, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={14} /> Estoque abaixo da cobertura ideal — {produto.coberturaAtualDias ?? "—"} dias restantes, meta é {produto.coberturaIdealDias} dias.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <StatCard label="Giro Médio/Mês" value={produto.giroMedioMensal != null ? `${produto.giroMedioMensal} un` : "—"} />
        <StatCard label="Estoque Atual" value={`${produto.estoqueAtual} un`} color={produto.abaixoCobertura ? C.danger : undefined} sub={produto.coberturaAtualDias != null ? `${produto.coberturaAtualDias} dias de cobertura` : undefined} />
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 15px" }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, color: C.muted, textTransform: "uppercase" }}>Cobertura Ideal (dias)</div>
          <input style={{ ...S.input, marginTop: 6, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 18, padding: "4px 8px", width: 80 }} type="number" value={form.coberturaIdealDias ?? ""} onChange={(e) => setForm({ ...form, coberturaIdealDias: e.target.value })} onBlur={() => save({ coberturaIdealDias: form.coberturaIdealDias || null })} />
        </div>
        <StatCard label="Cobertura Projetada" value={produto.coberturaProjetadaDias != null ? `${produto.coberturaProjetadaDias}d` : "—"} color={C.sage} sub="Estoque + compra/produção" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14.5, marginBottom: 12 }}>Dados cadastrais</div>
          {produto.fotoUrl && <img src={produto.fotoUrl} alt="" style={{ width: "100%", height: 120, borderRadius: 10, objectFit: "cover", background: "#EDEBE4", marginBottom: 10 }} />}
          <FieldRow label="Foto (link)"><input style={{ ...S.input, fontSize: 11 }} placeholder="https://..." value={form.fotoUrl || ""} onChange={(e) => setForm({ ...form, fotoUrl: e.target.value })} onBlur={() => save({ fotoUrl: form.fotoUrl || null })} /></FieldRow>
          <FieldRow label="Categoria"><input style={S.input} value={form.categoria || ""} onChange={(e) => setForm({ ...form, categoria: e.target.value })} onBlur={() => save({ categoria: form.categoria || null })} /></FieldRow>
          <FieldRow label="Marca"><input style={S.input} value={form.marca || ""} onChange={(e) => setForm({ ...form, marca: e.target.value })} onBlur={() => save({ marca: form.marca || null })} /></FieldRow>
          <FieldRow label="Subcategoria"><input style={S.input} value={form.subcategoria || ""} onChange={(e) => setForm({ ...form, subcategoria: e.target.value })} onBlur={() => save({ subcategoria: form.subcategoria || null })} /></FieldRow>
          <FieldRow label="Status">
            <select style={S.input} value={form.status} onChange={(e) => { setForm({ ...form, status: e.target.value }); save({ status: e.target.value }); }}>
              <option value="ativo">Ativo</option><option value="pausado">Pausado</option><option value="descontinuado">Descontinuado</option>
            </select>
          </FieldRow>
          <FieldRow label="Estoque atual"><input style={S.input} type="number" value={form.estoqueAtual ?? 0} onChange={(e) => setForm({ ...form, estoqueAtual: e.target.value })} onBlur={() => save({ estoqueAtual: form.estoqueAtual })} /></FieldRow>
          <FieldRow label="Giro médio/mês (un)"><input style={S.input} type="number" value={form.giroMedioMensal ?? ""} onChange={(e) => setForm({ ...form, giroMedioMensal: e.target.value })} onBlur={() => save({ giroMedioMensal: form.giroMedioMensal || null })} /></FieldRow>
          <FieldRow label="Compra/Produção prevista"><input style={S.input} type="number" placeholder="unidades" value={form.compraProducao ?? ""} onChange={(e) => setForm({ ...form, compraProducao: e.target.value })} onBlur={() => { if (form.compraProducao && !form.dataChegada) { setError("Escolha o mês de chegada antes de salvar a compra/produção."); return; } save({ compraProducao: form.compraProducao || null, dataChegada: form.compraProducao ? form.dataChegada : null }); }} /></FieldRow>
          {form.compraProducao ? (
            <FieldRow label="Chegada prevista">
              <select style={S.input} value={form.dataChegada ? String(form.dataChegada).slice(0, 10) : ""} onChange={(e) => { setForm({ ...form, dataChegada: e.target.value }); save({ compraProducao: form.compraProducao, dataChegada: e.target.value }); }}>
                <option value="">Escolha o mês…</option>
                {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </FieldRow>
          ) : null}
          <div style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>Origem do cadastro: {produto.origemCadastro === "planilha" ? "Upload de planilha" : "Manual"} · desde {fmtDate(produto.createdAt)}</div>
        </div>

        <PriceMarginPanel produto={produto} form={form} setForm={setForm} save={save} />
      </div>
    </div>
  );
}

function FieldRow({ label, children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 11.5, color: C.inkSoft, whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ flex: 1, maxWidth: 190 }}>{children}</div>
    </div>
  );
}

function PriceMarginPanel({ produto, form, setForm, save }) {
  function marginColor(v) {
    if (v == null) return C.muted;
    return v < 20 ? C.danger : C.sage;
  }
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14.5, marginBottom: 12 }}>Preços & Margem</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>Atacado</div>
          <FieldRow label="CMV"><input style={S.input} type="number" value={form.cmv ?? ""} onChange={(e) => setForm({ ...form, cmv: e.target.value })} onBlur={() => save({ cmv: form.cmv || null })} /></FieldRow>
          <FieldRow label="Preço Atacado"><input style={S.input} type="number" value={form.precoAtacado ?? ""} onChange={(e) => setForm({ ...form, precoAtacado: e.target.value })} onBlur={() => save({ precoAtacado: form.precoAtacado || null })} /></FieldRow>
          <FieldRow label="Desconto Atacado (%)"><input style={S.input} type="number" value={form.descontoAtacado ?? ""} onChange={(e) => setForm({ ...form, descontoAtacado: e.target.value })} onBlur={() => save({ descontoAtacado: form.descontoAtacado || null })} /></FieldRow>
          <FieldRow label="Margem regular"><input style={{ ...S.input, color: marginColor(produto.margemAtacado), fontWeight: 700 }} placeholder={fmtPct(produto.margemAtacado)} value={form.margemAtacadoManual ?? ""} onChange={(e) => setForm({ ...form, margemAtacadoManual: e.target.value })} onBlur={() => save({ margemAtacadoManual: form.margemAtacadoManual || null })} /></FieldRow>
          <FieldRow label="Margem c/ desconto"><input style={{ ...S.input, color: marginColor(produto.margemAtacadoDesconto), fontWeight: 700 }} placeholder={fmtPct(produto.margemAtacadoDesconto)} value={form.margemAtacadoDescontoManual ?? ""} onChange={(e) => setForm({ ...form, margemAtacadoDescontoManual: e.target.value })} onBlur={() => save({ margemAtacadoDescontoManual: form.margemAtacadoDescontoManual || null })} /></FieldRow>
        </div>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>PSV (Preço Sugerido de Venda)</div>
          <FieldRow label="CMV"><span style={{ fontSize: 12, color: C.muted }}>{fmtBRL(produto.cmv)} (igual ao Atacado)</span></FieldRow>
          <FieldRow label="PSV"><input style={S.input} type="number" value={form.precoPSV ?? ""} onChange={(e) => setForm({ ...form, precoPSV: e.target.value })} onBlur={() => save({ precoPSV: form.precoPSV || null })} /></FieldRow>
          <FieldRow label="Desconto PSV (%)"><input style={S.input} type="number" value={form.descontoPSV ?? ""} onChange={(e) => setForm({ ...form, descontoPSV: e.target.value })} onBlur={() => save({ descontoPSV: form.descontoPSV || null })} /></FieldRow>
          <FieldRow label="Margem regular"><input style={{ ...S.input, color: marginColor(produto.margemPSV), fontWeight: 700 }} placeholder={fmtPct(produto.margemPSV)} value={form.margemPSVManual ?? ""} onChange={(e) => setForm({ ...form, margemPSVManual: e.target.value })} onBlur={() => save({ margemPSVManual: form.margemPSVManual || null })} /></FieldRow>
          <FieldRow label="Margem c/ desconto"><input style={{ ...S.input, color: marginColor(produto.margemPSVDesconto), fontWeight: 700 }} placeholder={fmtPct(produto.margemPSVDesconto)} value={form.margemPSVDescontoManual ?? ""} onChange={(e) => setForm({ ...form, margemPSVDescontoManual: e.target.value })} onBlur={() => save({ margemPSVDescontoManual: form.margemPSVDescontoManual || null })} /></FieldRow>
        </div>
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 10 }}>As margens já vêm calculadas a partir do CMV, preço e desconto. Digite um valor pra sobrescrever manualmente, ou deixe em branco pra usar o cálculo automático (mostrado como referência no campo).</div>
    </div>
  );
}
