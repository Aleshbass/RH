'use client'
import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle, AlertCircle, CreditCard, Shield } from 'lucide-react'
import { log } from '@/lib/monitoring/logger'
import { ErrorTracker } from '@/lib/monitoring/sentry'

interface Bank {
  name: string
  code: string
  slug: string
}

interface BankConnectionProps {
  userId: string
  onConnectionSuccess?: () => void
}

export default function BankAccountConnection({ userId, onConnectionSuccess }: BankConnectionProps) {
  const [banks, setBanks] = useState<Bank[]>([])
  const [selectedBank, setSelectedBank] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [verifiedAccount, setVerifiedAccount] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Derived state for selected bank name
  const selectedBankName = banks.find(bank => bank.code === selectedBank)?.name || ''

  // Fetch banks on component mount
  useEffect(() => {
    fetchBanks()
  }, [])

  const verifyAccount = React.useCallback(async () => {
    if (!selectedBank || accountNumber.length !== 10) return

    setIsVerifying(true)
    setError('')

    try {
      const response = await fetch('/api/payments/verify-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankCode: selectedBank,
          accountNumber
        })
      })

      const data = await response.json()
      
      if (data.success) {
        setVerifiedAccount(data.accountName)
        setBusinessName(data.accountName) // Pre-fill business name
      } else {
        setVerifiedAccount(null)
        setError('Could not verify account. Please check your details.')
      }
    } catch (error) {
      log.error('Account verification failed', { error: error as Error })
      setVerifiedAccount(null)
      setError('Account verification failed')
    } finally {
      setIsVerifying(false)
    }
  }, [selectedBank, accountNumber])

  // Auto-verify account when bank and account number are valid
  useEffect(() => {
    if (selectedBank && accountNumber.length === 10) {
      verifyAccount()
    } else {
      setVerifiedAccount(null)
    }
  }, [selectedBank, accountNumber, verifyAccount])

  const fetchBanks = async () => {
    try {
      const response = await fetch('/api/payments/connect-bank')
      const data = await response.json()
      
      if (data.success) {
        setBanks(data.data)
      } else {
        setError('Failed to load banks')
      }
    } catch (error) {
      log.error('Failed to fetch banks', { error: error as Error })
      setError('Failed to load banks')
    }
  }

  const handleConnect = async () => {
    if (!selectedBank || !accountNumber || !businessName) {
      setError('Please fill all fields and verify your account')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      log.info('Connecting bank account', {
        bankCode: selectedBank,
        accountNumber,
        businessName,
        userId
      })

      const response = await fetch('/api/payments/connect-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankCode: selectedBank,
          accountNumber,
          businessName,
          userId
        })
      })

      const data = await response.json()
      
      if (data.success) {
        setSuccess('Bank account connected successfully! You can now receive payments.')
        
        // Reset form
        setSelectedBank('')
        setAccountNumber('')
        setBusinessName('')
        setVerifiedAccount(null)
        
        // Call success callback
        onConnectionSuccess?.()
        
        log.info('Bank account connected successfully', {
          userId,
          accountName: data.data.accountName as string
        })
      } else {
        setError(data.message || 'Failed to connect bank account')
      }
    } catch (error) {
      log.error('Bank connection failed', { error: error as Error })
      ErrorTracker.captureException(error as Error, {
        tags: { component: 'bank_connection' } as Record<string, string>
      })
      setError('Failed to connect bank account')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Connect Bank Account
        </CardTitle>
        <CardDescription>
          Connect your bank account to receive payments directly. All transactions are secured with enterprise-grade encryption.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Security Notice */}
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            Your banking information is encrypted and secure. We use Paystack&#39;s enterprise-grade security to protect your data.
          </AlertDescription>
        </Alert>

        {/* Success Message */}
        {success && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              {success}
            </AlertDescription>
          </Alert>
        )}

        {/* Error Message */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Bank Selection */}
          <div className="space-y-2">
            <Label htmlFor="bank">Select Bank</Label>
            <Select value={selectedBank} onValueChange={setSelectedBank}>
              <SelectTrigger>
                <SelectValue placeholder="Choose your bank" />
              </SelectTrigger>
              <SelectContent>
                {banks.map((bank) => (
                  <SelectItem key={bank.code} value={bank.code}>
                    {bank.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Account Number */}
          <div className="space-y-2">
            <Label htmlFor="accountNumber">Account Number</Label>
            <div className="relative">
              <Input
                id="accountNumber"
                type="text"
                placeholder="0123456789"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="pr-8"
              />
              {isVerifying && (
                <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-blue-500" />
              )}
              {verifiedAccount && (
                <CheckCircle className="absolute right-2 top-2.5 h-4 w-4 text-green-500" />
              )}
            </div>
            {verifiedAccount && (
              <p className="text-sm text-green-600 font-medium">
                ✓ Account verified: {verifiedAccount}
              </p>
            )}
          </div>
        </div>

        {/* Business Name */}
        <div className="space-y-2">
          <Label htmlFor="businessName">Business Name</Label>
          <Input
            id="businessName"
            type="text"
            placeholder="Your practice or business name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
          <p className="text-sm text-gray-500">
            This will appear on your Paystack subaccount and payment records.
          </p>
        </div>

        {/* Connection Summary */}
        {selectedBank && accountNumber && verifiedAccount && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">Connection Summary</h4>
            <div className="space-y-1 text-sm text-blue-800">
              <p><strong>Bank:</strong> {selectedBankName}</p>
              <p><strong>Account:</strong> {verifiedAccount} ({accountNumber})</p>
              <p><strong>Business:</strong> {businessName}</p>
            </div>
          </div>
        )}

        {/* Fee Information */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-2">💰 Fee Structure</h4>
          <div className="space-y-1 text-sm text-gray-700">
            <p><strong>Platform Fee:</strong> ₦1,000 per transaction</p>
            <p><strong>Payment Processing:</strong> 1.5% + ₦100 (Paystack fees)</p>
            <p><strong>Transfer Time:</strong> Within 24 hours</p>
            <p><strong>Your Share:</strong> Total amount - Platform fee - Processing fees</p>
          </div>
        </div>

        {/* Connect Button */}
        <Button
          onClick={handleConnect}
          disabled={!selectedBank || !accountNumber || !businessName || !verifiedAccount || isLoading}
          className="w-full"
          size="lg"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting Account...
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              Connect Bank Account
            </>
          )}
        </Button>

        <p className="text-xs text-gray-500 text-center">
          By connecting your bank account, you agree to our Terms of Service and Privacy Policy.
          Your account information is encrypted and stored securely.
        </p>
      </CardContent>
    </Card>
  )
}
