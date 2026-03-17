#!/usr/bin/env node

/**
 * Test the patient invitation flow without sending an email.
 * - Creates a patient invitation via Convex action (sendEmail: false)
 * - Prints the returned invitation code
 * - Derives the expected production link
 * - Verifies normalization via preview action (the same logic used by the email content)
 *
 * Usage (Windows PowerShell):
 *   node scripts/test-patient-invite-flow.js <PATIENT_EMAIL> [PATIENT_NAME]
 *
 * Example:
 *   node scripts/test-patient-invite-flow.js patient@example.com "Test Patient"
 *
 * Requirements:
 * - Logged-in session normally required to call actions; run from an environment that has permissions
 * - Set NEXT_PUBLIC_CONVEX_URL in .env.local or your environment
 */

const { ConvexHttpClient } = require('convex/browser');
const { api } = require('../convex/_generated/api');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const patientEmail = process.argv[2];
  const patientName = process.argv[3] || undefined;

  if (!patientEmail) {
    console.error('Usage: node scripts/test-patient-invite-flow.js <PATIENT_EMAIL> [PATIENT_NAME]');
    process.exit(1);
  }

  const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!CONVEX_URL) {
    console.error('Error: NEXT_PUBLIC_CONVEX_URL is not set. Add it to .env.local or your environment.');
    process.exit(1);
  }

  const client = new ConvexHttpClient(CONVEX_URL);

  try {
    console.log('\nCreating invitation (sendEmail: false) ...');
    const invitationResult = await client.action(
      api.actions.patients.invitePatient.createPatientInvitationWithNotification,
      {
        patientEmail,
        patientName,
        notes: 'Test invitation from script',
        sendEmail: false,
        expirationDays: 7,
      }
    );

    console.log('Action result:', invitationResult);

    if (!invitationResult?.success || !invitationResult?.invitationCode) {
      console.error('\nFAIL: Invitation was not created.');
      process.exit(2);
    }

    const code = invitationResult.invitationCode;
    const prodLink = `https://www.physioaroundme.com/patient-invite/${code}`;
    const localhostLink = `http://localhost:3000/patient-invite/${code}`;

    console.log('\nDerived production link:', prodLink);
    console.log('Derived localhost link: ', localhostLink);

    // Verify normalization using the same code path used by the email action
    console.log('\nVerifying normalization via preview action ...');
    const previewFromLocalhost = await client.action(
      api.actions.emails.sendInvitationEmail.previewNormalizedPatientInvitationLink,
      { invitationLink: localhostLink, invitationCode: code }
    );

    console.log('Preview (from localhost) =>', previewFromLocalhost);

    const previewFromProd = await client.action(
      api.actions.emails.sendInvitationEmail.previewNormalizedPatientInvitationLink,
      { invitationLink: prodLink, invitationCode: code }
    );

    console.log('Preview (from prod)      =>', previewFromProd);

    if (!previewFromLocalhost.isProduction || !previewFromProd.isProduction) {
      console.error('\nFAIL: Normalization did not produce a production URL.');
      process.exit(3);
    }

    console.log('\nPASS: Invitation link normalization ensures production domain is used.');
  } catch (err) {
    console.error('Test failed:', err?.message || err);
    process.exit(1);
  }
}

main();
