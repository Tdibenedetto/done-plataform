import React, { useState, useEffect, useMemo } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer,
} from "recharts";
import { RefreshCw, ArrowLeft } from "lucide-react";
import { C, S, FONT_DISPLAY } from "../theme.js";
import { api } from "../lib/api.js";
import { DIMENSIONS, QUESTIONS, rangeFor, MODULE_HINT, MODULE_LABEL } from "./questions.js";

function tierOf(score) {
  return score >= 75 ? "alto" : score >= 50 ? "medio" : "baixo";
}

const ANALYSIS_TEXT = {
  processo: {
    baixo: "O processo comercial ainda é informal — decisões e follow-ups não seguem uma rotina definida, o que faz oportunidades esfriarem sem necessidade.",
    medio: "Existe uma estrutura básica de processo, mas com falhas de constância — o funil funciona, mas depende de lembrança individual, não de rotina.",
    alto: "O processo comercial está bem estruturado, com rotina clara de acompanhamento — a atenção agora deve ir para refinar detalhes, não reconstruir a base.",
  },
  preco: {
    baixo: "A precificação não segue uma lógica clara de margem — os preços parecem definidos individualmente, sem critério consistente entre produtos ou clientes.",
    medio: "Existe alguma lógica de precificação, mas a margem real não é acompanhada de perto — decisões de desconto acontecem sem visibilidade do impacto.",
    alto: "A precificação é bem calibrada e a margem é acompanhada de perto — o próximo passo é usar esse controle para negociar com mais confiança.",
  },
  time: {
    baixo: "O time comercial não tem rotina de acompanhamento nem incentivo claro — isso costuma significar desempenho desigual entre vendedores, sem visibilidade de quem precisa de apoio.",
    medio: "Existe alguma estrutura de metas para o time, mas o acompanhamento não é frequente o suficiente para corrigir o rumo a tempo.",
    alto: "O time tem rotina de acompanhamento e incentivo claros — a atenção agora deve ir para reter e desenvolver os melhores vendedores.",
  },
  pipeline: {
    baixo: "Não há visibilidade clara do funil nem planejamento de reposição — decisões de estoque e vendas parecem reativas, não planejadas.",
    medio: "Existe alguma visibilidade do pipeline, mas o planejamento ainda é feito no feeling, sem dado histórico orientando a decisão.",
    alto: "O pipeline é acompanhado de perto e o planejamento é orientado por dado — o próximo passo é refinar a precisão da previsão.",
  },
};

const ACTION_TEXT = {
  processo: "Defina uma rotina fixa de follow-up (ex: contato em D+2, D+7, D+15 após cada proposta) e registre isso em um lugar único, mesmo que simples — o ganho vem da constância, não da ferramenta.",
  preco: "Revise a margem real por categoria (não só por produto) pelo menos uma vez por trimestre, e defina um piso de desconto que qualquer vendedor pode dar sem precisar de aprovação.",
  time: "Implemente acompanhamento semanal — não mensal — de metas por vendedor, com uma conversa curta e regular. Não precisa ser formal, precisa ser constante.",
  pipeline: "Passe a planejar reposição com base no histórico de vendas por SKU dos últimos meses, não no feeling — isso sozinho já reduz boa parte da ruptura recorrente.",
};

