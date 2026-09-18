import { getEmailContent } from "../lib/email/emailService.ts";

console.log("==================================================");
console.log("🧪 TESTING REFERRAL EMAIL TEMPLATES RENDERING");
console.log("==================================================");

const partnerData = {
  partnerName: "WellaHealth Partner Operations",
  contactName: "Dr. Kemi Adebayo",
  patientName: "Oluwaseun Adeleke",
  trackingCode: "RHB-84920",
  trackingUrl: "https://physioaroundme.com/track/RHB-84920",
  whatsappIntakeUrl: "https://wa.me/2348061525811?text=REHAB_REF_RHB-84920",
  whatsappPhone: "+2348061525811",
  condition: "Post-stroke mobility rehab & hemiparesis",
  priority: "urgent",
  createdAt: Date.now(),
};

const partnerEmail = getEmailContent({
  to: "partner@wellahealth.com",
  template: "PARTNER_REFERRAL_CREATED",
  data: partnerData,
});

console.log("\n📬 1. PARTNER EMAIL RENDER TEST");
console.log("Subject:", partnerEmail.subject);
console.log("Body length:", partnerEmail.body.length);
console.log("Contains Tracking Code:", partnerEmail.body.includes("RHB-84920"));
console.log("Contains WhatsApp Intake URL:", partnerEmail.body.includes("https://wa.me/2348061525811?text=REHAB_REF_RHB-84920"));
console.log("Contains Contact Name:", partnerEmail.body.includes("Dr. Kemi Adebayo"));
console.log("Contains Priority Badge:", partnerEmail.body.includes("urgent"));

const adminData = {
  partnerName: "WellaHealth",
  patientName: "Oluwaseun Adeleke",
  patientPhone: "+2348012345678",
  patientEmail: "oluwaseun.test@gmail.com",
  trackingCode: "RHB-84920",
  trackingUrl: "https://physioaroundme.com/track/RHB-84920",
  whatsappIntakeUrl: "https://wa.me/2348061525811?text=REHAB_REF_RHB-84920",
  whatsappPhone: "+2348061525811",
  condition: "Post-stroke mobility rehab & hemiparesis",
  priority: "urgent",
  city: "Lagos",
  recommendedSessions: 6,
  adminDashboardLink: "https://physioaroundme.com/dashboard/admin/referrals",
  createdAt: Date.now(),
};

const adminEmail = getEmailContent({
  to: "admin@physioaroundme.com",
  template: "ADMIN_REFERRAL_CREATED",
  data: adminData,
});

console.log("\n📬 2. ADMIN EMAIL RENDER TEST");
console.log("Subject:", adminEmail.subject);
console.log("Body length:", adminEmail.body.length);
console.log("Contains Patient Name:", adminEmail.body.includes("Oluwaseun Adeleke"));
console.log("Contains Patient Phone:", adminEmail.body.includes("+2348012345678"));
console.log("Contains WhatsApp Link:", adminEmail.body.includes("https://wa.me/2348061525811?text=REHAB_REF_RHB-84920"));
console.log("Contains Call Button/Link:", adminEmail.body.includes("tel:+2348012345678"));
console.log("Contains Dashboard Link:", adminEmail.body.includes("https://physioaroundme.com/dashboard/admin/referrals"));

if (
  partnerEmail.body.includes("RHB-84920") &&
  partnerEmail.body.includes("https://wa.me/2348061525811") &&
  adminEmail.body.includes("+2348012345678") &&
  adminEmail.body.includes("tel:+2348012345678") &&
  adminEmail.body.includes("https://physioaroundme.com/dashboard/admin/referrals")
) {
  console.log("\n🎉 ALL REFERRAL EMAIL TEMPLATE ASSERTIONS PASSED!");
} else {
  console.error("\n❌ Template assertion failed!");
  process.exit(1);
}
