import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read emailService.ts source to extract templates or test template rendering
const emailServiceSource = fs.readFileSync(
  path.resolve(__dirname, "../lib/email/emailService.ts"),
  "utf8"
);

console.log("==================================================");
console.log("🔍 AUDITING EMAIL TEMPLATES IN EMAILSERVICE.TS");
console.log("==================================================");

const hasPartnerTemplate = emailServiceSource.includes("case 'PARTNER_REFERRAL_CREATED':");
const hasAdminTemplate = emailServiceSource.includes("case 'ADMIN_REFERRAL_CREATED':");
const hasPartnerInterface = emailServiceSource.includes("export interface PartnerReferralCreatedData");
const hasAdminInterface = emailServiceSource.includes("export interface AdminReferralCreatedData");

console.log("Partner referral template present:", hasPartnerTemplate);
console.log("Admin referral template present:", hasAdminTemplate);
console.log("Partner interface present:", hasPartnerInterface);
console.log("Admin interface present:", hasAdminInterface);

// Check template contents
const containsWhatsappButton = emailServiceSource.includes("Chat with Joy on WhatsApp →");
const containsAdminWhatsapp = emailServiceSource.includes("💬 WhatsApp Patient");
const containsAdminCall = emailServiceSource.includes("📞 Call Patient");
const containsDashboardLink = emailServiceSource.includes("Open Admin Referrals Dashboard →");

console.log("WhatsApp button in partner email:", containsWhatsappButton);
console.log("WhatsApp button in admin email:", containsAdminWhatsapp);
console.log("Call button in admin email:", containsAdminCall);
console.log("Admin dashboard button in admin email:", containsDashboardLink);

if (
  hasPartnerTemplate &&
  hasAdminTemplate &&
  hasPartnerInterface &&
  hasAdminInterface &&
  containsWhatsappButton &&
  containsAdminWhatsapp &&
  containsAdminCall &&
  containsDashboardLink
) {
  console.log("\n🎉 ALL EMAIL AUDIT CHECKS PASSED PERFECTLY!");
} else {
  console.error("\n❌ Some email checks failed!");
  process.exit(1);
}
