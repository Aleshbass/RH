#!/usr/bin/env tsx
/**
 * Manual Test Script for Onboarding Fixes
 * 
 * This script provides a guided testing workflow for the three fixes:
 * 1. Admin email notifications
 * 2. Manual video meeting links
 * 3. Auto-redirect after approval
 * 
 * Usage: npx tsx scripts/test-onboarding-fixes.ts
 */

import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message: string, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`${colors.cyan}${prompt}${colors.reset}`, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function waitForEnter(message = 'Press Enter to continue...') {
  await question(message);
}

async function testAdminEmailNotification() {
  log('\n========================================', colors.bright);
  log('TEST 1: ADMIN EMAIL NOTIFICATION', colors.bright);
  log('========================================\n', colors.bright);

  log('This test will verify that admins receive email notifications when users complete onboarding.\n', colors.blue);

  log('STEPS:', colors.yellow);
  log('1. Open your browser and navigate to the sign-up page');
  log('2. Create a new physiotherapist or clinic owner account');
  log('3. Complete ALL onboarding steps (step1, step2, step3)');
  log('4. On the final step, submit the form');
  log('5. Check admin email inbox\n');

  await waitForEnter();

  log('\n📧 Checking console logs...', colors.cyan);
  log('Open browser DevTools Console (F12) and look for:', colors.yellow);
  log('  ✓ "[completeUserProfile] Notifying X admin(s)..."', colors.green);
  log('  ✓ "[completeUserProfile] Scheduling email to admin [email]..."', colors.green);
  log('  ✓ "[completeUserProfile] Admin notifications complete..."', colors.green);

  const logsFound = await question('\nDid you see these logs in the console? (y/n): ');

  if (logsFound.toLowerCase() === 'y') {
    log('✅ Console logs confirmed!', colors.green);
  } else {
    log('❌ Console logs not found. Check:', colors.red);
    log('  - Browser console is open (F12)');
    log('  - You completed the final onboarding step');
    log('  - No JavaScript errors in console');
  }

  log('\n📬 Checking admin email...', colors.cyan);
  const emailReceived = await question('Did the admin receive an email notification? (y/n): ');

  if (emailReceived.toLowerCase() === 'y') {
    log('✅ Admin email notification working!', colors.green);
    
    const emailSubject = await question('What is the email subject line? ');
    if (emailSubject.includes('Action Required') || emailSubject.includes('Approval')) {
      log('✅ Correct email subject!', colors.green);
    }

    const hasLink = await question('Does the email contain a link to the admin dashboard? (y/n): ');
    if (hasLink.toLowerCase() === 'y') {
      log('✅ Email contains approval link!', colors.green);
    }
  } else {
    log('❌ Email not received. Check:', colors.red);
    log('  - RESEND_API_KEY is set in environment variables');
    log('  - Admin user has a valid email in the database');
    log('  - Email is not in spam folder');
    log('  - Convex logs for email errors');
  }

  log('\n🔔 Checking in-app notification...', colors.cyan);
  const inAppNotification = await question('Does admin see an in-app notification? (y/n): ');

  if (inAppNotification.toLowerCase() === 'y') {
    log('✅ In-app notification created!', colors.green);
  } else {
    log('⚠️  In-app notification not visible', colors.yellow);
    log('  Check admin dashboard notifications panel');
  }

  log('\n' + '='.repeat(40), colors.bright);
  log('TEST 1 SUMMARY', colors.bright);
  log('='.repeat(40), colors.bright);
  
  const results = {
    consoleLogs: logsFound.toLowerCase() === 'y',
    emailReceived: emailReceived.toLowerCase() === 'y',
    inAppNotification: inAppNotification.toLowerCase() === 'y',
  };

  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.values(results).length;

  log(`\nResults: ${passed}/${total} checks passed`, passed === total ? colors.green : colors.yellow);
  
  if (passed === total) {
    log('🎉 Test 1 PASSED!', colors.green);
  } else {
    log('⚠️  Test 1 PARTIALLY PASSED', colors.yellow);
  }

  return results;
}

