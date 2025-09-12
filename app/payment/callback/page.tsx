'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function PaymentCallbackPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading')
  const [message, setMessage] = useState('')
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  
  const verifyPaystackTransaction = useAction(api.payments.verifyPaystackTransaction)

  useEffect(() => {
    const reference = searchParams.get('reference')
    const trxref = searchParams.get('trxref')
    
    if (!reference && !trxref) {
      setStatus('failed')
      setMessage('No payment reference found')
      return
    }

    // Use reference or trxref (Paystack sends trxref)
    const paymentRef = reference || trxref

    // Verify payment with Paystack
    const verifyPayment = async () => {
      try {
        const result = await verifyPaystackTransaction({
          reference: paymentRef
        })

        if (result.success && result.status === 'success') {
          setStatus('success')
          setMessage('Payment completed successfully! Your balance has been updated.')
          
          // Extract invoice ID from metadata if available
          if (result.metadata?.invoiceId) {
            setInvoiceId(result.metadata.invoiceId)
          }
          
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
  }, [searchParams, verifyPaystackTransaction])

  const handleContinue = () => {
    // Redirect to invoices page or dashboard
    if (invoiceId) {
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