export default function ComercialCoach({ goTo, onResult }) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [stage, setStage] = useState("landing");
  const [segment, setSegment] = useState(null);
  const [answers, setAnswers] = useState({});
  const [dimIndex, setDimIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [checkingBilling, setCheckingBilling] = useState(true);

  useEffect(() => {
    api.coachLatest()
      .then((r) => { setResult(r); if (r) setStage("results"); })
      .finally(() => setLoading(false));
  }, []);

  // Confere se o relatório completo já foi pago (inclusive ao voltar do checkout do Stripe).
  useEffect(() => {
    if (stage !== "results") return;
    setCheckingBilling(true);
    api.billingStatus()
      .then((s) => setUnlocked((s.payments || []).some((p) => p.type === "coach_report")))
      .catch(() => setUnlocked(false))
      .finally(() => setCheckingBilling(false));
  }, [stage]);

  const questions = segment ? QUESTIONS[segment] : null;

  const scores = useMemo(() => {
    if (!questions) return null;
    const dims = {};
    DIMENSIONS.forEach(({ key }) => {
      const qs = questions[key];
      const vals = qs.map((_, i) => answers[`${key}-${i}`]).filter((v) => v !== undefined);
      dims[key] = vals.length ? vals.reduce((a, b) => a + b, 0) / qs.length : 0;
    });
    const final = Math.round(DIMENSIONS.reduce((sum, d) => sum + dims[d.key] * d.weight, 0));
    return { dims, final };
  }, [answers, questions]);

  function startQuiz(seg) { setSegment(seg); setAnswers({}); setDimIndex(0); setStage("quiz"); }
  function answer(dimKey, qIdx, score) { setAnswers((prev) => ({ ...prev, [`${dimKey}-${qIdx}`]: score })); }
  function currentDimAnswered(dimKey) { return questions[dimKey].every((_, i) => answers[`${dimKey}-${i}`] !== undefined); }

  async function finish() {
    setSubmitting(true);
    const payload = {
      segment,
      answers: {
        processo: questions.processo.map((_, i) => answers[`processo-${i}`]),
        preco: questions.preco.map((_, i) => answers[`preco-${i}`]),
        time: questions.time.map((_, i) => answers[`time-${i}`]),
        pipeline: questions.pipeline.map((_, i) => answers[`pipeline-${i}`]),
      },
    };
    const saved = await api.coachSubmit(payload);
    setResult(saved);
    if (onResult) onResult(saved);
    setSubmitting(false);
    setStage("results");
  }

  function reset() { setResult(null); setSegment(null); setAnswers({}); setStage("landing"); }

  if (loading) return <ModuleLoading />;

  if (stage === "landing") {
    return (
      <div style={S.moduleCol}>
        <div style={S.eyebrow}>DIAGNÓSTICO GRATUITO · 5–8 MIN</div>
        <h1 style={S.h1}>Descubra sua <span style={{ color: C.gold }}>Nota Comercial</span></h1>
        <p style={{ ...S.lead, maxWidth: 520 }}>
          Responda um questionário rápido sobre processo, precificação, time e estoque. No final, você recebe uma nota de 0 a 100 e as três prioridades para destravar o seu negócio.
        </p>
        <button style={{ ...S.primaryBtn, marginTop: 8 }} onClick={() => setStage("segment")}>Começar diagnóstico →</button>
        <div style={{ display: "flex", gap: 28, marginTop: 20, paddingTop: 20, borderTop: `1px solid ${C.border}`, width: "100%", maxWidth: 480 }}>
          <TrustStat n="4" label="dimensões avaliadas" />
          <TrustStat n="0–100" label="nota final" />
          <TrustStat n="3" label="ações prioritárias" />
        </div>
      </div>
    );
  }

  if (stage === "segment") {
    return (
      <div style={S.moduleCol}>
        <div style={S.eyebrow}>PASSO 1 DE 2</div>
        <h2 style={{ ...S.h1, fontSize: 24 }}>Qual descreve melhor o seu negócio?</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, maxWidth: 640 }}>
          <SegmentCard title="B2B / Atacado" desc="Distribuidor, importador ou indústria que vende para outras empresas." onClick={() => startQuiz("b2b")} />
          <SegmentCard title="Varejo Especializado" desc="Loja física, e-commerce de nicho ou rede com catálogo curado." onClick={() => startQuiz("varejo")} />
        </div>
      </div>
    );
  }

  if (stage === "quiz") {
    const dim = DIMENSIONS[dimIndex];
    const qs = questions[dim.key];
    const progress = ((dimIndex + 1) / DIMENSIONS.length) * 100;
    return (
      <div style={{ ...S.moduleCol, maxWidth: 640 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 600, color: C.inkSoft }}>
            Dimensão {dimIndex + 1} de {DIMENSIONS.length} · {dim.label}
          </div>
          <div style={{ height: 6, background: C.border, borderRadius: 999, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: C.gold, borderRadius: 999 }} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {qs.map((item, i) => {
            const key = `${dim.key}-${i}`;
            const selected = answers[key];
            return (
              <div key={key} style={S.qCard}>
                <div style={{ fontSize: 14.5, fontWeight: 500, lineHeight: 1.45 }}>{item.q}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {item.opts.map((opt, oi) => {
                    const isSel = selected === opt.score;
                    return (
                      <button key={oi} onClick={() => answer(dim.key, i, opt.score)}
                        style={{ fontSize: 13, border: "1px solid", borderRadius: 999, padding: "8px 14px", cursor: "pointer",
                          background: isSel ? C.ink : C.card, color: isSel ? C.paper : C.inkSoft, borderColor: isSel ? C.ink : C.border }}>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button style={S.ghostBtn} onClick={() => (dimIndex > 0 ? setDimIndex(dimIndex - 1) : setStage("segment"))}>
            <ArrowLeft size={14} /> Voltar
          </button>
          <button
            style={{ ...S.primaryBtn, opacity: currentDimAnswered(dim.key) && !submitting ? 1 : 0.4 }}
            disabled={!currentDimAnswered(dim.key) || submitting}
            onClick={() => (dimIndex < DIMENSIONS.length - 1 ? setDimIndex(dimIndex + 1) : finish())}
          >
            {submitting ? "Calculando..." : dimIndex < DIMENSIONS.length - 1 ? "Próxima dimensão →" : "Ver minha nota →"}
          </button>
        </div>
      </div>
    );
  }

  // results
  const r = result
    ? { final: result.final, dims: { processo: result.dimProcesso, preco: result.dimPreco, time: result.dimTime, pipeline: result.dimPipeline } }
    : { final: scores.final, dims: scores.dims };
  const range = rangeFor(r.final);
  const dimsArr = DIMENSIONS.map((d) => ({ ...d, score: r.dims[d.key] }));
  const weakest = [...dimsArr].sort((a, b) => a.score - b.score);
  const top3 = weakest.slice(0, 3);
  const radarData = dimsArr.map((d) => ({ dimension: d.label, Nota: Math.round(d.score) }));

  return (
    <div style={{ ...S.moduleCol, maxWidth: 780 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
        <div>
          <div style={S.eyebrow}>SUA NOTA COMERCIAL</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 64, color: range.tone, lineHeight: 1 }}>{r.final}</div>
          <div style={{ display: "inline-block", fontFamily: FONT_DISPLAY, fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 999, background: range.tone + "22", color: range.tone, marginTop: 8 }}>
            {range.label}
          </div>
          <p style={{ fontSize: 13, color: C.inkSoft, marginTop: 10, maxWidth: 220 }}>{range.note}</p>
        </div>
        <ResponsiveContainer width="100%" height={230}>
          <RadarChart data={radarData} outerRadius={80}>
            <PolarGrid stroke={C.border} />
            <PolarAngleAxis dataKey="dimension" tick={{ fill: C.inkSoft, fontSize: 10.5, fontFamily: "Inter" }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar dataKey="Nota" stroke={C.gold} fill={C.gold} fillOpacity={0.35} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {dimsArr.map((d) => (
          <div key={d.key} style={{ display: "grid", gridTemplateColumns: "160px 1fr 34px", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 13, color: C.inkSoft }}>{d.label}</div>
            <div style={{ height: 8, background: C.border, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${d.score}%`, borderRadius: 999, background: top3[0].key === d.key ? C.danger : C.sage }} />
            </div>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 13, textAlign: "right" }}>{Math.round(d.score)}</div>
          </div>
        ))}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 15 }}>Prioridades identificadas</div>
        {top3.map((d, i) => (
          <div key={d.key} style={{ display: "flex", gap: 12, fontSize: 13.5, lineHeight: 1.55, color: C.inkSoft, alignItems: "flex-start" }}>
            <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13, color: C.gold, background: C.goldSoft, width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
            <span>
              <strong>{d.label}</strong> está travando seu resultado — indicamos a{" "}
              <button onClick={() => goTo(MODULE_HINT[d.key])} style={{ background: "none", border: "none", padding: 0, color: C.gold, fontWeight: 700, cursor: "pointer", fontSize: 13.5, textDecoration: "underline" }}>
                {MODULE_LABEL[MODULE_HINT[d.key]]}
              </button>{" "}
              para atacar isso primeiro.
            </span>
          </div>
        ))}
      </div>

      {!checkingBilling && (unlocked ? (
        <UnlockedContent dimsArr={dimsArr} />
      ) : (
        <div style={{ background: C.ink, color: "#fff", borderRadius: 16, padding: 26, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 18 }}>Relatório completo — R$ 147</div>
          <p style={{ fontSize: 13.5, opacity: 0.8, lineHeight: 1.55, maxWidth: 440, margin: "0 0 10px" }}>
            Análise detalhada de cada resposta, comparação com o benchmark do seu segmento e um plano de ação completo, não só as 3 prioridades.
          </p>
          <button style={S.primaryBtn} onClick={() => api.checkout("coach_report").then((r) => (window.location.href = r.url))}>
            Desbloquear relatório completo
          </button>
        </div>
      ))}

      <button style={S.ghostBtn} onClick={reset}><RefreshCw size={14} /> Refazer diagnóstico</button>
    </div>
  );
}

function UnlockedContent({ dimsArr }) {
  const avgScore = dimsArr.reduce((s, d) => s + d.score, 0) / dimsArr.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.sage, fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14 }}>
        ✓ Relatório completo desbloqueado
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 15 }}>Análise detalhada por dimensão</div>
        {dimsArr.map((d) => (
          <div key={d.key} style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 13.5 }}>{d.label}</span>
              <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: C.gold }}>{Math.round(d.score)}</span>
            </div>
            <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, margin: 0 }}>{ANALYSIS_TEXT[d.key][tierOf(d.score)]}</p>
          </div>
        ))}
      </div>

      <div style={{ background: C.goldSoft, borderRadius: 12, padding: "12px 16px", fontSize: 11.5, color: "#6B5122", lineHeight: 1.5 }}>
        Comparativo com o benchmark do seu segmento — prévia ilustrativa. A plataforma ainda não tem uma base de clientes suficiente para um benchmark estatístico real; esta seção será calculada de verdade assim que houver dados suficientes.
      </div>

      <div style={{ background: C.ink, borderRadius: 16, padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 15, color: "#fff" }}>Plano de ação completo</div>
        {dimsArr.map((d, i) => (
          <div key={d.key} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 12, color: C.gold, background: "rgba(184,134,58,0.15)", width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#fff", marginBottom: 3 }}>{d.label}</div>
              <p style={{ fontSize: 12.5, color: "#C7CAD4", lineHeight: 1.55, margin: 0 }}>{ACTION_TEXT[d.key]}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SegmentCard({ title, desc, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ textAlign: "left", background: C.card, border: `1.5px solid ${hover ? C.gold : C.border}`, borderRadius: 12, padding: 20, cursor: "pointer" }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 16 }}>{title}</div>
      <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 8, lineHeight: 1.5 }}>{desc}</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 10, color: hover ? C.gold : C.muted }}>Escolher →</div>
    </button>
  );
}
function ModuleLoading() {
  return <div style={{ color: "#8A8F9C", fontSize: 13 }}>Carregando...</div>;
}
function TrustStat({ n, label }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 20, color: C.gold }}>{n}</div>
      <div style={{ fontSize: 12, color: C.muted }}>{label}</div>
    </div>
  );
}

