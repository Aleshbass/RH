'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

function PaymentCallbackContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading')
  const [message, setMessage] = useState('')
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [isMarketplaceBooking, setIsMarketplaceBooking] = useState(false)

  // Flutterwave verification
  const verifyFlutterwaveTransaction = useAction(api.flutterwave.verifyTransactionByRef)
  // Paystack verification
  const verifyPaystackTransaction = useAction(api.payments.verifyPaystackTransaction)
  // Complete marketplace booking
  const completeMarketplaceBooking = useAction((api as any).marketplace.booking.completeMarketplaceBooking)

  useEffect(() => {
    // Flutterwave parameters
    const flwStatus = searchParams.get('status')
    const transactionId = searchParams.get('transaction_id')
    const txRef = searchParams.get('tx_ref')

    // Paystack parameters (backward compatibility)
    const reference = searchParams.get('reference')
    const trxref = searchParams.get('trxref')

    // Check if this is a Flutterwave callback
    const isFlutterwave = (flwStatus && txRef) || (txRef && !reference && !trxref)

    // Determine payment reference
    const paymentRef = txRef || reference || trxref

    if (!paymentRef && !transactionId) {
      setStatus('failed')
      setMessage('No payment reference found')
      return
    }

    const verifyPayment = async () => {
      try {
        if (isFlutterwave) {
          // Flutterwave verification
          // If status is already 'successful', we can trust it but still verify
          if (flwStatus === 'successful' && transactionId) {
            // Verify by transaction ID for extra security
            const result = await verifyFlutterwaveTransaction({
              txRef: txRef!
            })

            if (result.success && result.status === 'successful') {
              setStatus('success')
              setMessage('Payment completed successfully! Your balance has been updated.')
              toast.success('Payment successful!')
            } else {
              setStatus('failed')
              setMessage(result.error || 'Payment verification failed')
              toast.error('Payment failed')
            }
          } else if (flwStatus === 'cancelled') {
            setStatus('failed')
            setMessage('Payment was cancelled')
            toast.error('Payment cancelled')
          } else if (flwStatus === 'failed') {
            setStatus('failed')
            setMessage('Payment failed. Please try again.')
            toast.error('Payment failed')
          } else {
            // Verify by tx_ref
            const result = await verifyFlutterwaveTransaction({
              txRef: txRef!
            })

            if (result.success && result.status === 'successful') {
              setStatus('success')
              setMessage('Payment completed successfully! Your balance has been updated.')
              toast.success('Payment successful!')
            } else {
              setStatus('failed')
              setMessage(result.error || 'Payment verification failed')
              toast.error('Payment failed')
            }
          }
        } else {
          // Paystack verification
          const result = await verifyPaystackTransaction({
            reference: paymentRef!
          })

          if (result.success && result.status === 'success') {
            // Check if this is a marketplace booking
            if (result.metadata?.bookingId) {
              try {
                await completeMarketplaceBooking({
                  bookingId: result.metadata.bookingId,
                  paymentReference: paymentRef!,
                })
              } catch (err) {
                console.error('Failed to complete marketplace booking:', err)
              }
              setIsMarketplaceBooking(true)
            }

            setStatus('success')
            setMessage('Payment completed successfully! Your booking is confirmed.')

            if (result.metadata?.invoiceId) {
              setInvoiceId(result.metadata.invoiceId)
            }

            toast.success('Payment successful!')
          } else {
            setStatus('failed')
            setMessage(result.error || 'Payment verification failed')
            toast.error('Payment failed')
          }
        }
      } catch (error) {
        console.error('Payment verification error:', error)
        setStatus('failed')
        setMessage('Failed to verify payment')
        toast.error('Failed to verify payment')
      }
    }

    verifyPayment()
  }, [searchParams, verifyFlutterwaveTransaction, verifyPaystackTransaction, completeMarketplaceBooking])

  const handleContinue = () => {
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
            {status === 'success' && 'Payment Successful!'}
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
