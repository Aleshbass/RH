'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Id } from '@/convex/_generated/dataModel'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'

declare global {
    interface Window {
        FlutterwaveCheckout: (config: {
            public_key: string
            tx_ref: string
            amount: number
            currency: string
            customer: {
                email: string
                name?: string
                phone_number?: string
            }
            customizations: {
                title: string
                description?: string
                logo?: string
            }
            callback: (response: FlutterwaveResponse) => void
            onclose: () => void
            payment_options?: string
            meta?: Record<string, unknown>
        }) => void
    }
}

interface FlutterwaveResponse {
    status: string
    transaction_id: number
    tx_ref: string
    flw_ref: string
}

interface FlutterwaveCheckoutProps {
    invoiceId: Id<'invoices'>
    amount: number // Amount in kobo
    email: string
    customerName?: string
    onSuccess?: (response: FlutterwaveResponse) => void
    onClose?: () => void
    trigger?: React.ReactNode
}

export function FlutterwaveCheckout({
    invoiceId,
    amount,
    email,
    customerName,
    onSuccess,
    onClose,
    trigger
}: FlutterwaveCheckoutProps) {
    const [isScriptLoaded, setIsScriptLoaded] = useState(false)
    const initializePayment = useMutation(api.flutterwave.initializePaymentWithSplit)

    useEffect(() => {
        // Load Flutterwave inline script
        if (document.getElementById('flutterwave-inline-script')) {
            setIsScriptLoaded(true)
            return
        }

        const script = document.createElement('script')
        script.id = 'flutterwave-inline-script'
        script.src = 'https://checkout.flutterwave.com/v3.js'
        script.async = true
        script.onload = () => setIsScriptLoaded(true)
        document.body.appendChild(script)

        return () => {
            // Don't remove the script on unmount to avoid reloading
        }
    }, [])

    const handlePayment = async () => {
        try {
            // Initialize payment via Convex
            const result = await initializePayment({
                invoiceId,
                redirectUrl: `${window.location.origin}/payment/callback`
            })

            if (!result.success) {
                toast.error(result.error || 'Failed to initialize payment')
                return
            }

            // Check if Flutterwave is loaded
            if (typeof window.FlutterwaveCheckout === 'undefined') {
                // Fallback to redirect if inline script not loaded
                if (result.paymentLink) {
                    window.location.href = result.paymentLink
                }
                return
            }

            // Use Flutterwave inline checkout
            window.FlutterwaveCheckout({
                public_key: process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY || '',
                tx_ref: result.txRef!,
                amount: amount / 100, // Convert from kobo to Naira
                currency: 'NGN',
                customer: {
                    email: email,
                    name: customerName
                },
                customizations: {
                    title: 'Rehabify Health',
                    description: 'Payment for healthcare services',
                    logo: 'https://physioaroundme.com/logo.png'
                },
                callback: function (response: FlutterwaveResponse) {
                    // Payment completed
                    if (response.status === 'successful') {
                        toast.success('Payment successful!')
                        if (onSuccess) {
                            onSuccess(response)
                        }
                        // Redirect to success page with params
                        window.location.href = `/payment/callback?status=successful&transaction_id=${response.transaction_id}&tx_ref=${response.tx_ref}`
                    } else {
                        toast.error('Payment was not completed')
                    }
                },
                onclose: function () {
                    // User closed the payment modal
                    if (onClose) {
                        onClose()
                    }
                },
                payment_options: 'card, banktransfer, ussd',
                meta: {
                    invoiceId: invoiceId
                }
            })
        } catch (error) {
            console.error('Payment error:', error)
            toast.error('Failed to process payment')
        }
    }

    if (trigger) {
        return (
            <div onClick={handlePayment} style={{ cursor: 'pointer' }}>
                {trigger}
            </div>
        )
    }

    return null
}

export function useFlutterwaveCheckout() {
    const initializePayment = useMutation(api.flutterwave.initializePaymentWithSplit)

    const initiatePayment = async (invoiceId: Id<'invoices'>) => {
        try {
            const result = await initializePayment({
                invoiceId,
                redirectUrl: `${window.location.origin}/payment/callback`
            })

            if (!result.success) {
                throw new Error(result.error || 'Failed to initialize payment')
            }

            // Redirect to Flutterwave hosted page
            if (result.paymentLink) {
                window.location.href = result.paymentLink
            }

            return result
        } catch (error) {
            console.error('Payment initialization error:', error)
            throw error
        }
    }

    return { initiatePayment }
}
