'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, Loader2 } from '@/components/icons'
import { toast } from 'sonner'
import { playSound } from '@/lib/sounds'
import { PaystackTestModeBanner } from '@/components/billing/PaystackTestModeBanner'

function PaymentCallbackContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading')
  const [message, setMessage] = useState('')
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [isMarketplaceBooking, setIsMarketplaceBooking] = useState(false)
  const [isJoyPayment, setIsJoyPayment] = useState(false)
  const [title, setTitle] = useState<string | null>(null)

  // Paystack verification
  const verifyPaystackTransaction = useAction(api.payments.verifyPaystackTransaction)
  // Marketplace bookings are verified with Paystack server-side and completed in Convex
  const verifyMarketplacePayment = useAction(api.marketplace.booking.verifyMarketplacePayment)

  useEffect(() => {
    // Paystack parameters
    const reference = searchParams.get('reference')
    const trxref = searchParams.get('trxref')

    // Determine payment reference
    const paymentRef = reference || trxref

    if (!paymentRef) {
      setStatus('failed')
      setMessage('No payment reference found')
      return
    }

    // Joy payments are recorded only by RH's verified Paystack webhook. The
    // generic invoice verifier below has no Joy payment-attempt projection,
    // so a completed Joy checkout must not be displayed as a false failure.
    // A browser redirect remains non-authoritative: it cannot confirm an
    // appointment or bypass physiotherapist acceptance.
    if (paymentRef.startsWith('JOY_') || paymentRef.startsWith('JOYREV_')) {
      setIsJoyPayment(true)
      setStatus('success')
      setMessage('Your payment was submitted. We are verifying it securely. You will receive a Joy message once RH receives and verifies the Paystack payment event.')
      return
    }

    const verifyPayment = async () => {
      // Marketplace checkout (MKT_ references): the booking is confirmed only after
      // Convex re-verifies the transaction with Paystack. The Paystack webhook does the
      // same, so closing this page never loses a paid booking.
      if (paymentRef.startsWith('MKT_')) {
        try {
          const result = await verifyMarketplacePayment({ reference: paymentRef })
          setIsMarketplaceBooking(true)
          // Paid after the slot hold lapsed and someone else took the time: kept, rescheduled by us
          const needsNewTime = result?.needsNewTime === true || result?.status === 'needs_new_time'
          if (result?.success && result?.status === 'paid_after_cancel') {
            setStatus('success')
            setTitle('Payment received')
            setMessage('This booking had expired before your payment came through. Your payment is safe: we’ll contact you to rebook or refund you.')
          } else if (result?.success && needsNewTime) {
            setStatus('success')
            setTitle('Payment received')
            setMessage('The time you chose was booked while you paid. Your payment is safe and we’ll contact you to agree a new time.')
            playSound('paid')
          } else if (result?.success) {
            setStatus('success')
            setTitle('Your booking is confirmed')
            setMessage('Payment received. We’ve emailed you the details.')
            playSound('booked')
            toast.success('Payment successful!')
          } else if (result?.status === 'abandoned' || result?.status === 'failed') {
            setStatus('failed')
            setTitle('Payment not completed')
            setMessage('You have not been charged. Your time is held for a short while, so you can go back and try again.')
          } else {
            setStatus('success')
            setTitle('Payment received')
            setMessage('We’re confirming your booking and will email you shortly.')
          }
        } catch (error) {
          console.error('Marketplace payment verification error:', error)
          setStatus('success')
          setIsMarketplaceBooking(true)
          setTitle('Payment received')
          setMessage('We’re confirming your booking and will email you shortly.')
        }
        return
      }
      try {
        // Paystack verification
        const result = await verifyPaystackTransaction({
          reference: paymentRef!
        })

        if (result.success && result.status === 'success') {
          setStatus('success')
          setTitle('Payment received')
          setMessage('Your invoice has been paid. Thank you.')

          if (result.metadata?.invoiceId) {
            setInvoiceId(result.metadata.invoiceId)
          }

          playSound('paid')
          toast.success('Payment successful!')
        } else if (result.success && ['pending', 'ongoing', 'processing', 'queued'].includes(String(result.status))) {
          // Bank transfer and USSD payments can take a few minutes to be confirmed
          setStatus('success')
          setTitle('Payment processing')
          setMessage('Your bank is still confirming this payment. Your invoice will update as soon as it does. There is no need to pay again.')
        } else if (result.status === 'under_review') {
          setStatus('success')
          setTitle('Payment received')
          setMessage(result.error || 'We received your payment and our team is checking it.')
        } else {
          setStatus('failed')
          setMessage(result.error || 'Payment verification failed')
          toast.error('Payment failed')
        }
      } catch (error) {
        console.error('Payment verification error:', error)
        setStatus('failed')
        setMessage('Failed to verify payment')
        toast.error('Failed to verify payment')
      }
    }

    verifyPayment()
  }, [searchParams, verifyPaystackTransaction, verifyMarketplacePayment])

  const handleContinue = () => {
    if (isJoyPayment) {
      router.push('/')
      return
    }
    if (isMarketplaceBooking) {
      router.push('/dashboard/patient/appointments')
    } else if (invoiceId) {
      router.push('/dashboard/patient/invoices')
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gray-50 p-4">
      <PaystackTestModeBanner className="w-full max-w-md" />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            {status === 'loading' && (
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
            )}
            {status === 'success' && (
              <CheckCircle className="h-12 w-12 text-green-600" />
            )}
            {status === 'failed' && (
              <XCircle className="h-12 w-12 text-red-600" />
            )}
          </div>
          <CardTitle>
            {status === 'loading' && 'Verifying Payment...'}
            {status !== 'loading' && title}
            {status === 'success' && !title && (isJoyPayment ? 'Payment Submitted' : 'Payment Successful!')}
            {status === 'failed' && !title && 'Payment Failed'}
          </CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>

        <CardContent>
          {status !== 'loading' && (
            <div className="space-y-4">
              <Button
                onClick={handleContinue}
                className="w-full"
                variant={status === 'success' ? 'default' : 'outline'}
              >
                {status === 'success' ? 'Continue to Dashboard' : 'Return to Dashboard'}
              </Button>

              {status === 'failed' && (
                <Button
                  onClick={() => router.back()}
                  variant="ghost"
                  className="w-full"
                >
                  Try Again
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function PaymentCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
            </div>
            <CardTitle>Loading...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    }>
      <PaymentCallbackContent />
    </Suspense>
  )
}
