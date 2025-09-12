#!/usr/bin/env node

/**
 * Send a REAL test patient invitation email via Convex (no auth required)
 * This uses the email action directly (not the invitation-creation action),
 * so it does NOT require an authenticated physiotherapist.
 *
 * It intentionally sends a localhost invitationLink to verify the email action
 * normalizes it to https://www.rehabifyhealth.com in the delivered email.
 *
 * Usage (Windows PowerShell):
 *   node scripts/send-test-invite-email.js <RECIPIENT_EMAIL> [PATIENT_NAME] [PHYSIOTHERAPIST_NAME]
 *
 * Example:
 *   node scripts/send-test-invite-email.js recipient@example.com "Test Patient" "Test Physio"
 *
 * Requirements:
 * - NEXT_PUBLIC_CONVEX_URL must be set in .env.local or environment
 * - RESEND_API_KEY must be configured in Convex environment variables (Dashboard)
 */

const { ConvexHttpClient } = require('convex/browser');
const { api } = require('../convex/_generated/api');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const patientEmail = process.argv[2];
  const patientName = process.argv[3] || 'Test Patient';
  const physiotherapistName = process.argv[4] || 'Test Physiotherapist';

  if (!patientEmail) {
    console.error('Usage: node scripts/send-test-invite-email.js <RECIPIENT_EMAIL> [PATIENT_NAME] [PHYSIOTHERAPIST_NAME]');
    process.exit(1);
  }

  const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!CONVEX_URL) {
    console.error('Error: NEXT_PUBLIC_CONVEX_URL is not set. Add it to .env.local or your environment.');
    process.exit(1);
  }

  const client = new ConvexHttpClient(CONVEX_URL);

  // Generate a test invitation code and an intentionally-localhost link
  const code = `TEST-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString().slice(-6)}`;
  const localhostLink = `http://localhost:3000/patient-invite/${code}`;
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

  console.log('\nSending test invitation email ...');
  console.log('  To:                   ', patientEmail);
  console.log('  Patient Name:         ', patientName);
  console.log('  Physiotherapist Name: ', physiotherapistName);
  console.log('  Invitation Code:      ', code);
  console.log('  Intentional Link:     ', localhostLink, '(should be normalized in email)');

  try {
    const result = await client.action(
      api.actions.emails.sendInvitationEmail.sendPatientInvitationEmail,
      {
        patientEmail,
        patientName,
        physiotherapistName,
        invitationCode: code,
        invitationLink: localhostLink,
        expiresAt,
      }
    );

    console.log('\nAction result:', result);
    if (!result?.success) {
      console.error('\nFAIL: Email send failed. Ensure RESEND_API_KEY is configured in Convex env.');
      process.exit(2);
    }

    // Also show what the email action would normalize to
    const preview = await client.action(
      api.actions.emails.sendInvitationEmail.previewNormalizedPatientInvitationLink,
      { invitationLink: localhostLink, invitationCode: code }
    );
    console.log('\nPreview normalization:', preview);

    console.log('\nPASS: Email sent. Check your inbox. The link should use https://www.rehabifyhealth.com.');
  } catch (err) {
    console.error('Error:', err?.message || err);
    process.exit(1);
  }
}

main();