async function testManualMeetingLink() {
  log('\n========================================', colors.bright);
  log('TEST 2: MANUAL VIDEO MEETING LINK', colors.bright);
  log('========================================\n', colors.bright);

  log('This test will verify that physiotherapists can add manual video meeting links to appointments.\n', colors.blue);

  log('STEPS:', colors.yellow);
  log('1. Log in as an APPROVED physiotherapist');
  log('2. Navigate to Appointments page');
  log('3. Click "Book Appointment" or "Create Appointment"');
  log('4. Look for the video meeting link field\n');

  await waitForEnter();

  log('\n🔍 Checking for video meeting link field...', colors.cyan);
  const fieldVisible = await question('Do you see a "Video Meeting Link" field in the form? (y/n): ');

  if (fieldVisible.toLowerCase() === 'y') {
    log('✅ Field is visible!', colors.green);

    const hasIcon = await question('Does the field have a 📹 emoji or video icon? (y/n): ');
    if (hasIcon.toLowerCase() === 'y') {
      log('✅ Field has proper icon!', colors.green);
    }

    const hasPlaceholder = await question('Does it have a placeholder like "https://meet.google.com/..."? (y/n): ');
    if (hasPlaceholder.toLowerCase() === 'y') {
      log('✅ Field has helpful placeholder!', colors.green);
    }

    const hasDescription = await question('Is there a description mentioning "Google Meet, Zoom, etc."? (y/n): ');
    if (hasDescription.toLowerCase() === 'y') {
      log('✅ Field has helpful description!', colors.green);
    }
  } else {
    log('❌ Field not visible. Check:', colors.red);
    log('  - You are logged in as an approved physiotherapist');
    log('  - You opened the appointment booking modal');
    log('  - Modal loaded completely');
    return { fieldVisible: false };
  }

  log('\n✍️  Testing field functionality...', colors.cyan);
  log('Enter a test Google Meet link in the field (e.g., https://meet.google.com/abc-defg-hij)');
  
  const linkEntered = await question('Did you enter a meeting link? (y/n): ');

  if (linkEntered.toLowerCase() === 'y') {
    log('Now complete the rest of the form and submit the appointment...', colors.yellow);
    await waitForEnter('Press Enter after submitting...');

    const saved = await question('Did the appointment save successfully? (y/n): ');
    
    if (saved.toLowerCase() === 'y') {
      log('✅ Appointment saved!', colors.green);

      log('\n🔎 Verifying the link was saved...', colors.cyan);
      log('1. Find the appointment you just created');
      log('2. Click to view appointment details');
      
      const linkVisible = await question('Can you see the meeting link in the appointment details? (y/n): ');
      
      if (linkVisible.toLowerCase() === 'y') {
        log('✅ Meeting link saved and displayed!', colors.green);

        const linkClickable = await question('Is the link clickable? (y/n): ');
        if (linkClickable.toLowerCase() === 'y') {
          log('✅ Link is clickable!', colors.green);
        }
      } else {
        log('❌ Meeting link not visible in details', colors.red);
        log('  Check browser console for errors');
      }
    } else {
      log('❌ Appointment failed to save', colors.red);
      log('  Check browser console for errors');
    }
  }

  log('\n' + '='.repeat(40), colors.bright);
  log('TEST 2 SUMMARY', colors.bright);
  log('='.repeat(40), colors.bright);

  const passed = fieldVisible.toLowerCase() === 'y';
  
  if (passed) {
    log('🎉 Test 2 PASSED!', colors.green);
  } else {
    log('❌ Test 2 FAILED', colors.red);
  }

  return { passed };
}

