import React, { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, ResponsiveContainer,
} from "recharts";
import {
  Activity, Trello, BarChart2, Zap, Briefcase, TrendingUp, AlertTriangle,
  Target, Percent, Users, Clock,
} from "lucide-react";
import { C, S, FONT_DISPLAY } from "../theme.js";
import { api, loadSession } from "../lib/api.js";

const PIPELINE_STAGES = ["Novo Lead", "Qualificação", "Proposta", "Negociação"];
const CLOSED_STAGES = ["Fechado", "Carteira", "Faturado Total"];
const DIMENSION_LABEL = { processo: "Processo", preco: "Preço", time: "Time", pipeline: "Pipeline" };
const fmtBRL = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const currentMonth = () => new Date().toISOString().slice(0, 7);
const MES_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function fmtRelative(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `Há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Há ${days}d`;
}

export default function VisaoGeral({ coachResult, goTo }) {
  const session = loadSession();
  const isMaster = session?.user?.role === "master";
  const firstName = session?.user?.name?.split(" ")[0] || "";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  const [leads, setLeads] = useState(null);
  const [goals, setGoals] = useState([]);
  const [gestao, setGestao] = useState(null);

  useEffect(() => {
    (async () => {
      const [ls, gs] = await Promise.all([api.leadsList(), api.goalsList()]);
      setLeads(ls);
      setGoals(gs);
      if (isMaster) {
        try { setGestao(await api.gestaoAll()); } catch (e) { setGestao({ rows: [] }); }
      }
    })();
  }, [isMaster]);

  if (leads === null) return <div style={{ color: C.muted, fontSize: 13 }}>Carregando...</div>;

  // -------- Cálculos base (mesma lógica usada em Vendas/Gestão) --------
  const monthKey = currentMonth();
  const monthRealized = leads.reduce((sum, l) => sum + (l.invoiceEvents || []).filter((e) => e.date.slice(0, 7) === monthKey).reduce((s, e) => s + e.amount, 0), 0);
  const monthTarget = goals.filter((g) => g.month === monthKey).reduce((s, g) => s + g.target, 0) || 1;
  const metaPct = Math.min(100, Math.round((monthRealized / monthTarget) * 100));

  const pipelineLeads = leads.filter((l) => PIPELINE_STAGES.includes(l.stage));
  const pipelineValue = pipelineLeads.reduce((s, l) => s + l.value, 0);

  const closedLeads = leads.filter((l) => CLOSED_STAGES.includes(l.stage));
  const lostLeads = leads.filter((l) => l.stage === "Perdido");
  const decided = closedLeads.length + lostLeads.length;
  const winRate = decided ? Math.round((closedLeads.length / decided) * 100) : null;
  const avgTicket = closedLeads.length ? closedLeads.reduce((s, l) => s + l.value, 0) / closedLeads.length : 0;

  const noFollowUp = pipelineLeads.filter((l) => !l._count || l._count.notes === 0);
  const overdue = leads.filter((l) => l.expectedCloseDate && !CLOSED_STAGES.includes(l.stage) && l.stage !== "Perdido" && new Date(l.expectedCloseDate) < new Date());

  // Alertas de estoque/margem só existem para quem tem Ferramenta de Gestão (Master).
  let stockAlerts = [], marginAlerts = [], overallAvgMargin = 0;
  if (gestao && gestao.rows && gestao.rows.length) {
    const rows = gestao.rows;
    const latestBySku = {};
    rows.forEach((r) => {
      if (!r.sku) return;
      if (!latestBySku[r.sku] || new Date(r._uploadDate) > new Date(latestBySku[r.sku]._uploadDate)) latestBySku[r.sku] = r;
    });
    stockAlerts = Object.values(latestBySku).filter((r) => r.estoque === "ruptura" || r.estoque === "excesso");
    const byCat = {}, catCount = {};
    rows.forEach((r) => { byCat[r.categoria] = (byCat[r.categoria] || 0) + r.margem; catCount[r.categoria] = (catCount[r.categoria] || 0) + 1; });
    overallAvgMargin = rows.reduce((s, r) => s + r.margem, 0) / rows.length;
    marginAlerts = Object.entries(byCat)
      .map(([categoria, sum]) => ({ categoria, margem: Math.round(sum / catCount[categoria]) }))
      .filter((c) => c.margem < overallAvgMargin - 5);
  }

  const totalAlerts = noFollowUp.length + overdue.length + stockAlerts.length + marginAlerts.length;

  // Faturamento dos últimos 6 meses — dado real, vindo dos lançamentos de faturamento.
  const now = new Date();
  const last6 = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = MES_ABBR[d.getMonth()];
    const total = leads.reduce((sum, l) => sum + (l.invoiceEvents || []).filter((e) => e.date.slice(0, 7) === key).reduce((s, e) => s + e.amount, 0), 0);
    last6.push({ mes: label, valor: total });
  }

  // -------- Próximo movimento: prioriza o problema mais concreto disponível --------
  let nextMove = null;
  if (noFollowUp.length > 0) {
    nextMove = { title: `${noFollowUp.length} oportunidade${noFollowUp.length > 1 ? "s" : ""} sem follow-up.`, desc: "Revisar o pipeline e manter o fluxo ativo é o que mais impacta sua meta.", cta: "Revisar Pipeline", go: "vendas" };
  } else if (coachResult) {
    const dims = { processo: coachResult.dimProcesso, preco: coachResult.dimPreco, time: coachResult.dimTime, pipeline: coachResult.dimPipeline };
    const weakest = Object.entries(dims).sort((a, b) => a[1] - b[1])[0];
    nextMove = { title: `Sua nota mais baixa é em ${DIMENSION_LABEL[weakest[0]]}.`, desc: "Revisite seu diagnóstico para ver o plano de ação completo.", cta: "Ver diagnóstico", go: "coach" };
  } else {
    nextMove = { title: "Você ainda não fez seu diagnóstico comercial.", desc: "Leva 5 minutos e já te mostra as 3 prioridades do seu negócio.", cta: "Começar diagnóstico", go: "coach" };
  }

  // -------- Atividade recente, sintetizada a partir de dados reais já existentes --------
  const activities = [];
  leads.forEach((l) => {
    activities.push({ text: `${l.assignedUser?.name || "Alguém"} adicionou "${l.name}"`, date: l.createdAt });
    if (l.updatedAt && l.updatedAt !== l.createdAt) {
      activities.push({ text: `${l.assignedUser?.name || "Alguém"} moveu "${l.name}" para ${l.stage}`, date: l.updatedAt });
    }
    (l.invoiceEvents || []).forEach((e) => {
      activities.push({ text: `${l.assignedUser?.name || "Alguém"} faturou ${fmtBRL(e.amount)} em "${l.name}"`, date: e.date });
    });
  });
  activities.sort((a, b) => new Date(b.date) - new Date(a.date));
  const recentActivities = activities.slice(0, 6);

  return (
    <div style={S.moduleCol}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ ...S.h1, fontSize: 30 }}>{greeting}, {firstName}.</h1>
          <p style={S.lead}>Aqui está o que merece sua atenção hoje.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <StatCard icon={Target} color={C.gold} label="Nota Comercial" value={coachResult ? `${coachResult.final}/100` : "—"} sub={coachResult ? "seu diagnóstico mais recente" : "faça seu diagnóstico"} />
        <StatCard icon={TrendingUp} color={C.sage} label="Pipeline Aberto" value={fmtBRL(pipelineValue)} sub={`${pipelineLeads.length} oportunidades ativas`} />
        <StatCard icon={Target} color={C.gold} label="Meta do Mês" value={`${metaPct}%`} sub={`${fmtBRL(monthRealized)} de ${fmtBRL(monthTarget)}`} />
        <StatCard icon={AlertTriangle} color={C.danger} label="Alertas Prioritários" value={String(totalAlerts)} sub="itens que precisam de ação" />
      </div>

      {nextMove && (
        <div style={{ background: C.goldSoft, borderRadius: 14, padding: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Zap size={20} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.gold, letterSpacing: "0.06em" }}>SEU PRÓXIMO MOVIMENTO</div>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: C.ink, marginTop: 2 }}>{nextMove.title}</div>
            <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 2 }}>{nextMove.desc}</div>
          </div>
          <button style={S.primaryBtnSm} onClick={() => goTo(nextMove.go)}>{nextMove.cta} →</button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMaster ? "2fr 1fr" : "1fr", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            <ModuleCard icon={Activity} color={C.gold} title="Comercial Coach" desc="Diagnóstico e plano de ação para evoluir sua operação." metricLabel="Nota atual" metric={coachResult ? `${coachResult.final}/100` : "—"} onClick={() => goTo("coach")} />
            <ModuleCard icon={Trello} color={C.sage} title="Ferramenta de Vendas" desc="Gerencie seu funil, faturamento e o time comercial." metricLabel="Pipeline aberto" metric={fmtBRL(pipelineValue)} onClick={() => goTo("vendas")} />
            {isMaster && (
              <ModuleCard icon={BarChart2} color={C.ink} title="Ferramenta de Gestão" desc="Margem, metas, estoque e indicadores do negócio." metricLabel="Margem média" metric={gestao && gestao.rows?.length ? `${Math.round(overallAvgMargin)}%` : "—"} onClick={() => goTo("gestao")} />
            )}
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, color: C.ink, marginBottom: 14 }}>Panorama de Performance</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16 }}>
              <KPI icon={Briefcase} label="Faturamento (mês)" value={fmtBRL(monthRealized)} sub={`meta: ${fmtBRL(monthTarget)}`} />
              <KPI icon={Percent} label="Margem média" value={gestao && gestao.rows?.length ? `${Math.round(overallAvgMargin)}%` : "—"} sub={isMaster ? "todas as categorias" : "restrito ao Master"} />
              <KPI icon={Target} label="Ticket médio" value={fmtBRL(avgTicket)} sub="por negócio fechado" />
              <KPI icon={Users} label="Conversão" value={winRate === null ? "—" : `${winRate}%`} sub="fechados vs. perdidos" />
            </div>
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Faturamento nos últimos 6 meses</div>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={last6}>
                  <XAxis dataKey="mes" tick={{ fill: C.muted, fontSize: 10, fontFamily: "Inter" }} axisLine={false} tickLine={false} />
                  <Bar dataKey="valor" fill={C.gold} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {isMaster && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14.5, color: C.ink, marginBottom: 12 }}>Alertas</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {stockAlerts.length > 0 && <AlertRow icon={AlertTriangle} tone={C.danger} title="Ruptura/excesso de estoque" desc={`${stockAlerts.length} produtos`} onClick={() => goTo("gestao")} />}
                {marginAlerts.length > 0 && <AlertRow icon={Percent} tone={C.gold} title="Margem abaixo do alvo" desc={`${marginAlerts.length} categorias`} onClick={() => goTo("gestao")} />}
                {noFollowUp.length > 0 && <AlertRow icon={Clock} tone={C.gold} title="Follow-up pendente" desc={`${noFollowUp.length} oportunidades`} onClick={() => goTo("vendas")} />}
                {overdue.length > 0 && <AlertRow icon={Clock} tone={C.danger} title="Fechamento atrasado" desc={`${overdue.length} oportunidades`} onClick={() => goTo("vendas")} />}
                {totalAlerts === 0 && <div style={{ fontSize: 12, color: C.muted }}>Nenhum alerta no momento.</div>}
              </div>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14.5, color: C.ink, marginBottom: 12 }}>Atividade recente</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {recentActivities.length === 0 && <div style={{ fontSize: 12, color: C.muted }}>Nenhuma atividade ainda.</div>}
                {recentActivities.map((a, i) => (
                  <div key={i} style={{ fontSize: 12, color: C.inkSoft, lineHeight: 1.4 }}>
                    <span style={{ color: C.ink }}>{a.text}</span>
                    <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>{fmtRelative(a.date)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, color, label, value, sub }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: color + "22", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={13} color={color} />
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", color: C.muted }}>{label.toUpperCase()}</div>
      </div>
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 22, color: C.ink }}>{value}</div>
      <div style={{ fontSize: 11, color: C.muted }}>{sub}</div>
    </div>
  );
}

