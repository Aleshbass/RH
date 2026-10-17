import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { log } from '@/lib/monitoring/logger'
import { ErrorTracker } from '@/lib/monitoring/sentry'
import { isServerOrAdmin } from '../_auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // Not called from anywhere in the app today; only our server or an admin may use it.
  if (!(await isServerOrAdmin(request))) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }

  let userId: string | undefined

  try {
    const body = await request.json()
    const extractedData = body as { userId: string; accountName: string; bankName: string; accountNumber: string }
    userId = extractedData.userId
    const { accountName, bankName, accountNumber } = extractedData

    log.info('Sending bank connection confirmation email', {
      userId,
      action: 'bank_connection_email'
    })

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      log.warn('Resend API key missing; skipping email send', { action: 'bank_connection_email', userId })
      return NextResponse.json({ success: true, skipped: true })
    }
    const resend = new Resend(apiKey)

    // In a real implementation, you'd fetch physiotherapist email from database
    const physiotherapistEmail = `physio-${userId}@temp.com` // Temporary

    const emailResult = await resend.emails.send({
      from: `RehabifyHealth <${process.env.FROM_EMAIL || 'info@physioaroundme.com'}>`,
      to: physiotherapistEmail,
      subject: 'Bank Account Connected Successfully',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Bank Account Connected</title>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #10b981; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; }
              .success-box { background: #ecfdf5; border: 1px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 8px; }
              .details { background: #f9f9f9; padding: 15px; margin: 15px 0; border-radius: 5px; }
              .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; margin: 15px 0; border-radius: 5px; }
              .button { display: inline-block; padding: 12px 24px; background: #3b82f6; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎉 Bank Account Connected!</h1>
              </div>
              <div class="content">
                <div class="success-box">
                  <h2>✅ Connection Successful</h2>
                  <p>Your bank account has been successfully connected to your RehabifyHealth account. You can now receive payments directly to your bank account.</p>
                </div>
                
                <div class="details">
                  <h3>Connected Account Details:</h3>
                  <p><strong>Account Name:</strong> ${accountName}</p>
                  <p><strong>Bank:</strong> ${bankName}</p>
                  <p><strong>Account Number:</strong> ${accountNumber}</p>
                  <p><strong>Status:</strong> Active</p>
                  <p><strong>Connected:</strong> ${new Date().toLocaleDateString()}</p>
                </div>

                <h3>💰 How Payments Work:</h3>
                <ul>
                  <li><strong>Automatic Transfers:</strong> Payments are automatically transferred to your account within 24 hours</li>
                  <li><strong>Platform Fee:</strong> ₦1,000 platform fee per transaction</li>
                  <li><strong>Payment Processing:</strong> Paystack fees (1.5% + ₦100) are deducted</li>
                  <li><strong>Your Share:</strong> You receive the remaining amount after fees</li>
                </ul>

                <div class="warning">
                  <h4>⚠️ Important Security Notes:</h4>
                  <ul>
                    <li>Never share your account details with unauthorized persons</li>
                    <li>Monitor your account regularly for any unusual activity</li>
                    <li>Contact support immediately if you notice any discrepancies</li>
                    <li>You can update your bank account anytime from your dashboard</li>
                  </ul>
                </div>

                <h3>📊 Track Your Earnings:</h3>
                <p>Visit your billing dashboard to:</p>
                <ul>
                  <li>View payment history and earnings</li>
                  <li>Generate financial reports</li>
                  <li>Update bank account details</li>
                  <li>Monitor transaction status</li>
                </ul>

                <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/physiotherapist/billing" class="button">
                  View Billing Dashboard
                </a>
              </div>
              <div class="footer">
                <p>RehabifyHealth - Empowering Healthcare Professionals</p>
                <p>Need help? Contact us at support@physioaroundme.com or call +234-XXX-XXXX</p>
                <p>This is an automated message. Please do not reply to this email.</p>
              </div>
            </div>
          </body>
        </html>
      `
    })

    log.info('Bank connection email sent', {
      userId,
      action: 'bank_email_sent'
    })

    return NextResponse.json({
      success: true,
      emailId: emailResult.data?.id
    })

  } catch (error) {
    log.error('Failed to send bank connection email', { action: 'bank_email_error' })
    ErrorTracker.captureException(error as Error, {
      userId,
      action: 'bank_connection_email_failed'
    })
    
    return NextResponse.json(
      { error: 'Failed to send confirmation email' },
      { status: 500 }
    )
  }
}
