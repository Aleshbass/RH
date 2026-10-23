import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { log } from '@/lib/monitoring/logger'
import { ErrorTracker } from '@/lib/monitoring/sentry'
import { escapeHtml, isServerOrAdmin } from '../_auth'
import { platformAdminEmails } from '@/lib/email/adminRecipients'
import { details, highlight, paragraph, renderEmail, statusPill } from '@/lib/email/layout'

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
    html: renderEmail({
      eyebrow: isSuccess ? 'Payment successful' : 'Payment failed',
      tone: isSuccess ? 'success' : 'danger',
      title: isSuccess ? 'A payment came through' : 'A payment failed',
      preheader: `${amountFormatted} · ${reference}`,
      body: [
        highlight({ label: 'Amount', value: amountFormatted, sub: statusPill(isSuccess ? 'Success' : 'Failed', isSuccess ? 'success' : 'danger') }),
        details([
          ['Reference', safeReference],
          ['Invoice ID', escapeHtml(metadata?.invoiceId || 'N/A')],
          ['Patient ID', escapeHtml(metadata?.patientId || 'N/A')],
          ['Time', new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos' }) + ' WAT'],
        ]),
        paragraph(isSuccess
          ? 'The payment was processed successfully. The platform fee and physiotherapist payout are handled automatically.'
          : 'The payment failed. Please review the transaction and contact the patient if necessary.'),
      ].join(''),
      signOff: false,
      safetyNote: false,
      footerNote: 'Automated payment notification for the Rehabify team.',
    }),
  }
}
