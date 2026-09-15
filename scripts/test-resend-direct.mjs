import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { Resend } from 'resend';

console.log('--- RESEND DIRECT DELIVERY DIAGNOSTIC ---');
console.log('RESEND_API_KEY present:', !!process.env.RESEND_API_KEY);
console.log('FROM_EMAIL:', process.env.FROM_EMAIL);
console.log('FROM_NAME:', process.env.FROM_NAME);
console.log('PLATFORM_ADMIN_EMAIL:', process.env.PLATFORM_ADMIN_EMAIL);

const resend = new Resend(process.env.RESEND_API_KEY);

async function testDirectSend() {
  const fromEmail = process.env.FROM_EMAIL || 'onboarding@resend.dev';
  const fromName = process.env.FROM_NAME || 'Rehabify Health';
  const targetEmail = process.env.PLATFORM_ADMIN_EMAIL || 'admin@physioaroundme.com';

  console.log(`\nAttempting to send email from: "${fromName} <${fromEmail}>" to: "${targetEmail}"...`);

  try {
    const result = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: [targetEmail],
      subject: 'Rehabify Health Test - Resend Diagnostic',
      html: '<p>This is a diagnostic test to verify Resend delivery.</p>',
    });

    console.log('Resend send response:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Direct send caught error:', err);
  }
}

testDirectSend();
