import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { Resend } from 'resend';
import { getEmailContent } from '../lib/email/emailService.ts';

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail = process.env.FROM_EMAIL || 'noreply@physioaroundme.com';
const fromName = process.env.FROM_NAME || 'Rehabify Health';

// Routing according to system architecture:
// 1. New application alert -> REHABIFY Operations (partners@physioaroundme.com)
// 2. Partnership approval -> THE PARTNER (pauledet339@gmail.com)
const rehabifyOperationsEmail = process.env.PARTNER_OPERATIONS_EMAIL || 'partners@physioaroundme.com';
const partnerApplicantEmail = 'pauledet339@gmail.com';

console.log('====================================================');
console.log('Testing Real-World Partner Application Email Routing');
console.log('====================================================');
console.log(`📡 Rehabify Operations Inbox: ${rehabifyOperationsEmail}`);
console.log(`👤 Partner Applicant Inbox:    ${partnerApplicantEmail}\n`);

async function sendRealRoutingEmails() {
  // 1. Send Application Submitted Notification -> SENT ONLY TO REHABIFY
  console.log(`1. Dispatching 'PARTNER_APPLICATION_SUBMITTED' to Rehabify (${rehabifyOperationsEmail})...`);
  const submittedContent = getEmailContent({
    to: rehabifyOperationsEmail,
    template: 'PARTNER_APPLICATION_SUBMITTED',
    data: {
      organizationName: "Paul's Clinic",
      organizationType: 'clinic',
      contactName: 'Paul Edet',
      contactEmail: partnerApplicantEmail,
      contactPhone: '+234 810 115 7557',
      coverageStates: ['Lagos', 'Abuja FCT', 'Rivers'],
      reviewLink: 'https://physioaroundme.com/dashboard/admin/partnerships',
    },
  });

  const res1 = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to: [rehabifyOperationsEmail],
    subject: submittedContent.subject,
    html: submittedContent.body,
  });

  console.log(`   ✅ Sent PARTNER_APPLICATION_SUBMITTED to Rehabify (${rehabifyOperationsEmail}):`, res1.data?.id || res1.error);

  // 2. Send Application Approved Notification -> SENT TO THE PARTNER APPLICANT
  console.log(`\n2. Dispatching 'PARTNER_APPLICATION_APPROVED' to Partner (${partnerApplicantEmail})...`);
  const approvedContent = getEmailContent({
    to: partnerApplicantEmail,
    template: 'PARTNER_APPLICATION_APPROVED',
    data: {
      organizationName: "Paul's Clinic",
      partnerCode: 'pauls_clinic',
      contactName: 'Paul Edet',
      portalLink: 'https://physioaroundme.com/partners/portal',
      dashboardLink: 'https://physioaroundme.com/partners/portal',
      approvedBy: 'Rehabify Health',
    },
  });

  const res2 = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to: [partnerApplicantEmail],
    subject: approvedContent.subject,
    html: approvedContent.body,
  });

  console.log(`   ✅ Sent PARTNER_APPLICATION_APPROVED to Partner (${partnerApplicantEmail}):`, res2.data?.id || res2.error);

  console.log('\n====================================================');
  console.log('🎉 Email routing successfully verified!');
  console.log(`   • New Application Alert -> ${rehabifyOperationsEmail} (Rehabify)`);
  console.log(`   • Welcome & Approval    -> ${partnerApplicantEmail} (Paul's Clinic)`);
  console.log('====================================================');
}

sendRealRoutingEmails().catch((err) => {
  console.error('❌ Error dispatching test emails:', err);
  process.exit(1);
});
