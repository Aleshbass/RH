'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { playSound } from '@/lib/sounds'

function PaymentCallbackContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading')
  const [message, setMessage] = useState('')
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [isMarketplaceBooking, setIsMarketplaceBooking] = useState(false)
  const [isJoyPayment, setIsJoyPayment] = useState(false)

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
    if (paymentRef.startsWith('JOY_')) {
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
          if (result?.success) {
            setStatus('success')
            setMessage('Payment confirmed — your booking is confirmed.')
            playSound('booked')
            toast.success('Payment successful!')
          } else if (result?.status === 'abandoned' || result?.status === 'failed') {
            setStatus('failed')
            setMessage('The payment was not completed. You have not been charged.')
          } else {
            setStatus('success')
            setMessage('Payment received. We are confirming your booking — you will get an email shortly.')
          }
        } catch (error) {
          console.error('Marketplace payment verification error:', error)
          setStatus('success')
          setIsMarketplaceBooking(true)
          setMessage('Payment received. We are confirming your booking — you will get an email shortly.')
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
          setMessage('Payment completed successfully! Your booking is confirmed.')

          if (result.metadata?.invoiceId) {
            setInvoiceId(result.metadata.invoiceId)
          }

          playSound('paid')
          toast.success('Payment successful!')
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
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
            {status === 'success' && (isJoyPayment ? 'Payment Submitted' : 'Payment Successful!')}
            {status === 'failed' && 'Payment Failed'}
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
