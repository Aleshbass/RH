// Script to verify partner authentication and API handler structures
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

console.log("=== VERIFYING PARTNER INTEGRATIONS SETUP ===");

// 1. Check Convex URL
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
console.log("Convex URL configured:", convexUrl ? "YES" : "NO");

// 2. Check Mintlify Config
import fs from 'fs';
import path from 'path';

const rootMint = path.join(process.cwd(), 'mint.json');
const contentMint = path.join(process.cwd(), 'content', 'docs', 'mint.json');

console.log("Root mint.json exists:", fs.existsSync(rootMint));
console.log("Content mint.json exists:", fs.existsSync(contentMint));

if (fs.existsSync(rootMint)) {
  const content = JSON.parse(fs.readFileSync(rootMint, 'utf-8'));
  console.log("Mintlify name:", content.name);
  console.log("Mintlify navigation groups:", content.navigation.map(g => g.group).join(', '));
}

// 3. Verify API Route Handlers exist
const routes = [
  'app/api/v1/partners/referrals/route.ts',
  'app/api/v1/partners/referrals/[referralId]/route.ts',
  'app/api/v1/partners/eligibility/route.ts',
  'app/api/v1/partners/providers/search/route.ts',
  'app/api/v1/partners/reports/[referralId]/route.ts',
  'app/track/page.tsx',
  'app/track/[id]/page.tsx',
  'lib/partner-auth.ts',
  'convex/partners.ts',
];

console.log("\nChecking created files:");
let allExist = true;
for (const r of routes) {
  const fullPath = path.join(process.cwd(), r);
  const exists = fs.existsSync(fullPath);
  console.log(`- ${r}: ${exists ? "OK" : "MISSING"}`);
  if (!exists) allExist = false;
}

console.log("\nAll integration files exist:", allExist ? "YES" : "NO");
