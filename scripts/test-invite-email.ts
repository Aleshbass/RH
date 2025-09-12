#!/usr/bin/env tsx

/*
  Test script: send a patient invitation via Convex action and verify email delivery flag.
  Usage:
    pnpm test:invite-email -- --email someone@example.com --name "John Doe" --notes "Optional notes"

  Requirements:
    - NEXT_PUBLIC_CONVEX_URL must be set (Convex deployment URL)
    - Convex project environment must have RESEND_API_KEY and FROM_EMAIL configured
*/

import 'dotenv/config';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api';

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return undefined;
}

async function main() {
  const email = getArg('--email') || process.env.TEST_PATIENT_EMAIL;
  const name = getArg('--name') || 'Test Patient';
  const notes = getArg('--notes') || 'Automated invite test';

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    console.error('NEXT_PUBLIC_CONVEX_URL is not set. Please configure your Convex deployment URL.');
    process.exit(1);
  }
  if (!email) {
    console.error('Missing --email argument (or TEST_PATIENT_EMAIL env).');
    console.error('Usage: pnpm test:invite-email -- --email someone@example.com --name "John Doe"');
    process.exit(1);
  }

  const client = new ConvexHttpClient(convexUrl);

  console.log('Sending invitation via Convex action...');
  try {
    const result = await client.action(
      api.actions.patients.invitePatient.createPatientInvitationWithNotification,
      {
        patientEmail: email,
        patientName: name,
        notes,
        sendEmail: true,
      }
    );

    console.log('Action result:', result);
    const emailSent = (result as { emailSent?: boolean }).emailSent === true;
    if (result.success && emailSent) {
      console.log(`✅ Invitation created and email sent to ${email}`);
      process.exit(0);
    }
    if (result.success) {
      console.warn('⚠️ Invitation created, but email was not confirmed as sent.');
      console.warn('   - Check Convex env RESEND_API_KEY / FROM_EMAIL and Resend domain verification.');
      process.exit(0);
    }
    console.error('❌ Invitation action failed:', result.message);
    process.exit(2);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('❌ Error calling invite action:', msg);
    process.exit(2);
  }
}

main();
