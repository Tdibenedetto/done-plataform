import nodemailer from "nodemailer";

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, CLIENT_URL } = process.env;

let transporter = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
} else {
  console.warn("[mailer] SMTP não configurado — convites vão gerar link, mas o e-mail não será enviado de verdade.");
}

export async function sendInviteEmail({ to, orgName, inviterName, token }) {
  const link = `${CLIENT_URL}/convite/${token}`;
  if (!transporter) {
    console.log(`[mailer:disabled] convite para ${to}: ${link}`);
    return { sent: false, link };
  }
  await transporter.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to,
    subject: `${inviterName} te convidou para a equipe da ${orgName} no D.O.N.E`,
    html: `
      <p>Olá,</p>
      <p><strong>${inviterName}</strong> te convidou para fazer parte do time de <strong>${orgName}</strong> na plataforma D.O.N.E.</p>
      <p><a href="${link}">Clique aqui para criar sua conta</a></p>
      <p>Se o link não funcionar, copie e cole este endereço no navegador:<br>${link}</p>
    `,
  });
  return { sent: true, link };
}