async function testAutoRedirect() {
  log('\n========================================', colors.bright);
  log('TEST 3: AUTO-REDIRECT AFTER APPROVAL', colors.bright);
  log('========================================\n', colors.bright);

  log('This test will verify that users are automatically redirected after admin approval.\n', colors.blue);

  log('SETUP:', colors.yellow);
  log('You will need TWO browser windows/tabs:');
  log('  Tab 1: Pending physiotherapist/clinic owner (on pending approval page)');
  log('  Tab 2: Admin user (to approve the account)\n');

  const ready = await question('Do you have both tabs ready? (y/n): ');
  
  if (ready.toLowerCase() !== 'y') {
    log('Please set up both tabs and restart this test.', colors.yellow);
    return { passed: false };
  }

  log('\n📋 TESTING STEPS:', colors.cyan);
  log('1. In Tab 1 (pending user): Verify you see "Pending Approval" or similar message');
  log('2. In Tab 1: Open Browser Console (F12) and keep it visible');
  log('3. In Tab 2 (admin): Navigate to Admin → Users → Pending Approvals');
  log('4. In Tab 2: Find the pending user and click "Approve"');
  log('5. In Tab 2: Confirm the approval');
  log('6. WATCH Tab 1 for automatic redirect\n');

  await waitForEnter('Press Enter when ready to start...');

  log('\n⏳ Approve the account in the admin tab now...', colors.yellow);
  log('Keep watching Tab 1 (pending user) for changes...\n');

  const redirected = await question('Did Tab 1 automatically redirect to the dashboard? (y/n): ');

  if (redirected.toLowerCase() === 'y') {
    log('✅ Auto-redirect working!', colors.green);

    const howLong = await question('How many seconds did it take? (estimate): ');
    const seconds = parseInt(howLong) || 0;

    if (seconds <= 3) {
      log('✅ Redirect was fast (within 3 seconds)!', colors.green);
    } else if (seconds <= 10) {
      log('⚠️  Redirect took longer than expected but still worked', colors.yellow);
    } else {
      log('⚠️  Redirect was slow. Check network connection.', colors.yellow);
    }

    const noRefresh = await question('Did it redirect WITHOUT you manually refreshing? (y/n): ');
    if (noRefresh.toLowerCase() === 'y') {
      log('✅ No manual refresh needed!', colors.green);
    }
  } else {
    log('❌ Auto-redirect not working. Check:', colors.red);
    log('  - Approval was actually saved (check admin tab)');
    log('  - Convex real-time connection is active');
    log('  - No JavaScript errors in console');
  }

  log('\n🔍 Checking console logs...', colors.cyan);
  log('In Tab 1 (pending user), look for this log:', colors.yellow);
  log('  "[DashboardAuthGuard] User approved, redirecting to..."', colors.green);

  const logFound = await question('Did you see this log? (y/n): ');
  
  if (logFound.toLowerCase() === 'y') {
    log('✅ Redirect log confirmed!', colors.green);
  } else {
    log('⚠️  Log not found. DashboardAuthGuard may not have triggered', colors.yellow);
  }

  log('\n🔁 Testing for redirect loops...', colors.cyan);
  log('Stay on the dashboard for 10 seconds and watch for any unwanted redirects...\n');
  await waitForEnter('Press Enter after waiting 10 seconds...');

  const noLoop = await question('Did the page stay on the dashboard (no loops)? (y/n): ');
  
  if (noLoop.toLowerCase() === 'y') {
    log('✅ No redirect loops detected!', colors.green);
  } else {
    log('❌ Redirect loop detected!', colors.red);
    log('  This is a critical bug - check DashboardAuthGuard.tsx');
  }

  log('\n' + '='.repeat(40), colors.bright);
  log('TEST 3 SUMMARY', colors.bright);
  log('='.repeat(40), colors.bright);

  const results = {
    redirected: redirected.toLowerCase() === 'y',
    logFound: logFound.toLowerCase() === 'y',
    noLoop: noLoop.toLowerCase() === 'y',
  };

  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.values(results).length;

  log(`\nResults: ${passed}/${total} checks passed`, passed === total ? colors.green : colors.yellow);
  
  if (passed === total) {
    log('🎉 Test 3 PASSED!', colors.green);
  } else if (passed >= 2) {
    log('⚠️  Test 3 PARTIALLY PASSED', colors.yellow);
  } else {
    log('❌ Test 3 FAILED', colors.red);
  }

  return results;
}

async function main() {
  log('\n' + '='.repeat(50), colors.bright);
  log('  ONBOARDING FIXES - AUTOMATED TEST SCRIPT  ', colors.bright);
  log('='.repeat(50) + '\n', colors.bright);

  log('This script will guide you through testing all three fixes:', colors.blue);
  log('  1. Admin Email Notifications', colors.cyan);
  log('  2. Manual Video Meeting Links', colors.cyan);
  log('  3. Auto-Redirect After Approval', colors.cyan);
  log('');

  const testChoice = await question('Which test would you like to run? (1/2/3/all): ');

  const results: any = {};

  if (testChoice === '1' || testChoice === 'all') {
    results.test1 = await testAdminEmailNotification();
  }

  if (testChoice === '2' || testChoice === 'all') {
    results.test2 = await testManualMeetingLink();
  }

  if (testChoice === '3' || testChoice === 'all') {
    results.test3 = await testAutoRedirect();
  }

  // Final summary
  log('\n\n' + '='.repeat(50), colors.bright);
  log('  FINAL TEST SUMMARY  ', colors.bright);
  log('='.repeat(50) + '\n', colors.bright);

  if (testChoice === 'all') {
    const allPassed = Object.values(results).every((r: any) => {
      if (typeof r === 'object') {
        return Object.values(r).every(Boolean);
      }
      return r;
    });

    if (allPassed) {
      log('🎉🎉🎉 ALL TESTS PASSED! 🎉🎉🎉', colors.green);
      log('\nAll three fixes are working correctly!', colors.green);
      log('✅ Admin email notifications', colors.green);
      log('✅ Manual video meeting links', colors.green);
      log('✅ Auto-redirect after approval', colors.green);
    } else {
      log('⚠️  SOME TESTS FAILED OR PARTIALLY PASSED', colors.yellow);
      log('\nPlease review the failed tests and:', colors.yellow);
      log('  - Check browser console for errors');
      log('  - Verify environment variables');
      log('  - Review the implementation code');
      log('  - Check Convex logs for backend errors');
    }
  }

  log('\n📚 For detailed documentation, see:', colors.cyan);
  log('  - ONBOARDING_AND_VIDEO_FIXES.md');
  log('  - IMPLEMENTATION_SUMMARY.md');
  log('  - QUICK_START_GUIDE.md\n');

  rl.close();
}

main().catch(console.error);
