import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { Resend } from 'resend';
import { getEmailContent } from '../lib/email/emailService.ts';

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail = process.env.FROM_EMAIL || 'noreply@physioaroundme.com';
const fromName = process.env.FROM_NAME || 'Rehabify Health';
const adminEmail = process.env.PLATFORM_ADMIN_EMAIL || 'admin@physioaroundme.com';

async function sendApprovedEmail() {
  const emailContent = getEmailContent({
    to: adminEmail,
    template: 'PARTNER_APPLICATION_APPROVED',
    data: {
      organizationName: 'Lagos Island Specialist Hospital',
      partnerCode: 'lagos_island_hospital',
      contactName: 'Dr. Babatunde Sanwo',
      dashboardLink: `${process.env.NEXT_PUBLIC_APP_URL || 'https://rehabifyhealth.com'}/partners/portal`,
      portalLink: `${process.env.NEXT_PUBLIC_APP_URL || 'https://rehabifyhealth.com'}/partners/portal`,
      approvedBy: 'Rehabify Clinical Operations',
    },
  });

  const response = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to: [adminEmail],
    subject: emailContent.subject,
    html: emailContent.body,
  });

  console.log('Approved live email sent result:', JSON.stringify(response, null, 2));
}

sendApprovedEmail().catch(console.error);
