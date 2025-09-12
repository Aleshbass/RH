'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { Id } from '@/convex/_generated/dataModel'

declare global {
  interface Window {
    PaystackPop: {
      setup: (config: {
        key: string;
        email: string;
        amount: number;
        ref: string;
        currency: string;
        callback: (response: { reference: string }) => void;
        onClose: () => void;
      }) => { openIframe: () => void };
    };
  }
}

interface PaystackCheckoutProps {
  invoiceId: Id<'invoices'>
  amount: number // Amount in kobo
  email: string
  onSuccess?: (reference: string) => void
  onClose?: () => void
  trigger?: React.ReactNode
}

export function PaystackCheckout({
  invoiceId,
  amount,
  email,
  onSuccess,
  onClose,
  trigger
}: PaystackCheckoutProps) {
  
  useEffect(() => {
    // Load Paystack inline script
    const script = document.createElement('script')
    script.src = 'https://js.paystack.co/v1/inline.js'
    script.async = true
    document.body.appendChild(script)
    
    return () => {
      document.body.removeChild(script)
    }
  }, [])

  const handlePayment = async () => {
    try {
      // Initialize payment via API
      const response = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          invoiceId
        })
      })

      const data = await response.json()

      if (!data.success) {
        toast.error(data.error || 'Failed to initialize payment')
        return
      }

      // Check if PaystackPop is loaded
      if (typeof window.PaystackPop === 'undefined') {
        // Fallback to redirect if inline script not loaded
        window.location.href = data.authorization_url
        return
      }

      // Use Paystack inline checkout
      const handler = window.PaystackPop.setup({
        key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || '',
        email: email,
        amount: amount,
        ref: data.reference,
        currency: 'NGN',
        callback: function(response: { reference: string }) {
          // Payment successful
          toast.success('Payment successful!')
          if (onSuccess) {
            onSuccess(response.reference)
          }
          // Redirect to success page
          window.location.href = `/payment/callback?reference=${response.reference}`
        },
        onClose: function() {
          // User closed the payment modal
          if (onClose) {
            onClose()
          }
        }
      })

      // handler is an object with openIframe
      handler.openIframe()
    } catch (error) {
      console.error('Payment error:', error)
      toast.error('Failed to process payment')
    }
  }

  if (trigger) {
    return (
      <div onClick={handlePayment}>
        {trigger}
      </div>
    )
  }

  return null
}

export function usePaystackCheckout() {
  const initializePayment = async (invoiceId: Id<'invoices'>) => {
    try {
      const response = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          invoiceId
        })
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to initialize payment')
      }

      // Redirect to Paystack hosted page
      window.location.href = data.authorization_url
    } catch (error) {
      console.error('Payment initialization error:', error)
      throw error
    }
  }

  return { initializePayment }
}
