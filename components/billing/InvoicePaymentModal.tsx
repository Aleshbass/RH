'use client'

import { useState } from 'react'
import { useAction, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  CreditCard,
  Banknote,
  Smartphone,
  Building2,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Shield
} from 'lucide-react'
import { format } from 'date-fns'

interface InvoicePaymentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: {
    _id: Id<'invoices'>
    invoiceNumber: string
    totalAmount: number
    dueDate: number
    patient?: {
      user?: {
        firstName?: string
        lastName?: string
        email?: string
      }
    }
    items?: Array<{
      description: string
      quantity: number
      unitPrice: number
      totalPrice: number
    }>
    platformFeeAmount?: number
    discountAmount?: number
    subtotalAmount?: number
  }
}

export function InvoicePaymentModal({
  open,
  onOpenChange,
  invoice
}: InvoicePaymentModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'bank_transfer' | 'ussd' | 'mobile_money'>('card')
  const [isProcessing, setIsProcessing] = useState(false)
  const [paymentReference, setPaymentReference] = useState('')
  const [manualPayment, setManualPayment] = useState(false)
  
  // @ts-nocheck
  const initializePayment = useAction(api.paystack.initializePaymentWithSplit)
  // @ts-nocheck
  const processPayment = useMutation(api.billing.processPayment)

  const handlePaystackPayment = async () => {
    if (!invoice) return

    setIsProcessing(true)
    try {
      // Initialize payment with Paystack split payment
      const result = await initializePayment({
        invoiceId: invoice._id,
        redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/payment/callback`
      })

      if (result.success && result.authorizationUrl) {
        // Redirect to Paystack payment page
        window.location.href = result.authorizationUrl
      } else {
        throw new Error(result.error || 'Failed to initialize payment')
      }
    } catch (error) {
      console.error('Payment initialization failed:', error)
      toast.error('Failed to initialize payment. Please try again.')
      setIsProcessing(false)
    }
  }

  const handleManualPayment = async () => {
    if (!paymentReference.trim()) {
      toast.error('Please enter a payment reference')
      return
    }

    setIsProcessing(true)
    try {
      await processPayment({
        invoiceId: invoice._id,
        paymentMethod: paymentMethod,
        paymentReference: paymentReference
      })
      toast.success('Payment recorded successfully! Patient balance has been updated.')
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to record payment:', error)
      toast.error('Failed to record payment')
    } finally {
      setIsProcessing(false)
    }
  }

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case 'card':
        return <CreditCard className="h-5 w-5" />
      case 'bank_transfer':
        return <Building2 className="h-5 w-5" />
      case 'ussd':
        return <Smartphone className="h-5 w-5" />
      case 'mobile_money':
        return <Banknote className="h-5 w-5" />
      default:
        return <CreditCard className="h-5 w-5" />
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pay Invoice #{invoice?.invoiceNumber}</DialogTitle>
          <DialogDescription>
            Complete payment for this invoice using your preferred payment method
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Invoice Summary */}
          <div className="bg-gray-50 p-4 rounded-lg space-y-3">
            {(() => {
              const base = invoice?.totalAmount ?? 0
              const platform = invoice?.platformFeeAmount ?? 100000
              const paystack = Math.round((base + platform) * 0.015) + 10000
              const payable = base + platform + paystack
              return (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Invoice Total</span>
                    <span className="font-medium">₦{(base / 100).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Platform Fee</span>
                    <span>₦{(platform / 100).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Paystack Fee</span>
                    <span>₦{(paystack / 100).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                    <span>Total Payable</span>
                    <span className="text-green-600">₦{(payable / 100).toLocaleString()}</span>
                  </div>
                </div>
              )
            })()}
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Patient</span>
              <span className="font-medium">
                {invoice?.patient?.user?.firstName} {invoice?.patient?.user?.lastName}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Due Date</span>
              <span className="font-medium">
                {invoice?.dueDate && format(new Date(invoice.dueDate), 'MMM d, yyyy, h:mm a')}
              </span>
            </div>
            <Separator />
            
            {/* Line Items */}
            {invoice?.items && invoice.items.length > 0 && (
              <>
                <div className="space-y-2">
                  {invoice.items.map((item, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        {item.description} (x{item.quantity})
                      </span>
                      <span>₦{(item.totalPrice / 100).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <Separator />
              </>
            )}
            
            {/* Totals */}
            {invoice?.subtotalAmount && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span>₦{(invoice.subtotalAmount / 100).toLocaleString()}</span>
              </div>
            )}
            {invoice?.discountAmount && invoice.discountAmount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Discount</span>
                <span>-₦{(invoice.discountAmount / 100).toLocaleString()}</span>
              </div>
            )}
            {invoice?.platformFeeAmount && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Platform Fee</span>
                <span>₦{(invoice.platformFeeAmount / 100).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-lg pt-2 border-t">
              <span>Total Amount</span>
              <span className="text-green-600">₦{(invoice?.totalAmount / 100)?.toLocaleString()}</span>
            </div>
          </div>

          {/* Payment Method Selection */}
          <div className="space-y-3">
            <Label>Select Payment Method</Label>
            <RadioGroup value={paymentMethod} onValueChange={(value: 'card' | 'bank_transfer' | 'ussd' | 'mobile_money') => setPaymentMethod(value)}>
              <div className="grid grid-cols-2 gap-3">
                <Label
                  htmlFor="card"
                  className="flex items-center space-x-3 border rounded-lg p-3 cursor-pointer hover:bg-gray-50"
                >
                  <RadioGroupItem value="card" id="card" />
                  <CreditCard className="h-5 w-5 text-gray-600" />
                  <span>Card Payment</span>
                </Label>
                
                <Label
                  htmlFor="bank_transfer"
                  className="flex items-center space-x-3 border rounded-lg p-3 cursor-pointer hover:bg-gray-50"
                >
                  <RadioGroupItem value="bank_transfer" id="bank_transfer" />
                  <Building2 className="h-5 w-5 text-gray-600" />
                  <span>Bank Transfer</span>
                </Label>
                
                <Label
                  htmlFor="ussd"
                  className="flex items-center space-x-3 border rounded-lg p-3 cursor-pointer hover:bg-gray-50"
                >
                  <RadioGroupItem value="ussd" id="ussd" />
                  <Smartphone className="h-5 w-5 text-gray-600" />
                  <span>USSD</span>
                </Label>
                
                <Label
                  htmlFor="mobile_money"
                  className="flex items-center space-x-3 border rounded-lg p-3 cursor-pointer hover:bg-gray-50"
                >
                  <RadioGroupItem value="mobile_money" id="mobile_money" />
                  <Banknote className="h-5 w-5 text-gray-600" />
                  <span>Mobile Money</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Manual Payment Option */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="manual"
                checked={manualPayment}
                onChange={(e) => setManualPayment(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="manual" className="cursor-pointer">
                I have already made payment (enter reference)
              </Label>
            </div>
            
            {manualPayment && (
              <div className="space-y-2">
                <Label htmlFor="reference">Payment Reference</Label>
                <Input
                  id="reference"
                  placeholder="Enter payment reference number"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Enter the payment details for this invoice. The patient&#39;s balance will be updated automatically.
                </p>
              </div>
            )}
          </div>

          {/* Security Notice */}
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              Your payment is secured by Paystack. We do not store your card details.
              All transactions are encrypted and processed securely.
            </AlertDescription>
          </Alert>

          {/* Payment Notice */}
          {paymentMethod === 'bank_transfer' && !manualPayment && (
            <Alert className="border-blue-200 bg-blue-50">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                After clicking &quot;Proceed to Payment&quot;, you&apos;ll receive bank account details to complete your transfer.
                The invoice will be marked as paid once we confirm receipt of payment.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancel
          </Button>
          
          {manualPayment ? (
            <Button 
              onClick={handleManualPayment} 
              disabled={isProcessing || !paymentReference.trim()}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Recording Payment...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Confirm Payment
                </>
              )}
            </Button>
          ) : (
            <Button 
              onClick={handlePaystackPayment} 
              disabled={isProcessing}
              className="bg-green-600 hover:bg-green-700"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {getPaymentMethodIcon(paymentMethod)}
                  <span className="ml-2">
                    {(() => {
                      const base = invoice?.totalAmount ?? 0
                      const platform = invoice?.platformFeeAmount ?? 100000
                      const paystack = Math.round((base + platform) * 0.015) + 10000
                      const payable = base + platform + paystack
                      return `Proceed to Payment (₦${(payable / 100).toLocaleString()})`
                    })()}
                  </span>
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
