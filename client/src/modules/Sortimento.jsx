import React, { useState, useEffect } from "react";
import { Package, Plus, Upload, ArrowLeft, AlertTriangle, Link2, Copy, Check } from "lucide-react";
import { C, S, FONT_DISPLAY } from "../theme.js";
import { api } from "../lib/api.js";

const fmtBRL = (n) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }));
const fmtPct = (n) => (n == null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%");
const fmtDate = (d) => new Date(d).toLocaleDateString("pt-BR");

const STATUS_LABEL = { ativo: "Ativo", pausado: "Pausado", descontinuado: "Descontinuado" };
const EMBALAGEM_OPTIONS = ["Adesivo", "Blister", "Brownbox", "Cinta", "Giftbox", "Tag"];
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
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showTabelaPublica, setShowTabelaPublica] = useState(false);
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

  const termo = search.trim().toLowerCase();
  const filtered = produtos.filter((p) => {
    if (termo && !(p.produto.toLowerCase().includes(termo) || p.sku.toLowerCase().includes(termo))) return false;
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
          <button style={{ ...S.ghostBtn, borderColor: C.sage, color: C.sage }} onClick={() => setShowTabelaPublica((s) => !s)}><Link2 size={14} /> Tabela de preços online</button>
          <button style={S.primaryBtnSm} onClick={() => setShowNew((s) => !s)}><Plus size={14} /> Novo produto</button>
        </div>
      </div>

      {uploadMsg && <div style={{ fontSize: 12, color: C.sage }}>{uploadMsg}</div>}
      {error && <div style={{ fontSize: 12, color: C.danger }}>{error}</div>}
      {showTabelaPublica && <TabelaPublicaPanel onClose={() => setShowTabelaPublica(false)} />}
      {showNew && <NovoProdutoForm onCreated={() => { setShowNew(false); reload(payload.criterio); }} onCancel={() => setShowNew(false)} />}

      <div className="done-metrics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
        <StatCard label="SKUs Ativos" value={ativos} sub={`de ${produtos.length} cadastrados`} />
        <StatCard label="Curva A" value={curvaCount.A} color={C.sage} sub="80% do critério" />
        <StatCard label="Curva B" value={curvaCount.B} color={C.gold} sub="15% do critério" />
        <StatCard label="Curva C" value={curvaCount.C} sub="5% do critério" />
        <StatCard label="Abaixo da Cobertura" value={abaixoCount} color={C.danger} sub="precisam de reposição" />
        <StatCard label="Término de Estoque" value={terminoCount} color="#8A6423" sub="descontinuados, sem recompra" />
      </div>

      <input
        style={{ ...S.input, maxWidth: 320 }}
        placeholder="Buscar por nome ou código..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

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
        <div style={{ overflow: "auto", maxHeight: "calc(100vh - 120px)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
            <thead>
              <tr>
                {["Produto", "Categoria", "Curva", "Giro médio/mês", "Preço Atacado", "Preço Varejo", "Margem Atacado", "Margem Varejo", "Estoque atual", "Cobertura (atual → ideal)", "Status"].map((h) => (
                  <th key={h} style={{ textAlign: "left", fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, color: C.muted, textTransform: "uppercase", padding: "11px 14px", background: C.paper, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 1 }}>{h}</th>
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
                    <td style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 12.5 }}>{p.giroMedioMensal != null ? `${p.giroMedioMensal.toFixed(1)} un` : "—"}</td>
                    <td style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
                      <ComboCell original={p.precoAtacado} comDesconto={p.precoAtacado != null ? p.precoAtacado * (1 - (p.descontoAtacado || 0) / 100) : null} format={fmtBRL} />
                    </td>
                    <td style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
                      <ComboCell original={p.precoPSV} comDesconto={p.precoPSV != null ? p.precoPSV * (1 - (p.descontoPSV || 0) / 100) : null} format={fmtBRL} />
                    </td>
                    <td style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
                      <ComboCell original={p.margemAtacado} comDesconto={p.margemAtacadoDesconto} format={fmtPct} />
                    </td>
                    <td style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
                      <ComboCell original={p.margemPSV} comDesconto={p.margemPSVDesconto} format={fmtPct} />
                    </td>
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

// Mostra "valor regular → valor com desconto" quando há desconto, ou só o valor regular.
function ComboCell({ original, comDesconto, format }) {
  if (original == null) return <span style={{ fontSize: 11, color: C.muted }}>—</span>;
  const diferente = comDesconto != null && Math.abs(comDesconto - original) > 0.001;
  if (!diferente) return <span style={{ fontSize: 12 }}>{format(original)}</span>;
  return (
    <span style={{ fontSize: 11 }}>
      <span style={{ textDecoration: "line-through", color: C.muted, marginRight: 4 }}>{format(original)}</span>
      <span style={{ color: C.danger, fontWeight: 700 }}>{format(comDesconto)}</span>
    </span>
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

function TabelaPublicaPanel({ onClose }) {
  const [status, setStatus] = useState(undefined); // undefined=carregando, null=sem link, {token,createdAt}=ativo
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    try { setStatus(await api.tabelaPublicaStatus()); } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function gerar() {
    setBusy(true); setError(null); setCopied(false);
    try { setStatus(await api.tabelaPublicaGerar()); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function revogar() {
    setBusy(true); setError(null);
    try { await api.tabelaPublicaRevogar(); setStatus(null); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function copyLink() {
    const url = api.tabelaPublicaUrl(status.slug, status.token);
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14 }}>Tabela de preços online</div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 12 }}>Fechar</button>
      </div>
      <div style={{ fontSize: 11.5, color: C.muted }}>Mostra só os produtos com status Ativo — sem quantidade de estoque, só disponível/indisponível. Gerar um novo link invalida o anterior na hora.</div>

      {status === null ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: C.muted }}>Nenhum link ativo ainda.</span>
          <button style={S.primaryBtnSm} disabled={busy} onClick={gerar}>{busy ? "Gerando..." : "Gerar link"}</button>
        </div>
      ) : status ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <input readOnly style={{ ...S.input, flex: "1 1 260px", fontSize: 11.5, color: C.inkSoft }} value={api.tabelaPublicaUrl(status.slug, status.token)} onFocus={(e) => e.target.select()} />
            <button style={S.ghostBtn} onClick={copyLink}>{copied ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}</button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.ghostBtn} disabled={busy} onClick={gerar}>Gerar novo (invalida este)</button>
            <button style={{ ...S.ghostBtn, borderColor: C.danger, color: C.danger }} disabled={busy} onClick={revogar}>Revogar</button>
          </div>
          <div style={{ fontSize: 10, color: C.muted }}>Criado em {fmtDate(status.createdAt)}</div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: C.muted }}>Carregando...</div>
      )}
      {error && <div style={{ fontSize: 12, color: C.danger }}>{error}</div>}
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
        <StatCard label="Giro Médio/Mês" value={produto.giroMedioMensal != null ? `${produto.giroMedioMensal.toFixed(1)} un` : "—"} />
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

      <DimensoesPanel form={form} setForm={setForm} save={save} />
    </div>
  );
}

