import "dotenv/config";
import "express-async-errors";
import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.js";
import coachRoutes from "./routes/coach.js";
import leadsRoutes from "./routes/leads.js";
import goalsRoutes from "./routes/goals.js";
import gestaoRoutes from "./routes/gestao.js";
import billingRoutes, { } from "./routes/billing.js";
import alertsRoutes from "./routes/alerts.js";
import teamRoutes from "./routes/team.js";
import creditoRoutes from "./routes/credito.js";
import chatRoutes from "./routes/chat.js";
import dreRoutes from "./routes/dre.js";
import { requireAuth } from "./middleware/auth.js";
import { runFollowUpCheck } from "./jobs/followUp.js";
import { runCnpjMonitorCheck } from "./jobs/monitorCnpj.js";
import { runWeeklyReportCheck } from "./jobs/weeklyReport.js";

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || "*" }));

// Stripe webhook needs the raw body — mount it BEFORE express.json().
app.use("/api/billing/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

// -------- Agendador leve do follow-up automático --------
// O plano free do Render não tem um serviço de Cron Job de verdade, então em vez
// de um processo separado, aproveitamos o tráfego que já chega no done-api: a cada
// requisição, checamos se já faz tempo suficiente desde a última verificação e, se
// sim, rodamos em background (sem travar a resposta). O próprio job já evita reenviar
// alerta duplicado (dedupe por lead), então rodar um pouco mais ou menos vezes ao dia
// não causa spam — só faz a checagem acontecer perto de quando alguém está usando a
// plataforma (ou de um ping de uptime monitor), em vez de num horário fixo.
const FOLLOW_UP_MIN_INTERVAL_MS = 18 * 60 * 60 * 1000; // ~18h entre checagens
let lastFollowUpCheck = 0;
let followUpRunning = false;

app.use((req, res, next) => {
  const now = Date.now();
  if (!followUpRunning && now - lastFollowUpCheck > FOLLOW_UP_MIN_INTERVAL_MS) {
    followUpRunning = true;
    lastFollowUpCheck = now;
    runFollowUpCheck()
      .catch((e) => console.error("[followup] falha na checagem em background:", e))
      .finally(() => { followUpRunning = false; });
  }
  next();
});

// -------- Agendador leve do monitoramento contínuo de CNPJ --------
// Mesma técnica do follow-up acima — situação cadastral muda raramente, então o
// próprio job só reconsulta CNPJs que já passaram do intervalo de 7 dias.
const CNPJ_MONITOR_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000; // dispara a checagem no máximo 1x por dia
let lastCnpjMonitorCheck = 0;
let cnpjMonitorRunning = false;

app.use((req, res, next) => {
  const now = Date.now();
  if (!cnpjMonitorRunning && now - lastCnpjMonitorCheck > CNPJ_MONITOR_MIN_INTERVAL_MS) {
    cnpjMonitorRunning = true;
    lastCnpjMonitorCheck = now;
    runCnpjMonitorCheck()
      .catch((e) => console.error("[cnpj-monitor] falha na checagem em background:", e))
      .finally(() => { cnpjMonitorRunning = false; });
  }
  next();
});

// -------- Agendador leve do relatório semanal por e-mail --------
const WEEKLY_REPORT_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000; // dispara a checagem no máximo 1x por dia
let lastWeeklyReportCheck = 0;
let weeklyReportRunning = false;

app.use((req, res, next) => {
  const now = Date.now();
  if (!weeklyReportRunning && now - lastWeeklyReportCheck > WEEKLY_REPORT_MIN_INTERVAL_MS) {
    weeklyReportRunning = true;
    lastWeeklyReportCheck = now;
    runWeeklyReportCheck()
      .catch((e) => console.error("[weekly-report] falha na checagem em background:", e))
      .finally(() => { weeklyReportRunning = false; });
  }
  next();
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/coach", requireAuth, coachRoutes);
app.use("/api/leads", requireAuth, leadsRoutes);
app.use("/api/goals", requireAuth, goalsRoutes);
app.use("/api/gestao", requireAuth, gestaoRoutes);
app.use("/api/billing", (req, res, next) => (req.path === "/webhook" ? next() : requireAuth(req, res, next)), billingRoutes);
app.use("/api/alerts", requireAuth, alertsRoutes);
app.use("/api/team", requireAuth, teamRoutes);
app.use("/api/credito", requireAuth, creditoRoutes);
app.use("/api/chat", requireAuth, chatRoutes);
app.use("/api/dre", requireAuth, dreRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno no servidor." });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`D.O.N.E API rodando na porta ${port}`));

