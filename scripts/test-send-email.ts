#!/usr/bin/env tsx

/*
  Test script to send an email using Resend via our emailService.
  - Mode "invite": sends INVITATION_CREATED to the recipient
  - Mode "welcome": sends ONBOARDING_COMPLETE to the recipient

  Usage examples:
    pnpm test:email -- --mode invite --to someone@example.com --name "John Doe"
    pnpm test:email -- --mode welcome --to someone@example.com --name "John Doe"

  This verifies that RESEND_API_KEY and FROM_EMAIL (and domain verification) are working
  in the current environment where this script runs.
*/

import { config as dotenvConfig } from 'dotenv';
// Load .env first, then fallback to .env.local if present
try { dotenvConfig(); } catch { /* no-op */ }
try { dotenvConfig({ path: '.env.local', override: false }); } catch { /* no-op */ }

import { sendEmail } from '../lib/email/emailService';

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return undefined;
}

async function main() {
  const mode = (getArg('--mode') || 'invite').toLowerCase();
  const to = getArg('--to') || process.env.TEST_EMAIL;
  const name = getArg('--name') || 'Test User';

  if (!to) {
    console.error('Missing --to argument (or TEST_EMAIL env).');
    console.error('Usage: pnpm test:email -- --mode invite --to someone@example.com --name "John Doe"');
    process.exit(1);
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (mode === 'invite') {
    const invitationCode = Math.random().toString(36).slice(2, 10);
    const invitationLink = `${baseUrl}/patient-invite/${invitationCode}`;
    console.log(`Sending INVITATION_CREATED to ${to} with code ${invitationCode}`);

    const result = await sendEmail({
      to,
      template: 'INVITATION_CREATED',
      data: {
        patientName: name,
        physiotherapistName: 'Test Physiotherapist',
        invitationCode,
        invitationLink,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      },
    });

    if (result.success) {
      console.log(`✅ Email sent successfully (messageId: ${result.messageId || 'N/A'})`);
      process.exit(0);
    }
    console.error(`❌ Email failed: ${result.error || 'Unknown error'}`);
    process.exit(2);
  }

  if (mode === 'welcome') {
    const dashboardLink = `${baseUrl}/dashboard/patient`;
    console.log(`Sending ONBOARDING_COMPLETE to ${to}`);

    const result = await sendEmail({
      to,
      template: 'ONBOARDING_COMPLETE',
      data: {
        userName: name,
        dashboardLink,
      },
    });

    if (result.success) {
      console.log(`✅ Email sent successfully (messageId: ${result.messageId || 'N/A'})`);
      process.exit(0);
    }
    console.error(`❌ Email failed: ${result.error || 'Unknown error'}`);
    process.exit(2);
  }

  console.error(`Unknown --mode: ${mode}. Use "invite" or "welcome".`);
  process.exit(1);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(2);
});
