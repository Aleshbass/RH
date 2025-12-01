'use client';

import { useState, useEffect } from 'react';
import { useQuery, useAction, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Loader2, Plus, Trash2, Building2, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import Link from 'next/link';

export function PayoutSettings({ currentUser }: { currentUser: any }) {
    const bankAccounts = useQuery(api.paystack.getMyBankAccounts);
    const deleteBankAccount = useMutation(api.paystack.deleteBankAccount);

    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

    const handleDelete = async (accountId: any) => {
        if (!confirm('Are you sure you want to remove this bank account?')) return;

        try {
            await deleteBankAccount({ accountId });
            toast.success('Bank account removed successfully');
        } catch (error) {
            console.error('Failed to delete bank account:', error);
            toast.error('Failed to remove bank account');
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Building2 className="h-5 w-5" />
                                Connected Bank Accounts
                            </CardTitle>
                            <CardDescription>
                                Manage the bank accounts where you receive your payouts.
                            </CardDescription>
                        </div>
                        <Button onClick={() => setIsAddDialogOpen(true)} size="sm">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Bank Account
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {bankAccounts === undefined ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                        </div>
                    ) : bankAccounts.length === 0 ? (
                        <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed">
                            <Building2 className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                            <h3 className="text-sm font-medium text-gray-900">No bank accounts connected</h3>
                            <p className="text-sm text-gray-500 mt-1 mb-4">
                                Connect a bank account to start receiving payouts.
                            </p>
                            <Button variant="outline" onClick={() => setIsAddDialogOpen(true)}>
                                Add Bank Account
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {bankAccounts.map((account) => (
                                <div
                                    key={account._id}
                                    className="flex items-center justify-between p-4 border rounded-lg bg-white hover:border-blue-200 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="bg-blue-50 p-2 rounded-full">
                                            <Building2 className="h-5 w-5 text-blue-600" />
                                        </div>
                                        <div>
                                            <h4 className="font-medium text-gray-900">{account.bankName}</h4>
                                            <p className="text-sm text-gray-500">
                                                {account.accountNumber} • {account.accountName}
                                            </p>
                                            {account.isVerified && (
                                                <span className="inline-flex items-center text-xs text-green-600 mt-1">
                                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                                    Verified
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-gray-400 hover:text-red-600"
                                        onClick={() => handleDelete(account._id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Payout Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Payout Schedule</AlertTitle>
                        <AlertDescription>
                            Payouts are processed automatically 24 hours after appointment completion.
                            {' '}
                            <Link
                                href="/payout-policy"
                                target="_blank"
                                className="font-medium underline underline-offset-4 hover:text-blue-600 inline-flex items-center"
                            >
                                Learn more about our payout policy
                                <ExternalLink className="h-3 w-3 ml-1" />
                            </Link>
                        </AlertDescription>
                    </Alert>
                </CardContent>
            </Card>

            <AddBankAccountDialog
                open={isAddDialogOpen}
                onOpenChange={setIsAddDialogOpen}
                currentUser={currentUser}
            />
        </div>
    );
}

function AddBankAccountDialog({
    open,
    onOpenChange,
    currentUser
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentUser: any;
}) {
    const getBankList = useAction(api.paystack.getBankList);
    const verifyBankAccount = useAction(api.paystack.verifyBankAccount);
    const createSubaccount = useAction(api.paystack.createPhysiotherapistSubaccount);

    const [step, setStep] = useState<'details' | 'confirm'>('details');
    const [isLoading, setIsLoading] = useState(false);
    const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
    const [formData, setFormData] = useState({
        bankCode: '',
        accountNumber: '',
        accountName: '',
    });

    // Fetch banks on mount
    useEffect(() => {
        if (open && banks.length === 0) {
            getBankList({}).then(setBanks).catch(console.error);
        }
    }, [open, banks.length, getBankList]);

    const handleVerify = async () => {
        if (!formData.bankCode || !formData.accountNumber) {
            toast.error('Please select a bank and enter account number');
            return;
        }

        setIsLoading(true);
        try {
            const result = await verifyBankAccount({
                bankCode: formData.bankCode,
                accountNumber: formData.accountNumber,
            });

            if (result.success && result.accountName) {
                setFormData(prev => ({ ...prev, accountName: result.accountName! }));
                setStep('confirm');
            } else {
                toast.error(result.message || 'Could not verify account details');
            }
        } catch (error) {
            console.error('Verification error:', error);
            toast.error('Failed to verify account');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async () => {
        setIsLoading(true);
        try {
            const result = await createSubaccount({
                physiotherapistId: currentUser._id,
                businessName: `${currentUser.firstName} ${currentUser.lastName}`,
                bankCode: formData.bankCode,
                accountNumber: formData.accountNumber,
                percentageCharge: 0, // Default to split payment model
            });

            if (result.success) {
                toast.success('Bank account connected successfully');
                onOpenChange(false);
                setStep('details');
                setFormData({ bankCode: '', accountNumber: '', accountName: '' });
            } else {
                toast.error(result.message || 'Failed to connect bank account');
            }
        } catch (error) {
            console.error('Submission error:', error);
            toast.error('Failed to connect bank account');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Add Bank Account</DialogTitle>
                    <DialogDescription>
                        Connect your bank account to receive payouts directly.
                    </DialogDescription>
                </DialogHeader>

                {step === 'details' ? (
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Bank Name</Label>
                            <Select
                                value={formData.bankCode}
                                onValueChange={(value) => setFormData(prev => ({ ...prev, bankCode: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select your bank" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                    {banks.map((bank, index) => (
                                        <SelectItem key={`${bank.code}-${index}`} value={bank.code}>
                                            {bank.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Account Number</Label>
                            <Input
                                value={formData.accountNumber}
                                onChange={(e) => setFormData(prev => ({ ...prev, accountNumber: e.target.value }))}
                                placeholder="0123456789"
                                maxLength={10}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 py-4">
                        <Alert className="bg-green-50 border-green-200">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            <AlertTitle className="text-green-800">Account Verified</AlertTitle>
                            <AlertDescription className="text-green-700">
                                Please confirm these details are correct.
                            </AlertDescription>
                        </Alert>

                        <div className="grid gap-2 p-4 bg-gray-50 rounded-lg text-sm">
                            <div className="grid grid-cols-3 gap-1">
                                <span className="text-gray-500">Account Name:</span>
                                <span className="col-span-2 font-medium text-gray-900">{formData.accountName}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                                <span className="text-gray-500">Account Number:</span>
                                <span className="col-span-2 font-medium text-gray-900">{formData.accountNumber}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                                <span className="text-gray-500">Bank:</span>
                                <span className="col-span-2 font-medium text-gray-900">
                                    {banks.find(b => b.code === formData.bankCode)?.name}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    {step === 'details' ? (
                        <Button onClick={handleVerify} disabled={isLoading || !formData.bankCode || !formData.accountNumber}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Verify Account
                        </Button>
                    ) : (
                        <div className="flex gap-2 w-full justify-end">
                            <Button variant="outline" onClick={() => setStep('details')} disabled={isLoading}>
                                Back
                            </Button>
                            <Button onClick={handleSubmit} disabled={isLoading}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Confirm & Add
                            </Button>
                        </div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
