import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { log } from '@/lib/monitoring/logger'
import { ErrorTracker } from '@/lib/monitoring/sentry'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { to, type, paymentType, reference, amount, metadata } = body

    log.info('Sending payment notification email', {
      type,
      paymentType,
      reference,
      recipient: typeof to === 'string' ? to : type
    })

    let emailData
    
    switch (type) {
      case 'admin':
        emailData = await createAdminEmail(paymentType, reference, amount, metadata)
        break
      case 'patient':
        emailData = await createPatientEmail(paymentType, reference, amount, metadata, body.userId)
        break
      case 'physiotherapist':
        emailData = await createPhysiotherapistEmail(paymentType, reference, amount, metadata, body.userId)
        break
      default:
        throw new Error(`Unknown email type: ${type}`)
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      log.warn('Resend API key missing; skipping payment email send', { type, reference })
      return NextResponse.json({ success: true, skipped: true })
    }
    const resend = new Resend(apiKey)

    // Send email via Resend (using verified domain)
    const result = await resend.emails.send({
      from: `RehabifyHealth <${process.env.FROM_EMAIL || 'info@rehabifyhealth.com'}>`,
      to: typeof to === 'string' ? to : emailData.to,
      subject: emailData.subject,
      html: emailData.html
    })

    log.info('Payment notification email sent successfully', {
      emailId: result.data?.id,
      reference,
      type
    })

    return NextResponse.json({ success: true, emailId: result.data?.id })

  } catch (error) {
    log.error('Failed to send payment notification email', { error: error as Error })
    ErrorTracker.captureException(error as Error, {
      tags: { component: 'payment_email' }
    })
    
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    )
  }
}

// Create admin notification email
async function createAdminEmail(paymentType: string, reference: string, amount?: number, metadata?: Record<string, unknown>) {
  const isSuccess = paymentType === 'success'
  const amountFormatted = amount ? `₦${(amount / 100).toLocaleString()}` : 'N/A'
  
  return {
    to: process.env.PLATFORM_ADMIN_EMAIL || 'admin@rehabifyhealth.com',
    subject: `Payment ${isSuccess ? 'Successful' : 'Failed'} - ${reference}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Payment Notification</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${isSuccess ? '#10b981' : '#ef4444'}; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .details { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Payment ${isSuccess ? 'Successful' : 'Failed'}</h1>
            </div>
            <div class="content">
              <h2>Payment Notification</h2>
              <div class="details">
                <p><strong>Status:</strong> ${isSuccess ? 'SUCCESS' : 'FAILED'}</p>
                <p><strong>Reference:</strong> ${reference}</p>
                <p><strong>Amount:</strong> ${amountFormatted}</p>
                <p><strong>Invoice ID:</strong> ${metadata?.invoiceId || 'N/A'}</p>
                <p><strong>Patient ID:</strong> ${metadata?.patientId || 'N/A'}</p>
                <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
              </div>
              ${isSuccess ? 
                '<p>The payment has been processed successfully. Platform fee and physiotherapist payout will be handled automatically.</p>' :
                '<p>The payment failed. Please review the transaction and contact the patient if necessary.</p>'
              }
            </div>
            <div class="footer">
              <p>RehabifyHealth Platform - Automated Payment Notification</p>
            </div>
          </div>
        </body>
      </html>
    `
  }
}

