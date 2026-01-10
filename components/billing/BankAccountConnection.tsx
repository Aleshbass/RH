'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { useAction, useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle, AlertCircle, CreditCard, Shield, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Id } from '@/convex/_generated/dataModel'

interface Bank {
  name: string
  code: string
}

interface BankConnectionProps {
  onConnectionSuccess?: () => void
}

export function BankAccountConnection({ onConnectionSuccess }: BankConnectionProps) {
  const [banks, setBanks] = useState<Bank[]>([])
  const [selectedBank, setSelectedBank] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [verifiedAccount, setVerifiedAccount] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Convex hooks - Using Flutterwave
  const getBankList = useAction(api.flutterwave.getBankList)
  const verifyBankAccount = useAction(api.flutterwave.verifyBankAccount)
  const createSubaccount = useAction(api.flutterwave.createPhysiotherapistSubaccount)
  const existingAccounts = useQuery(api.flutterwave.getMyBankAccounts)
  const currentUser = useQuery(api.users.getMyUser)
  const deleteBankAccount = useMutation(api.flutterwave.deleteBankAccount)

  // Derived state for selected bank name
  const selectedBankName = banks.find(bank => bank.code === selectedBank)?.name || ''

  const fetchBanks = useCallback(async () => {
    try {
      const bankList = await getBankList()
      // De-duplicate banks by code and sort alphabetically by name
      const uniqueByCode = Array.from(new Map(bankList.map((b: Bank) => [b.code, b])).values()) as Bank[]
      uniqueByCode.sort((a, b) => a.name.localeCompare(b.name))
      setBanks(uniqueByCode)
    } catch (error) {
      console.error('Failed to fetch banks:', error)
      toast.error('Failed to load banks')
    }
  }, [getBankList])

  const verifyAccount = React.useCallback(async () => {
    if (!selectedBank || accountNumber.length !== 10) return

    setIsVerifying(true)
    setError('')

    try {
      const result = await verifyBankAccount({
        bankCode: selectedBank,
        accountNumber
      })

      if (result.success && result.accountName) {
        setVerifiedAccount(result.accountName)
        setBusinessName(result.accountName) // Pre-fill business name
      } else {
        setVerifiedAccount(null)
        setError(result.message || 'Could not verify account. Please check your details.')
      }
    } catch (error) {
      console.error('Account verification failed:', error)
      setVerifiedAccount(null)
      setError('Account verification failed')
    } finally {
      setIsVerifying(false)
    }
  }, [selectedBank, accountNumber, verifyBankAccount])

  // Auto-verify account when bank and account number are valid
  useEffect(() => {
    if (selectedBank && accountNumber.length === 10) {
      verifyAccount()
    } else {
      setVerifiedAccount(null)
    }
  }, [selectedBank, accountNumber, verifyAccount])


  const handleConnect = async () => {
    if (!selectedBank || !accountNumber || !businessName || !currentUser) {
      setError('Please fill all fields and verify your account')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const result = await createSubaccount({
        physiotherapistId: currentUser._id,
        businessName,
        bankCode: selectedBank,
        accountNumber,
      })

      if (result.success) {
        toast.success('Bank account connected successfully! You can now receive payments.')

        // Reset form
        setSelectedBank('')
        setAccountNumber('')
        setBusinessName('')
        setVerifiedAccount(null)

        // Call success callback
        onConnectionSuccess?.()
      } else {
        setError(result.message || 'Failed to connect bank account')
      }
    } catch (error) {
      console.error('Bank connection failed:', error)
      toast.error('Failed to connect bank account')
      setError('Failed to connect bank account')
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch banks on component mount
  useEffect(() => {
    fetchBanks()
  }, [fetchBanks])

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
            Your banking information is encrypted and secure. We use Flutterwave&apos;s enterprise-grade security to protect your data.
          </AlertDescription>
        </Alert>

        {/* Existing Bank Accounts */}
        {existingAccounts && existingAccounts.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Connected Accounts</h4>
            {existingAccounts.map((account: {
              _id: string;
              accountName: string;
              bankName: string;
              accountNumber: string;
              isDefault?: boolean;
            }) => (
              <div key={account._id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                <div>
                  <p className="font-medium">{account.accountName}</p>
                  <p className="text-sm text-gray-600">
                    {account.bankName} - {account.accountNumber}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {account.isDefault && (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Default</span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => deleteBankAccount({ accountId: account._id as Id<'physiotherapistBankAccounts'> })}
                    title="Remove account"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <p className="text-xs text-gray-500">To change your payout account, connect a new bank below. Your default account will be replaced.</p>
          </div>
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
            This will appear on your Flutterwave subaccount and payment records.
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
            <p><strong>Payment Processing:</strong> 1.4% (capped at ₦2,000) via Flutterwave</p>
            <p><strong>Transfer Time:</strong> Instant split payments</p>
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
