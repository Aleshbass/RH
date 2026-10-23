'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAction, useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle, AlertCircle, Building2, Trash2 } from '@/components/icons'
import { toast } from 'sonner'
import { Id } from '@/convex/_generated/dataModel'

interface Bank {
    name: string
    code: string
}

interface DoctorBankConnectionProps {
    doctorId: Id<"users">
    onConnectionSuccess?: () => void
}

export function DoctorBankAccountConnection({ doctorId, onConnectionSuccess }: DoctorBankConnectionProps) {
    const [banks, setBanks] = useState<Bank[]>([])
    const [isLoadingBanks, setIsLoadingBanks] = useState(true)
    const [selectedBank, setSelectedBank] = useState<string>('')
    const [accountNumber, setAccountNumber] = useState('')
    const [businessName, setBusinessName] = useState('')
    const [isVerifying, setIsVerifying] = useState(false)
    const [isConnecting, setIsConnecting] = useState(false)
    const [accountName, setAccountName] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Paystack Actions and Queries
    const getBankList = useAction(api.paystack.getBankList)
    const verifyBankAccount = useAction(api.paystack.verifyBankAccount)
    const createSubaccount = useAction(api.paystackDoctor.createDoctorSubaccount)
    const savedAccounts = useQuery(api.paystackDoctor.getMyDoctorBankAccounts)
    const deleteAccount = useMutation(api.paystackDoctor.deleteDoctorBankAccount)

    useEffect(() => {
        const fetchBanks = async () => {
            try {
                const bankList = await getBankList()
                setBanks(bankList)
            } catch (err) {
                console.error("Failed to fetch banks:", err)
                setError("Failed to load supported banks. Please try again later.")
            } finally {
                setIsLoadingBanks(false)
            }
        }

        fetchBanks()
    }, [getBankList])

    const handleVerify = useCallback(async () => {
        if (!selectedBank || accountNumber.length < 10) return

        setIsVerifying(true)
        setError(null)
        setAccountName(null)

        try {
            const result = await verifyBankAccount({
                accountNumber,
                bankCode: selectedBank
            })

            if (result.success && result.accountName) {
                setAccountName(result.accountName)
                if (!businessName) {
                    setBusinessName(result.accountName)
                }
            } else {
                setError(result.message || "Failed to verify account details")
            }
        } catch (err) {
            setError("Error communicating with bank verification service")
        } finally {
            setIsVerifying(false)
        }
    }, [selectedBank, accountNumber, verifyBankAccount, businessName])

    useEffect(() => {
        if (selectedBank && accountNumber.length >= 10) {
            const timeoutId = setTimeout(() => {
                handleVerify()
            }, 500)
            return () => clearTimeout(timeoutId)
        } else {
            setAccountName(null)
        }
    }, [selectedBank, accountNumber, handleVerify])

    const handleConnect = async () => {
        if (!selectedBank || !accountNumber || !accountName || !businessName) {
            setError("Please fill all required fields and wait for account verification")
            return
        }

        setIsConnecting(true)
        setError(null)

        try {
            const result = await createSubaccount({
                doctorId,
                bankCode: selectedBank,
                accountNumber,
                businessName,
                percentageCharge: 0 // Flat
            })

            if (result.success) {
                toast.success(result.message || "Bank account connected successfully")
                // Reset form
                setSelectedBank('')
                setAccountNumber('')
                setBusinessName('')
                setAccountName(null)

                if (onConnectionSuccess) {
                    onConnectionSuccess()
                }
            } else {
                toast.error(result.message || "Failed to connect bank account")
            }
        } catch (err) {
            console.error("Connection error:", err)
            toast.error("An unexpected error occurred while connecting the bank account")
        } finally {
            setIsConnecting(false)
        }
    }

    const handleDelete = async (accountId: Id<"doctorBankAccounts">) => {
        if (window.confirm("Are you sure you want to remove this bank account?")) {
            try {
                await deleteAccount({ accountId })
                toast.success("Bank account removed successfully")
            } catch (error) {
                toast.error("Failed to remove bank account")
            }
        }
    }

    if (savedAccounts === undefined) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {savedAccounts.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-lg font-medium text-gray-900">Connected Accounts</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {savedAccounts.map((account: any) => (
                            <Card key={account._id} className="relative overflow-hidden">
                                <CardContent className="p-6">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center space-x-3">
                                            <div className="p-2 bg-indigo-50 rounded-lg">
                                                <Building2 className="h-6 w-6 text-indigo-600" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900">{account.bankName}</p>
                                                <p className="text-sm text-gray-500">
                                                    •••• {account.accountNumber.slice(-4)}
                                                </p>
                                            </div>
                                        </div>
                                        {account.isDefault && (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                Default
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-4 flex items-center justify-between text-sm">
                                        <span className="text-gray-500">{account.accountName}</span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                            onClick={() => handleDelete(account._id as Id<"doctorBankAccounts">)}
                                        >
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Remove
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Connect New Bank Account</CardTitle>
                    <CardDescription>
                        Connect your bank account to receive referral kickbacks.
                        Powered securely by Paystack.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="bank">Select Bank</Label>
                        <Select
                            value={selectedBank}
                            onValueChange={setSelectedBank}
                            disabled={isLoadingBanks || isVerifying || isConnecting}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={isLoadingBanks ? "Loading banks..." : "Choose your bank"} />
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

                    <div className="space-y-2">
                        <Label htmlFor="accountNumber">Account Number</Label>
                        <div className="relative">
                            <Input
                                id="accountNumber"
                                placeholder="Enter 10-digit account number"
                                value={accountNumber}
                                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                disabled={!selectedBank || isConnecting}
                                className={accountName ? "border-green-500 pr-10" : ""}
                            />
                            {isVerifying && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                                </div>
                            )}
                            {accountName && !isVerifying && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                </div>
                            )}
                        </div>
                    </div>

                    {accountName && (
                        <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                            <p className="text-sm font-medium text-green-800">
                                Verified Account Name
                            </p>
                            <p className="text-sm text-green-700 mt-1">
                                {accountName}
                            </p>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="businessName">Display/Business Name</Label>
                        <Input
                            id="businessName"
                            placeholder="How should this appear on payments?"
                            value={businessName}
                            onChange={(e) => setBusinessName(e.target.value)}
                            disabled={isConnecting}
                        />
                        <p className="text-xs text-gray-500">
                            This name will be associated with your payouts
                        </p>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button
                        className="w-full bg-indigo-600 hover:bg-indigo-700"
                        onClick={handleConnect}
                        disabled={!selectedBank || !accountNumber || !accountName || !businessName || isConnecting}
                    >
                        {isConnecting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Connecting...
                            </>
                        ) : (
                            'Connect Bank Account'
                        )}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    )
}
