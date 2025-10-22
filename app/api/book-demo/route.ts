import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, phone, clinicName, message } = body;

    // Validate required fields
    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    // Use a valid from address (fallback to onboarding@resend.dev in non-prod or when not configured)
    const fromAddress = process.env.RESEND_FROM_EMAIL ||
      (process.env.NODE_ENV === "production"
        ? "Rehabify Demo Requests <noreply@rehabifyhealth.com>"
        : "Rehabify Demo Requests <onboarding@resend.dev>");

    // Send email to admin/sales team
    const adminEmail = await resend.emails.send({
      from: fromAddress,
      to: process.env.DEMO_REQUEST_EMAIL || "sales@rehabifyhealth.com",
      replyTo: email,
      subject: `New Demo Request from ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: #002e2c; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">New Demo Request</h1>
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #002e2c; margin-top: 0;">Contact Information</h2>
            
            <div style="margin-bottom: 20px;">
              <strong style="color: #005b57;">Name:</strong>
              <p style="margin: 5px 0;">${name}</p>
            </div>
            
            <div style="margin-bottom: 20px;">
              <strong style="color: #005b57;">Email:</strong>
              <p style="margin: 5px 0;"><a href="mailto:${email}" style="color: #005b57;">${email}</a></p>
            </div>
            
            ${phone ? `
              <div style="margin-bottom: 20px;">
                <strong style="color: #005b57;">Phone:</strong>
                <p style="margin: 5px 0;">${phone}</p>
              </div>
            ` : ''}
            
            ${clinicName ? `
              <div style="margin-bottom: 20px;">
                <strong style="color: #005b57;">Clinic/Practice Name:</strong>
                <p style="margin: 5px 0;">${clinicName}</p>
              </div>
            ` : ''}
            
            ${message ? `
              <div style="margin-bottom: 20px;">
                <strong style="color: #005b57;">Message:</strong>
                <p style="margin: 5px 0; padding: 15px; background-color: #f5f5f5; border-radius: 5px;">${message}</p>
              </div>
            ` : ''}
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
              <p>This demo request was submitted from the Rehabify landing page.</p>
              <p>Please respond within 24 hours.</p>
            </div>
          </div>
        </div>
      `,
    });

    // Send confirmation email to the requester
    const confirmationEmail = await resend.emails.send({
      from: fromAddress,
      to: email,
      subject: "Demo Request Received - Rehabify",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: #002e2c; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">Thank You for Your Interest!</h1>
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px; line-height: 1.6;">Hi ${name},</p>
            
            <p style="font-size: 16px; line-height: 1.6;">
              Thank you for requesting a demo of Rehabify! We're excited to show you how our platform can transform your physiotherapy practice.
            </p>
            
            <p style="font-size: 16px; line-height: 1.6;">
              Our team will review your request and contact you within 24 hours to schedule a personalized demo at your convenience.
            </p>
            
            <div style="background-color: #f0f9ff; padding: 20px; border-left: 4px solid #005b57; margin: 20px 0;">
              <h3 style="color: #002e2c; margin-top: 0;">What to Expect:</h3>
              <ul style="line-height: 1.8; color: #333;">
                <li>30-minute personalized walkthrough</li>
                <li>See key features relevant to your practice</li>
                <li>Q&A session with our product experts</li>
                <li>Custom pricing discussion</li>
              </ul>
            </div>
            
            <p style="font-size: 16px; line-height: 1.6;">
              In the meantime, feel free to explore our learning resources at
              <a href="https://www.rehabifylearn.com/" style="color: #005b57; text-decoration: none;"> rehabifylearn.com</a>.
            </p>
            
            <p style="font-size: 16px; line-height: 1.6;">
              Best regards,<br>
              <strong>The Rehabify Team</strong>
            </p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px; text-align: center;">
              <p>If you have any urgent questions, please contact us at <a href="mailto:support@rehabifyhealth.com" style="color: #005b57;">support@rehabifyhealth.com</a></p>
            </div>
          </div>
        </div>
      `,
    });

    return NextResponse.json({
      success: true,
      message: "Demo request sent successfully",
      adminEmailId: adminEmail.data?.id,
      confirmationEmailId: confirmationEmail.data?.id,
    });
  } catch (error: any) {
    console.error("Error sending demo request email:", error);
    return NextResponse.json(
      {
        error: "Failed to send demo request",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
