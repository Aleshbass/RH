#!/usr/bin/env node

/**
 * Preview utility: Normalize a patient invitation link via Convex action
 *
 * This DOES NOT send any email. It calls the Convex action
 * actions/emails/sendInvitationEmail.previewNormalizedPatientInvitationLink
 * to apply the same normalization logic used by the email action and returns
 * the final URL that would appear in the email button/QR/direct link.
 *
 * Usage (Windows PowerShell):
 *   node scripts/preview-invite-link.js <INVITATION_CODE> [INVITATION_LINK]
 *
 * Examples:
 *   node scripts/preview-invite-link.js TESTCODE
 *   node scripts/preview-invite-link.js TESTCODE http://localhost:3000/patient-invite/TESTCODE
 *
 * Requirements:
 * - Set NEXT_PUBLIC_CONVEX_URL in .env.local or environment
 */

const { ConvexHttpClient } = require('convex/browser');
const { api } = require('../convex/_generated/api');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const code = process.argv[2];
  const providedLink = process.argv[3];

  if (!code) {
    console.error('Usage: node scripts/preview-invite-link.js <INVITATION_CODE> [INVITATION_LINK]');
    process.exit(1);
  }

  const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!CONVEX_URL) {
    console.error('Error: NEXT_PUBLIC_CONVEX_URL is not set. Add it to .env.local or your environment.');
    process.exit(1);
  }

  const defaultLink = `http://localhost:3000/patient-invite/${code}`;
  const invitationLink = providedLink || defaultLink;

  const client = new ConvexHttpClient(CONVEX_URL);

  try {
    const result = await client.action(
      api.actions.emails.sendInvitationEmail.previewNormalizedPatientInvitationLink,
      { invitationLink, invitationCode: code }
    );

    const { normalizedLink, isProduction } = result;
    console.log('Input link:     ', invitationLink);
    console.log('Normalized link:', normalizedLink);
    console.log('Is production:  ', isProduction);

    if (!isProduction) {
      console.error('\nFAIL: Normalized link is not using https://physioaroundme.com');
      process.exit(2);
    }

    console.log('\nPASS: Invitation link correctly uses the production domain.');
  } catch (err) {
    console.error('Action call failed:', err?.message || err);
    process.exit(1);
  }
}

main();
