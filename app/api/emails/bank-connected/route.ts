import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { log } from '@/lib/monitoring/logger'
import { ErrorTracker } from '@/lib/monitoring/sentry'
import { escapeHtml, isServerOrAdmin } from '../_auth'
import { actions, bulletList, button, callout, details, heading, paragraph, renderEmail } from '@/lib/email/layout'

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
      html: renderEmail({
        eyebrow: 'Payouts ready',
        tone: 'success',
        title: 'Your bank account is connected',
        preheader: 'You can now receive payments straight to your bank account.',
        body: [
          paragraph('Your bank account is now connected to your Rehabify account, so payments for your sessions can go straight to your bank.'),
          details([
            ['Account name', escapeHtml(accountName)],
            ['Bank', escapeHtml(bankName)],
            ['Account number', escapeHtml(accountNumber)],
            ['Status', 'Active'],
            ['Connected', new Date().toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'long', year: 'numeric' })],
          ]),
          heading('How payments work'),
          bulletList([
            '<strong>Automatic transfers:</strong> payments reach your account within 24 hours',
            '<strong>Fees:</strong> your billing dashboard shows the breakdown for every payment',
            '<strong>Changes:</strong> you can update your bank account from your dashboard at any time',
          ]),
          callout('warning', 'Keep your account safe', 'Never share your account details with anyone you don\'t trust, check your account regularly, and contact support straight away if anything looks wrong.'),
          actions(button('View billing dashboard', `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/physiotherapist/billing`)),
        ].join(''),
        footerNote: 'This is an automated message. Please do not reply to this email.',
      }),
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
