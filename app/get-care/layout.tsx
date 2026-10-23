import { redirect } from 'next/navigation';
import { joyWhatsAppUrl } from '@/lib/joyWhatsApp';

// Booking now goes through Joy on WhatsApp, so this page is no longer shown (page.tsx is kept for now).
export default function GetCareLayout() {
  redirect(joyWhatsAppUrl("Hi Joy! I'd like to book physiotherapy with Rehabify."));
}
