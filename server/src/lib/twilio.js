import twilio from "twilio";

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env;

let client = null;
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
} else {
  console.warn("[twilio] credentials not set — alert sending is disabled until configured.");
}

export const isTwilioConfigured = !!client;

/**
 * Sends an SMS or WhatsApp alert. Mirrors the pattern used in Iconic Storm Watch:
 * pass `whatsapp:` prefix on both `to` and the configured from-number to send via WhatsApp.
 */
export async function sendAlert(to, body) {
  if (!client) {
    console.log(`[twilio:disabled] would send to ${to}: ${body}`);
    return { skipped: true };
  }
  return client.messages.create({ to, from: TWILIO_FROM_NUMBER, body });
}

