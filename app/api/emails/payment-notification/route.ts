import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { log } from '@/lib/monitoring/logger'
import { ErrorTracker } from '@/lib/monitoring/sentry'
import { escapeHtml, isServerOrAdmin } from '../_auth'
import { platformAdminEmails } from '@/lib/email/adminRecipients'

export const dynamic = 'force-dynamic'

/**
 * Payment notification email to the Rehabify admin inbox.
 *
 * Called server-to-server by the Paystack webhook (header `x-rehabify-server-secret`) or by
 * a signed-in admin. The recipient is always chosen here from server config; anything the
 * caller sends as `to` is ignored, so this route can't be used to mail arbitrary people.
 */
export async function POST(request: NextRequest) {
  if (!(await isServerOrAdmin(request))) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { reference, amount, metadata } = body as {
      reference?: string
      amount?: number
      metadata?: Record<string, unknown>
    }
    // The webhook sends `status`; older callers sent `paymentType`.
    const paymentType = String(body.paymentType ?? body.status ?? '')
    const type = String(body.type ?? 'admin')

    if (type === 'patient' || type === 'physiotherapist') {
      // There's no verified recipient lookup for these yet, and we never mail an address
      // the caller picked. Patients and physios get their receipts from Convex instead.
      log.info('Skipping payment email for unsupported recipient type', { type, reference })
      return NextResponse.json({ success: true, skipped: true, reason: 'recipient_type_not_supported' })
    }
    if (type !== 'admin') {
      return NextResponse.json({ error: `Unknown email type: ${type}` }, { status: 400 })
    }
    if (!reference) {
      return NextResponse.json({ error: 'reference is required' }, { status: 400 })
    }

    log.info('Sending payment notification email', { type, paymentType, reference })

    const emailData = createAdminEmail(paymentType, reference, typeof amount === 'number' ? amount : undefined, metadata)

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      log.warn('Resend API key missing; skipping payment email send', { type, reference })
      return NextResponse.json({ success: true, skipped: true })
    }
    const resend = new Resend(apiKey)

    const result = await resend.emails.send({
      from: `RehabifyHealth <${process.env.FROM_EMAIL || 'info@physioaroundme.com'}>`,
      to: emailData.to,
      subject: emailData.subject,
      html: emailData.html,
    })

    log.info('Payment notification email sent successfully', {
      emailId: result.data?.id,
      reference,
      type,
    })

    return NextResponse.json({ success: true, emailId: result.data?.id })
  } catch (error) {
    log.error('Failed to send payment notification email', { error: error as Error })
    ErrorTracker.captureException(error as Error, {
      tags: { component: 'payment_email' },
    })

    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}

// Admin notification email (amount is in kobo)
function createAdminEmail(paymentType: string, reference: string, amount?: number, metadata?: Record<string, unknown>) {
  const isSuccess = paymentType === 'success'
  const amountFormatted = amount ? `₦${(amount / 100).toLocaleString('en-NG')}` : 'N/A'
  const safeReference = escapeHtml(reference)

  return {
    to: platformAdminEmails(),
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
                <p><strong>Reference:</strong> ${safeReference}</p>
                <p><strong>Amount:</strong> ${amountFormatted}</p>
                <p><strong>Invoice ID:</strong> ${escapeHtml(metadata?.invoiceId || 'N/A')}</p>
                <p><strong>Patient ID:</strong> ${escapeHtml(metadata?.patientId || 'N/A')}</p>
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
    `,
  }
}
