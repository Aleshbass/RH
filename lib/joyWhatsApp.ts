const JOY_NUMBER = (process.env.NEXT_PUBLIC_JOY_WHATSAPP_NUMBER || "2348061525811").replace(/\D/g, "");

/** A WhatsApp chat with Joy, opened with `text` already typed. */
export function joyWhatsAppUrl(text: string) {
  return `https://wa.me/${JOY_NUMBER}?text=${encodeURIComponent(text)}`;
}

/** Joy answers this by sending a fresh one-tap dashboard link (/go/<code>). */
export const DASHBOARD_LINK_REQUEST_URL = joyWhatsAppUrl("Hi Joy, please send me my Rehabify dashboard link.");
