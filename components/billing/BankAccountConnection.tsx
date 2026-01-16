'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { useAction, useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle, AlertCircle, Building2, Trash2 } from 'lucide-react'
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

  // Convex hooks
  const getBankList = useAction(api.flutterwave.getBankList)
  const verifyBankAccount = useAction(api.flutterwave.verifyBankAccount)
  const createSubaccount = useAction(api.flutterwave.createPhysiotherapistSubaccount)
  const existingAccounts = useQuery(api.flutterwave.getMyBankAccounts)
  const currentUser = useQuery(api.users.getMyUser)
  const deleteBankAccount = useMutation(api.flutterwave.deleteBankAccount)

  const selectedBankName = banks.find(bank => bank.code === selectedBank)?.name || ''

  const fetchBanks = useCallback(async () => {
    try {
      const bankList = await getBankList()
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
        setBusinessName(result.accountName)
      } else {
        setVerifiedAccount(null)
        setError(result.message || 'Could not verify account')
      }
    } catch (error) {
      console.error('Account verification failed:', error)
      setVerifiedAccount(null)
      setError('Account verification failed')
    } finally {
      setIsVerifying(false)
    }
  }, [selectedBank, accountNumber, verifyBankAccount])

  useEffect(() => {
    if (selectedBank && accountNumber.length === 10) {
      verifyAccount()
    } else {
      setVerifiedAccount(null)
    }
  }, [selectedBank, accountNumber, verifyAccount])

  const handleConnect = async () => {
    if (!selectedBank || !accountNumber || !businessName || !currentUser) {
      setError('Please fill all fields')
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
        toast.success('Bank account connected!')
        setSelectedBank('')
        setAccountNumber('')
        setBusinessName('')
        setVerifiedAccount(null)
        onConnectionSuccess?.()
      } else {
        setError(result.message || 'Failed to connect account')
      }
    } catch (error) {
      console.error('Bank connection failed:', error)
      setError('Failed to connect bank account')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchBanks()
  }, [fetchBanks])

  return (
    <div className="space-y-6">
      {/* Existing Accounts */}
      {existingAccounts && existingAccounts.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">Connected Account</p>
          {existingAccounts.map((account: {
            _id: string;
            accountName: string;
            bankName: string;
            accountNumber: string;
            isDefault?: boolean;
          }) => (
            <div key={account._id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{account.accountName}</p>
                  <p className="text-sm text-gray-500">{account.bankName} • ****{account.accountNumber.slice(-4)}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-red-600"
                onClick={() => deleteBankAccount({ accountId: account._id as Id<'physiotherapistBankAccounts'> })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      {/* Form */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-600">Select Bank</Label>
            <Select value={selectedBank} onValueChange={setSelectedBank}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Choose bank" />
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

          <div className="space-y-1.5">
            <Label className="text-sm text-gray-600">Account Number</Label>
            <div className="relative">
              <Input
                type="text"
                placeholder="0123456789"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="h-11 pr-9"
              />
              {isVerifying && (
                <Loader2 className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-gray-400" />
              )}
              {verifiedAccount && (
                <CheckCircle className="absolute right-3 top-3.5 h-4 w-4 text-emerald-500" />
              )}
            </div>
          </div>
        </div>

        {verifiedAccount && (
          <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
            <CheckCircle className="h-4 w-4" />
            <span>Verified: <strong>{verifiedAccount}</strong></span>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-sm text-gray-600">Business Name</Label>
          <Input
            type="text"
            placeholder="Your practice name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="h-11"
          />
        </div>

        <Button
          onClick={handleConnect}
          disabled={!selectedBank || !accountNumber || !businessName || !verifiedAccount || isLoading}
          className="w-full h-11 bg-emerald-600 hover:bg-emerald-700"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            'Connect Bank Account'
          )}
        </Button>

        <p className="text-xs text-center text-gray-400">
          Your banking details are encrypted and secure
        </p>
      </div>
    </div>
  )
}