function DimensoesPanel({ form, setForm, save }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14.5, marginBottom: 12 }}>Dimensões e Embalagem</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <FieldRow label="Altura (cm)"><input style={S.input} type="number" value={form.altura ?? ""} onChange={(e) => setForm({ ...form, altura: e.target.value })} onBlur={() => save({ altura: form.altura || null })} /></FieldRow>
          <FieldRow label="Largura (cm)"><input style={S.input} type="number" value={form.largura ?? ""} onChange={(e) => setForm({ ...form, largura: e.target.value })} onBlur={() => save({ largura: form.largura || null })} /></FieldRow>
          <FieldRow label="Comprimento (cm)"><input style={S.input} type="number" value={form.comprimento ?? ""} onChange={(e) => setForm({ ...form, comprimento: e.target.value })} onBlur={() => save({ comprimento: form.comprimento || null })} /></FieldRow>
          <FieldRow label="Peso Gross (kg)"><input style={S.input} type="number" value={form.pesoGross ?? ""} onChange={(e) => setForm({ ...form, pesoGross: e.target.value })} onBlur={() => save({ pesoGross: form.pesoGross || null })} /></FieldRow>
          <FieldRow label="Peso Net (kg)"><input style={S.input} type="number" value={form.pesoNet ?? ""} onChange={(e) => setForm({ ...form, pesoNet: e.target.value })} onBlur={() => save({ pesoNet: form.pesoNet || null })} /></FieldRow>
        </div>
        <div>
          <FieldRow label="Caixa Master (un)"><input style={S.input} type="number" value={form.caixaMaster ?? ""} onChange={(e) => setForm({ ...form, caixaMaster: e.target.value })} onBlur={() => save({ caixaMaster: form.caixaMaster || null })} /></FieldRow>
          <FieldRow label="Tipo de embalagem">
            <select style={S.input} value={form.tipoEmbalagem || ""} onChange={(e) => { setForm({ ...form, tipoEmbalagem: e.target.value }); save({ tipoEmbalagem: e.target.value || null }); }}>
              <option value="">Selecione...</option>
              {EMBALAGEM_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="NCM"><input style={S.input} placeholder="0000.00.00" value={form.ncm || ""} onChange={(e) => setForm({ ...form, ncm: e.target.value })} onBlur={() => save({ ncm: form.ncm || null })} /></FieldRow>
        </div>
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
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>Varejo</div>
          <FieldRow label="CMV"><span style={{ fontSize: 12, color: C.muted }}>{fmtBRL(produto.cmv)} (igual ao Atacado)</span></FieldRow>
          <FieldRow label="Preço Varejo"><input style={S.input} type="number" value={form.precoPSV ?? ""} onChange={(e) => setForm({ ...form, precoPSV: e.target.value })} onBlur={() => save({ precoPSV: form.precoPSV || null })} /></FieldRow>
          <FieldRow label="Desconto Varejo (%)"><input style={S.input} type="number" value={form.descontoPSV ?? ""} onChange={(e) => setForm({ ...form, descontoPSV: e.target.value })} onBlur={() => save({ descontoPSV: form.descontoPSV || null })} /></FieldRow>
          <FieldRow label="Margem regular"><input style={{ ...S.input, color: marginColor(produto.margemPSV), fontWeight: 700 }} placeholder={fmtPct(produto.margemPSV)} value={form.margemPSVManual ?? ""} onChange={(e) => setForm({ ...form, margemPSVManual: e.target.value })} onBlur={() => save({ margemPSVManual: form.margemPSVManual || null })} /></FieldRow>
          <FieldRow label="Margem c/ desconto"><input style={{ ...S.input, color: marginColor(produto.margemPSVDesconto), fontWeight: 700 }} placeholder={fmtPct(produto.margemPSVDesconto)} value={form.margemPSVDescontoManual ?? ""} onChange={(e) => setForm({ ...form, margemPSVDescontoManual: e.target.value })} onBlur={() => save({ margemPSVDescontoManual: form.margemPSVDescontoManual || null })} /></FieldRow>
        </div>
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 10 }}>As margens já vêm calculadas a partir do CMV, preço e desconto. Digite um valor pra sobrescrever manualmente, ou deixe em branco pra usar o cálculo automático (mostrado como referência no campo).</div>
    </div>
  );
}
