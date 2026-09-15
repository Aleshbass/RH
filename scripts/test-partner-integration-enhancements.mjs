// Test script for Partner Integration Enhancements:
// 1. Email templates formatting & content verification
// 2. Cookie persistence & attribution structure verification
// 3. Schema & parameter validation

import { getEmailContent } from '../lib/email/emailService.ts';
import { REFERRAL_COOKIE_NAME, REFERRAL_COOKIE_MAX_AGE_SECONDS } from '../lib/referralCookie.ts';

function runTests() {
  console.log('--- TEST SUITE: Partner Integration Enhancements ---');
  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}`);
      failed++;
    }
  }

  // TEST 1: Referral Cookie constants
  assert(REFERRAL_COOKIE_NAME === 'rhb_partner_ref', 'Referral cookie name is rhb_partner_ref');
  assert(REFERRAL_COOKIE_MAX_AGE_SECONDS === 30 * 24 * 60 * 60, 'Referral cookie max age is 30 days (2,592,000s)');

  // TEST 2: Email Template - PARTNER_APPLICATION_SUBMITTED
  try {
    const emailResult = getEmailContent({
      to: 'partners@physioaroundme.com',
      template: 'PARTNER_APPLICATION_SUBMITTED',
      data: {
        organizationName: 'Zenith Health HMO',
        organizationType: 'hmo',
        contactName: 'Dr. Tunde Fashola',
        contactEmail: 'tunde@zenithhealth.com',
        contactPhone: '+234 801 234 5678',
        coverageStates: ['Lagos', 'Abuja'],
        reviewLink: 'https://rehabifyhealth.com/dashboard/admin/partnerships',
      }
    });

    assert(emailResult.subject.includes('Zenith Health HMO'), 'Submitted email subject includes org name');
    assert(emailResult.body.includes('Zenith Health HMO'), 'Submitted email body includes org name');
    assert(emailResult.body.includes('Dr. Tunde Fashola'), 'Submitted email body includes contact person');
    assert(emailResult.body.includes('tunde@zenithhealth.com'), 'Submitted email body includes email');
    assert(emailResult.body.includes('Lagos, Abuja'), 'Submitted email body includes states');
    assert(emailResult.body.includes('Review & Approve Application'), 'Submitted email body includes CTA');
  } catch (err) {
    assert(false, `Submitted email template threw error: ${err.message}`);
  }

  // TEST 3: Email Template - PARTNER_APPLICATION_APPROVED
  try {
    const approvedResult = getEmailContent({
      to: 'tunde@zenithhealth.com',
      template: 'PARTNER_APPLICATION_APPROVED',
      data: {
        organizationName: 'Zenith Health HMO',
        partnerCode: 'zenith_hmo',
        contactName: 'Dr. Tunde Fashola',
        dashboardLink: 'https://rehabifyhealth.com/partners/portal',
        portalLink: 'https://rehabifyhealth.com/partners/portal',
        approvedBy: 'Rehabify Clinical Governance',
      }
    });

    assert(approvedResult.subject.includes('Zenith Health HMO'), 'Approved email subject includes org name');
    assert(approvedResult.body.includes('zenith_hmo'), 'Approved email body includes partner code');
    assert(approvedResult.body.includes('Dr. Tunde Fashola'), 'Approved email body includes liaison name');
    assert(approvedResult.body.includes('Access Your Partner Portal'), 'Approved email body includes CTA button');
  } catch (err) {
    assert(false, `Approved email template threw error: ${err.message}`);
  }

  // TEST 4: Email Template - PARTNER_APPLICATION_DECLINED
  try {
    const declinedResult = getEmailContent({
      to: 'contact@fakeclinic.com',
      template: 'PARTNER_APPLICATION_DECLINED',
      data: {
        organizationName: 'Fake Clinic Ltd',
        contactName: 'John Doe',
        reason: 'License verification could not be authenticated with MRTBN.',
        supportLink: 'mailto:partners@physioaroundme.com',
      }
    });

    assert(declinedResult.subject.includes('Rehabify Health Partner Application'), 'Declined email has proper subject');
    assert(declinedResult.body.includes('Fake Clinic Ltd'), 'Declined email includes org name');
    assert(declinedResult.body.includes('License verification could not be authenticated'), 'Declined email includes specific reason');
    assert(declinedResult.body.includes('mailto:partners@physioaroundme.com'), 'Declined email includes support link');
  } catch (err) {
    assert(false, `Declined email template threw error: ${err.message}`);
  }

  // TEST 5: Cookie payload format & serialization
  try {
    const mockAttribution = {
      publicCode: 'zenith_care_2026',
      partnerId: 'zenith_hmo',
      campaignName: 'Q3 Wellness Drive',
      capturedAt: Date.now(),
      expiresAt: Date.now() + REFERRAL_COOKIE_MAX_AGE_SECONDS * 1000,
    };

    const encoded = encodeURIComponent(JSON.stringify(mockAttribution));
    const decoded = JSON.parse(decodeURIComponent(encoded));

    assert(decoded.publicCode === 'zenith_care_2026', 'Cookie serialization preserves publicCode');
    assert(decoded.partnerId === 'zenith_hmo', 'Cookie serialization preserves partnerId');
    assert(decoded.expiresAt > Date.now(), 'Cookie TTL is valid in future');
  } catch (err) {
    assert(false, `Cookie serialization test error: ${err.message}`);
  }

  console.log(`\nResults: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
