"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { publicAppUrl } from "../../helpers/appUrl";
import { escapeHtml } from "../../helpers/escapeHtml";
import { actions, button, checklist, details, emailDate, greeting, heading, highlight, paragraph, renderEmail } from "../../../lib/email/layout";

/**
 * Verification badge confirmation email. Internal: scheduled by
 * marketplace/verification after a Paystack-verified payment activates the badge, with
 * the physiotherapist's address taken from the users table.
 */
export const sendVerificationBadgeConfirmation = internalAction({
  args: {
    userEmail: v.string(),
    userName: v.optional(v.string()),
    tier: v.union(v.literal("monthly"), v.literal("12_month"), v.literal("yearly")),
    amount: v.number(), // kobo
    expiresAt: v.number(),
    paymentReference: v.string(),
  },
  handler: async (_ctx, args) => {
  const { userEmail, userName, tier, expiresAt } = args;
    
  if (!userEmail) {
    console.error("No email provided");
    return { success: false };
  }
  
  const tierDisplay = tier === "12_month" ? "12-Month" : 
                     tier === "monthly" ? "Monthly" : "Yearly";
  
  const expiryDate = emailDate(expiresAt);

  const emailHtml = renderEmail({
    eyebrow: "Badge activated",
    tone: "success",
    title: "Your profile is now verified",
    preheader: `Your ${tierDisplay} verification badge is live until ${expiryDate}.`,
    body: [
      greeting(escapeHtml(userName || "Valued Professional")),
      paragraph("Congratulations! Your verification badge payment went through, and your profile now carries the verified badge on Rehabify."),
      highlight({ label: "Amount paid", value: `₦${(args.amount / 100).toLocaleString("en-NG")}`, sub: `${tierDisplay} badge` }),
      details([
        ["Plan", `${tierDisplay} badge`],
        ["Payment reference", escapeHtml(args.paymentReference)],
        ["Valid until", expiryDate],
      ]),
      heading("What you get"),
      checklist([
        "Verified badge displayed on your profile",
        "Rank first in marketplace search results",
        "Build trust with potential patients",
        "More profile views and bookings",
        "Priority support from our team",
      ]),
      actions(button("View your profile", `${publicAppUrl()}/dashboard/physiotherapist/marketplace`)),
      paragraph(`Your badge expires on <strong>${expiryDate}</strong>. We'll remind you before then so you can renew and keep your verified status.`, { muted: true, size: 15 }),
    ].join(""),
    footerNote: "You're receiving this because you bought a verification badge on Rehabify.",
  });
  
  try {
    // Send email using Resend
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "RehabifyHealth <info@physioaroundme.com>",
        to: [userEmail],
        subject: `🎉 Your Verification Badge is Active!`,
        html: emailHtml,
      }),
    });
    
    if (!response.ok) {
      console.error("Failed to send verification badge email: HTTP", response.status);
      return { success: false };
    }
    
    const result = await response.json();
    
    return { success: true, emailId: result.id };
  } catch (error) {
    console.error("Error sending verification badge email:", error);
    return { success: false, error: String(error) };
  }
  },
});