// Create patient notification email
async function createPatientEmail(paymentType: string, reference: string, amount?: number, metadata?: Record<string, unknown>, userId?: string) {
  const isSuccess = paymentType === 'success'
  const amountFormatted = amount ? `₦${(amount / 100).toLocaleString()}` : 'N/A'
  
  // In a real implementation, you'd fetch patient details from database
  const patientEmail = `patient-${userId}@temp.com` // Temporary
  
  return {
    to: patientEmail,
    subject: `Payment ${isSuccess ? 'Confirmation' : 'Failed'} - Invoice #${metadata?.invoiceNumber || reference}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Payment ${isSuccess ? 'Confirmation' : 'Failed'}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${isSuccess ? '#10b981' : '#ef4444'}; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .details { background: #f9f9f9; padding: 15px; margin: 10px 0; border-radius: 5px; }
            .button { display: inline-block; padding: 12px 24px; background: #3b82f6; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Payment ${isSuccess ? 'Successful!' : 'Failed'}</h1>
            </div>
            <div class="content">
              ${isSuccess ? 
                `<h2>Thank you for your payment!</h2>
                 <p>Your payment has been processed successfully.</p>` :
                `<h2>Payment Could Not Be Processed</h2>
                 <p>We were unable to process your payment. Please try again or contact support.</p>`
              }
              
              <div class="details">
                <p><strong>Invoice:</strong> #${metadata?.invoiceNumber || reference}</p>
                <p><strong>Amount:</strong> ${amountFormatted}</p>
                <p><strong>Reference:</strong> ${reference}</p>
                <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
              </div>
              
              ${isSuccess ? 
                '<p>Your receipt has been generated and is available in your dashboard.</p>' :
                '<p>You can retry the payment from your dashboard or contact our support team for assistance.</p>'
              }
              
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/patient/invoices" class="button">
                View Dashboard
              </a>
            </div>
            <div class="footer">
              <p>RehabifyHealth - Your Health, Our Priority</p>
              <p>If you have any questions, contact us at support@rehabifyhealth.com</p>
            </div>
          </div>
        </body>
      </html>
    `
  }
}

// Create physiotherapist notification email
async function createPhysiotherapistEmail(paymentType: string, reference: string, amount?: number, metadata?: Record<string, unknown>, userId?: string) {
  const isSuccess = paymentType === 'success'
  const amountFormatted = amount ? `₦${(amount / 100).toLocaleString()}` : 'N/A'
  
  // Calculate physiotherapist share (simplified)
  const platformFee = 100000 // ₦1,000 in kobo
  const paystackFee = amount ? Math.ceil(amount * 0.015) + 10000 : 0
  const physiotherapistShare = amount ? Math.max(0, amount - platformFee - paystackFee) : 0
  const shareFormatted = `₦${(physiotherapistShare / 100).toLocaleString()}`
  
  // In a real implementation, you'd fetch physiotherapist details from database
  const physiotherapistEmail = `physio-${userId}@temp.com` // Temporary
  
  return {
    to: physiotherapistEmail,
    subject: `Payment ${isSuccess ? 'Received' : 'Failed'} - ${reference}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Payment ${isSuccess ? 'Received' : 'Failed'}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${isSuccess ? '#10b981' : '#ef4444'}; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .details { background: #f9f9f9; padding: 15px; margin: 10px 0; border-radius: 5px; }
            .earnings { background: #ecfdf5; border: 1px solid #10b981; padding: 15px; margin: 10px 0; border-radius: 5px; }
            .button { display: inline-block; padding: 12px 24px; background: #3b82f6; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Payment ${isSuccess ? 'Received!' : 'Failed'}</h1>
            </div>
            <div class="content">
              ${isSuccess ? 
                `<h2>Great news! You've received a payment.</h2>
                 <p>A patient has successfully paid for your services.</p>` :
                `<h2>Payment Processing Failed</h2>
                 <p>A patient's payment could not be processed.</p>`
              }
              
              <div class="details">
                <p><strong>Invoice:</strong> #${metadata?.invoiceNumber || reference}</p>
                <p><strong>Total Amount:</strong> ${amountFormatted}</p>
                <p><strong>Reference:</strong> ${reference}</p>
                <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
              </div>
              
              ${isSuccess ? `
                <div class="earnings">
                  <h3>💰 Your Earnings</h3>
                  <p><strong>Your Share:</strong> ${shareFormatted}</p>
                  <p><small>Platform Fee: ₦${(platformFee / 100).toLocaleString()} | Payment Processing: ₦${(paystackFee / 100).toLocaleString()}</small></p>
                  <p>Funds will be transferred to your connected bank account within 24 hours.</p>
                </div>
              ` : `
                <p>The patient may retry the payment. You'll be notified when a successful payment is received.</p>
              `}
              
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/physiotherapist/billing" class="button">
                View Billing Dashboard
              </a>
            </div>
            <div class="footer">
              <p>RehabifyHealth - Empowering Healthcare Professionals</p>
              <p>Questions? Contact us at support@rehabifyhealth.com</p>
            </div>
          </div>
        </body>
      </html>
    `
  }
}
