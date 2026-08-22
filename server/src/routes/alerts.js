import { Router } from "express";
import { sendAlert } from "../lib/twilio.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

// Same pattern used in Iconic Storm Watch: fires a WhatsApp/SMS message with a
// fixed title + a short body. Here it's used for follow-up reminders on stalled leads.
router.post("/follow-up/:leadId", async (req, res) => {
  const { to } = req.body; // phone number in E.164, e.g. +5511999999999
  if (!to) return res.status(400).json({ error: "Número de destino é obrigatório." });

  const lead = await prisma.lead.findFirst({ where: { id: req.params.leadId, userId: req.userId } });
  if (!lead) return res.status(404).json({ error: "Lead não encontrado." });

  const body = `D.O.N.E — Lembrete de follow-up\n"${lead.name}" (${lead.stage}) está parado há um tempo. Hora de retomar o contato.`;
  const result = await sendAlert(to, body);
  res.json({ ok: true, result });
});

export default router;

