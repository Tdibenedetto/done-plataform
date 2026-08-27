import nodemailer from "nodemailer";

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, CLIENT_URL, RESEND_API_KEY, RESEND_FROM } = process.env;

let transporter = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10000, // 10s para conectar — sem isso, uma porta bloqueada trava a requisição indefinidamente
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

if (!RESEND_API_KEY && !transporter) {
  console.warn("[mailer] Nenhum provedor de e-mail configurado (RESEND_API_KEY ou SMTP_*) — convites vão gerar link, mas o e-mail não será enviado de verdade.");
}

/**
 * Envia um e-mail. Prioriza o Resend (API via HTTPS — funciona em plataformas
 * como o Render, que bloqueiam portas de saída SMTP no plano padrão). Cai para
 * SMTP tradicional se o Resend não estiver configurado, para quem rodar a
 * plataforma em outro lugar sem essa restrição.
 */
async function sendEmail({ to, subject, html }) {
  if (RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: RESEND_FROM || "D.O.N.E <onboarding@resend.dev>", to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend recusou o envio (${res.status}): ${body.slice(0, 200)}`);
    }
    return { sent: true };
  }
  if (transporter) {
    await transporter.sendMail({ from: SMTP_FROM || SMTP_USER, to, subject, html });
    return { sent: true };
  }
  console.log(`[mailer:disabled] e-mail para ${to} não enviado — nenhum provedor configurado. Assunto: ${subject}`);
  return { sent: false };
}

export async function sendInviteEmail({ to, orgName, inviterName, token }) {
  const link = `${CLIENT_URL}/convite/${token}`;
  const html = `
    <p>Olá,</p>
    <p><strong>${inviterName}</strong> te convidou para fazer parte do time de <strong>${orgName}</strong> na plataforma D.O.N.E.</p>
    <p><a href="${link}">Clique aqui para criar sua conta</a></p>
    <p>Se o link não funcionar, copie e cole este endereço no navegador:<br>${link}</p>
  `;
  const result = await sendEmail({ to, subject: `${inviterName} te convidou para a equipe da ${orgName} no D.O.N.E`, html });
  return { ...result, link };
}

const INK = "#1C2130", GOLD = "#B8863A", SAGE = "#3B6B57", DANGER = "#A6462F", PAPER = "#FAF9F5", BORDER = "#E5E2D9", MUTED = "#6E7484";

function statCard(label, value, sub, color) {
  return `
    <td style="padding:14px 16px; background:${PAPER}; border:1px solid ${BORDER}; border-radius:10px;" width="50%">
      <div style="font-size:11px; color:${MUTED}; font-family:Arial,sans-serif;">${label}</div>
      <div style="font-size:22px; font-weight:700; color:${color || INK}; font-family:Georgia,serif; margin-top:2px;">${value}</div>
      ${sub ? `<div style="font-size:11px; color:${MUTED}; font-family:Arial,sans-serif; margin-top:2px;">${sub}</div>` : ""}
    </td>`;
}

/**
 * Envia o resumo semanal por e-mail para o Master — nota comercial, pipeline,
 * faturamento do mês vs meta, alertas de estoque e leads parados.
 */
export async function sendWeeklyReport({ to, orgName, data }) {
  const fmtBRL = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const pct = data.metaFaturamento > 0 ? Math.round((data.faturadoNoMes / data.metaFaturamento) * 100) : null;

  const html = `
  <div style="font-family:Arial,sans-serif; max-width:560px; margin:0 auto; background:#fff;">
    <div style="background:${INK}; padding:20px 24px;">
      <div style="color:${GOLD}; font-family:Georgia,serif; font-weight:700; font-size:20px; letter-spacing:1px;">D.O.N.E</div>
      <div style="color:#8A8F9C; font-size:11px; letter-spacing:2px; margin-top:2px;">RESUMO SEMANAL — ${orgName}</div>
    </div>
    <div style="padding:24px;">
      <p style="font-size:14px; color:${INK}; line-height:1.5;">Aqui está o panorama da última semana.</p>

      <table width="100%" cellpadding="0" cellspacing="8" style="margin:14px 0;">
        <tr>
          ${statCard("Nota Comercial", data.notaComercial !== null ? `${data.notaComercial}/100` : "—", data.notaComercial === null ? "faça o diagnóstico" : null, GOLD)}
          ${statCard("Faturado no mês", fmtBRL(data.faturadoNoMes), pct !== null ? `${pct}% da meta (${fmtBRL(data.metaFaturamento)})` : null, SAGE)}
        </tr>
        <tr>
          ${statCard("Pipeline aberto", fmtBRL(data.pipelineRaw), `${fmtBRL(data.pipelineWeighted)} ponderado`, INK)}
          ${statCard("Leads parados", `${data.leadsParados}`, data.leadsParados > 0 ? "precisam de follow-up" : "tudo em dia", data.leadsParados > 0 ? DANGER : SAGE)}
        </tr>
      </table>

      ${data.hasGestaoData ? `
      <div style="background:${PAPER}; border:1px solid ${BORDER}; border-radius:10px; padding:14px 16px; margin:14px 0;">
        <div style="font-size:11px; color:${MUTED};">Alertas de estoque</div>
        <div style="font-size:14px; color:${INK}; margin-top:4px;">
          <strong style="color:${DANGER}">${data.rupturas}</strong> em ruptura · <strong style="color:${GOLD}">${data.excessos}</strong> em excesso
        </div>
      </div>` : ""}

      <a href="${CLIENT_URL}" style="display:inline-block; background:${INK}; color:${GOLD}; text-decoration:none; padding:10px 20px; border-radius:8px; font-size:13px; font-weight:600; margin-top:8px;">Abrir a plataforma →</a>

      <p style="font-size:11px; color:${MUTED}; margin-top:24px; border-top:1px solid ${BORDER}; padding-top:14px;">
        Você recebe este e-mail semanalmente por ser o Master da conta ${orgName} no D.O.N.E.
      </p>
    </div>
  </div>`;

  return sendEmail({ to, subject: `D.O.N.E — Resumo semanal de ${orgName}`, html });
}
