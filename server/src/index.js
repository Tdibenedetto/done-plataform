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
import { requireAuth } from "./middleware/auth.js";

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || "*" }));

// Stripe webhook needs the raw body — mount it BEFORE express.json().
app.use("/api/billing/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/coach", requireAuth, coachRoutes);
app.use("/api/leads", requireAuth, leadsRoutes);
app.use("/api/goals", requireAuth, goalsRoutes);
app.use("/api/gestao", requireAuth, gestaoRoutes);
app.use("/api/billing", (req, res, next) => (req.path === "/webhook" ? next() : requireAuth(req, res, next)), billingRoutes);
app.use("/api/alerts", requireAuth, alertsRoutes);
app.use("/api/team", requireAuth, teamRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno no servidor." });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`D.O.N.E API rodando na porta ${port}`));

