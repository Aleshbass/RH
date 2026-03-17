"use node";
// @ts-nocheck

const { actionGeneric } = require("convex/server");

export const sendVerificationBadgeConfirmation = actionGeneric(async (ctx: any, args: any) => {
  const { userEmail, userName, tier, amount, expiresAt, paymentReference } = args;
    
  if (!userEmail) {
    console.error("No email provided");
    return { success: false };
  }
  
  const tierDisplay = tier === "12_month" ? "12-Month" : 
                     tier === "monthly" ? "Monthly" : "Yearly";
  
  const expiryDate = new Date(expiresAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  
  // Email template
  const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #FF69B4, #9333EA); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .header h1 { color: white; margin: 0; font-size: 28px; }
          .badge-icon { font-size: 60px; margin: 10px 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; }
          .badge-info { background: linear-gradient(135deg, #FFF0F5, #F3E8FF); padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #FFB6C1; }
          .badge-info h3 { color: #9333EA; margin-top: 0; }
          .details { margin: 15px 0; }
          .details strong { color: #005b57; }
          .benefits { background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .benefit { padding: 8px 0; }
          .benefit::before { content: "✓"; color: #10b981; font-weight: bold; margin-right: 10px; }
          .button { display: inline-block; background: linear-gradient(135deg, #005b57, #FF69B4); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="badge-icon">🎉</div>
            <h1>Verification Badge Activated!</h1>
            <p style="color: white; margin: 10px 0;">Your profile is now verified</p>
          </div>
          
          <div class="content">
            <p>Dear ${userName || "Valued Professional"},</p>
            
            <p>Congratulations! Your verification badge purchase has been successfully processed, and your profile is now verified on RehabifyHealth.</p>
            
            <div class="badge-info">
              <h3>✨ Badge Details</h3>
              <div class="details">
                <strong>Plan:</strong> ${tierDisplay} Badge<br>
                <strong>Amount Paid:</strong> ₦${(args.amount / 100).toLocaleString()}<br>
                <strong>Payment Reference:</strong> ${args.paymentReference}<br>
                <strong>Expires:</strong> ${expiryDate}
              </div>
            </div>
            
            <div class="benefits">
              <h3 style="color: #005b57; margin-top: 0;">What You Get:</h3>
              <div class="benefit">Verified badge displayed on your profile</div>
              <div class="benefit">Rank first in marketplace search results</div>
              <div class="benefit">Build trust with potential patients</div>
              <div class="benefit">Increased profile views and bookings</div>
              <div class="benefit">Priority support from our team</div>
            </div>
            
            <p>Your verified badge is now live and patients can see it when they view your profile. You'll automatically appear at the top of search results in the marketplace.</p>
            
            <center>
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/physiotherapist/marketplace" class="button">
                View Your Profile
              </a>
            </center>
            
            <p style="margin-top: 30px; font-size: 14px; color: #666;">
              Your badge will automatically expire on <strong>${expiryDate}</strong>. We'll send you a reminder before it expires so you can renew and maintain your verified status.
            </p>
          </div>
          
          <div class="footer">
            <p>Thank you for choosing RehabifyHealth!</p>
            <p>Need help? Contact us at <a href="mailto:support@physioaroundme.com">support@physioaroundme.com</a></p>
            <p>&copy; ${new Date().getFullYear()} RehabifyHealth. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
  `;
  
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
      console.error("Failed to send verification badge email:", await response.text());
      return { success: false };
    }
    
    const result = await response.json();
    console.log("Verification badge email sent:", result);
    
    return { success: true, emailId: result.id };
  } catch (error) {
    console.error("Error sending verification badge email:", error);
    return { success: false, error: String(error) };
  }
});
