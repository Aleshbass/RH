#!/usr/bin/env node

/**
 * Quick sanity-check for Patient Dashboard readiness.
 * Run with:  node scripts/test-patient-dashboard.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const green = '\x1b[32m';
const red = '\x1b[31m';
const yellow = '\x1b[33m';
const reset = '\x1b[0m';

function log(msg, colour = '') {
  console.log(`${colour}${msg}${reset}`);
}

let failed = false;
function assert(condition, message) {
  if (!condition) {
    failed = true;
    log(`❌ ${message}`, red);
  } else {
    log(`✅ ${message}`, green);
  }
}

log('\n🧪 Patient Dashboard Readiness Check');

// 1. Required component files
const componentFiles = [
  'components/dashboard/patient/PatientDashboard.tsx',
  'components/dashboard/patient/PatientDashboardHeader.tsx',
  'components/dashboard/patient/PatientStatsCards.tsx',
  'components/dashboard/shared/DashboardHeader.tsx',
];
log('\n📁 Checking component files...');
componentFiles.forEach(f => assert(fs.existsSync(f), `File exists: ${f}`));

// 2. Required route files
const routeFiles = [
  'app/dashboard/patient/page.tsx',
  'app/dashboard/patient/messages/page.tsx',
];
log('\n🛣️ Checking route files...');
routeFiles.forEach(f => assert(fs.existsSync(f), `Route exists: ${f}`));

// 3. Convex backend modules
const convexFiles = [
  'convex/patients.ts',
  'convex/appointments.ts',
  'convex/treatmentPlans.ts',
  'convex/notifications.ts',
];
log('\n⚡ Checking Convex backend modules...');
convexFiles.forEach(f => assert(fs.existsSync(f), `Convex file exists: ${f}`));

// 4. Schema tables
log('\n📜 Checking Convex schema tables...');
const schemaContent = fs.readFileSync('convex/schema.ts', 'utf8');
['patients', 'appointments', 'treatmentPlans', 'treatmentProgress', 'notifications'].forEach(table => {
  assert(schemaContent.includes(`${table}:`), `Schema table "${table}" declared`);
});

// 5. TypeScript compile quick check
log('\n📝 TypeScript compilation (skipLibCheck)...');
try {
  execSync('npx tsc --noEmit --skipLibCheck', { stdio: 'pipe' });
  log('TypeScript compile: OK', green);
} catch (e) {
  failed = true;
  log('TypeScript compile errors detected', red);
}

// Summary
if (failed) {
  log('\n🚨 Patient Dashboard readiness: FAILED', red);
  process.exit(1);
} else {
  log('\n🎉 Patient Dashboard readiness: PASSED', green);
} 