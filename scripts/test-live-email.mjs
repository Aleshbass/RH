import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { Resend } from 'resend';
import { getEmailContent } from '../lib/email/emailService.ts';

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail = process.env.FROM_EMAIL || 'noreply@physioaroundme.com';
const fromName = process.env.FROM_NAME || 'Rehabify Health';
const adminEmail = process.env.PLATFORM_ADMIN_EMAIL || 'admin@physioaroundme.com';

console.log('Sending live Apple-inspired Partner Application Submitted email to:', adminEmail);

async function sendLiveEmail() {
  const emailContent = getEmailContent({
    to: adminEmail,
    template: 'PARTNER_APPLICATION_SUBMITTED',
    data: {
      organizationName: 'Lagos Island Specialist Hospital',
      organizationType: 'hospital',
      contactName: 'Dr. Babatunde Sanwo',
      contactEmail: 'babatunde@lagosislandhospital.ng',
      contactPhone: '+234 803 123 4567',
      coverageStates: ['Lagos', 'Ogun', 'Abuja FCT'],
      reviewLink: `${process.env.NEXT_PUBLIC_APP_URL || 'https://rehabifyhealth.com'}/dashboard/admin/partnerships`,
    },
  });

  const response = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to: [adminEmail],
    subject: emailContent.subject,
    html: emailContent.body,
  });

  console.log('Live email sent result:', JSON.stringify(response, null, 2));
}

sendLiveEmail().catch(console.error);
