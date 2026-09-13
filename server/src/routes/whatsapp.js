import { Router } from "express";
import express from "express";
import twilio from "twilio";
import { prisma } from "../lib/prisma.js";

const router = Router();

function normalizePhone(raw) {
  return (raw || "").replace(/^whatsapp:/, "").trim();
}

// Webhook público do Twilio — mensagem de entrada no WhatsApp de um cliente em potencial.
// Sem requireAuth (o Twilio não é um usuário logado da plataforma); autenticado pela
// assinatura HMAC que o Twilio envia em cada requisição (X-Twilio-Signature).
// Twilio manda o corpo como application/x-www-form-urlencoded, não JSON — precisa do
// parser próprio aqui, já que o app inteiro usa express.json() por padrão.
router.post("/inbound", express.urlencoded({ extended: false }), async (req, res) => {
  const signature = req.headers["x-twilio-signature"];
  const url = `${process.env.API_PUBLIC_URL}/api/whatsapp/inbound`;
  const valid = process.env.TWILIO_AUTH_TOKEN && signature
    ? twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, url, req.body)
    : false;

  if (!valid) {
    console.warn("[whatsapp] assinatura inválida ou ausente — requisição ignorada.");
    return res.status(403).send("Invalid signature");
  }

  const toNumber = normalizePhone(req.body.To);
  const fromNumber = normalizePhone(req.body.From);
  const messageBody = (req.body.Body || "").trim();
  const profileName = req.body.ProfileName || null;

  const org = toNumber ? await prisma.organization.findUnique({ where: { whatsappNumber: toNumber } }) : null;

  if (!org) {
    console.warn(`[whatsapp] nenhuma organização associada ao número ${toNumber || "(vazio)"}.`);
    return res.type("text/xml").send("<Response></Response>");
  }

  const addonActive = await prisma.subscription.findFirst({
    where: { organizationId: org.id, module: "whatsapp", status: { in: ["active", "trialing"] } },
  });
  if (!addonActive) {
    console.warn(`[whatsapp] organização ${org.id} (${org.name}) recebeu mensagem mas não tem o add-on ativo — lead não criado.`);
    return res.type("text/xml").send("<Response></Response>");
  }

  const lead = await prisma.lead.create({
    data: {
      organizationId: org.id,
      name: profileName || fromNumber || "Contato via WhatsApp",
      phone: fromNumber || null,
      stage: "Novo Lead",
      source: "whatsapp",
    },
  });

  if (messageBody) {
    const master = await prisma.user.findFirst({ where: { organizationId: org.id, role: "master" } });
    if (master) {
      await prisma.leadNote.create({
        data: { leadId: lead.id, authorId: master.id, content: `Mensagem recebida via WhatsApp: "${messageBody}"` },
      });
    }
  }

  res.type("text/xml").send("<Response></Response>");
});

export default router;
