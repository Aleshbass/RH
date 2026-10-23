/**
 * Backup for the MediLoan application link. MyItura texts it to the patient; if the text
 * doesn't arrive, the admin or physio can send it on WhatsApp in one tap. Safe in the browser.
 */

/** Nigerian numbers in wa.me form (234…, digits only), or null. */
export function whatsappNumber(phone: string | undefined | null): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('234') && digits.length >= 13) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `234${digits.slice(1)}`;
  if (digits.length === 10) return `234${digits}`;
  return digits.length >= 10 ? digits : null;
}

export function mediLoanMessage(firstName: string, applicationUrl: string) {
  const name = firstName.trim() || 'there';
  return `Hi ${name}, here is your MediLoan application link for your physiotherapy with Rehabify: ${applicationUrl}\n\nMediLoan is provided by MyItura. The link expires in 7 days.`;
}

/** wa.me link that opens WhatsApp with the message ready to send, or null without a phone. */
export function mediLoanWhatsAppUrl(phone: string | undefined | null, firstName: string, applicationUrl: string): string | null {
  const number = whatsappNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(mediLoanMessage(firstName, applicationUrl))}` : null;
}