function ModuleCard({ icon: Icon, color, title, desc, metricLabel, metric, onClick }) {
  return (
    <button onClick={onClick} style={{ textAlign: "left", background: C.card, border: `1px solid ${C.border}`, borderTop: `3px solid ${color}`, borderRadius: 12, padding: 18, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ width: 38, height: 38, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={17} color="#fff" />
      </div>
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, color: C.ink }}>{title}</div>
      <div style={{ fontSize: 11.5, color: C.inkSoft, lineHeight: 1.4 }}>{desc}</div>
      <div style={{ marginTop: 4 }}>
        <div style={{ fontSize: 10, color: C.muted }}>{metricLabel}</div>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color }}>{metric}</div>
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color, marginTop: 4 }}>Acessar módulo →</div>
    </button>
  );
}

function KPI({ icon: Icon, label, value, sub }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.muted, fontSize: 11 }}>
        <Icon size={12} /> {label}
      </div>
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 18, color: C.ink, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 10, color: C.muted }}>{sub}</div>
    </div>
  );
}

function AlertRow({ icon: Icon, tone, title, desc, onClick }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
      <div style={{ width: 30, height: 30, borderRadius: "50%", background: tone + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={14} color={tone} />
      </div>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{title}</div>
        <div style={{ fontSize: 11, color: C.muted }}>{desc}</div>
      </div>
    </button>
  );
}

