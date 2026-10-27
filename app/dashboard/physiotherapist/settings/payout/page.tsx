'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAction, useMutation, useQuery } from 'convex/react';
import { Loader2 } from '@/components/icons';
import { toast } from 'sonner';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { primaryButtonClass, StatusBadge } from '@/components/physio/ui';
import { SettingsPageHeader, SettingsSection, fieldHintClass, fieldLabelClass } from '@/components/physio/SettingsUI';
import { usePracticeMode } from '@/components/physio/practiceMode';

type BankAccount = {
    _id: Id<'physiotherapistBankAccounts'>;
    bankName: string;
    accountNumber: string;
    accountName: string;
    isVerified: boolean;
    needsReconnect?: boolean;
};

function maskAccount(number: string) {
    return number.length > 4 ? `•••• ${number.slice(-4)}` : number;
}

/** Bank + account number → Paystack name check → confirm. */
function BankAccountForm({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
    const user = useQuery(api.users.getMyUser);
    const getBankList = useAction(api.paystack.getBankList);
    const verifyBankAccount = useAction(api.paystack.verifyBankAccount);
    const createSubaccount = useAction(api.paystack.createPhysiotherapistSubaccount);

    const [banks, setBanks] = useState<{ name: string; code: string }[] | null>(null);
    const [bankCode, setBankCode] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [resolvedName, setResolvedName] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        getBankList({})
            .then((list) => setBanks(list as { name: string; code: string }[]))
            .catch(() => {
                setBanks([]);
                toast.error('Couldn’t load the list of banks. Refresh to try again.');
            });
    }, [getBankList]);

    // Paystack can list a bank twice; keep the first of each code
    const bankOptions = useMemo(() => {
        const seen = new Set<string>();
        return (banks ?? []).filter((bank) => (seen.has(bank.code) ? false : (seen.add(bank.code), true)));
    }, [banks]);
    const bankName = bankOptions.find((bank) => bank.code === bankCode)?.name;

    const verify = async () => {
        setBusy(true);
        try {
            const result = await verifyBankAccount({ bankCode, accountNumber });
            if (result.success && result.accountName) setResolvedName(result.accountName);
            else toast.error(result.message || 'We couldn’t find that account. Check the number and bank.');
        } catch {
            toast.error('We couldn’t check that account right now. Try again shortly.');
        } finally {
            setBusy(false);
        }
    };

    const confirm = async () => {
        if (!user || !resolvedName) return;
        setBusy(true);
        try {
            const result = await createSubaccount({
                physiotherapistId: user._id,
                businessName: [user.firstName, user.lastName].filter(Boolean).join(' ') || resolvedName,
                accountName: resolvedName,
                bankCode,
                accountNumber,
                percentageCharge: 0,
            });
            if (!result.success) throw new Error(result.message);
            toast.success('Payout account saved');
            onDone();
        } catch (error) {
            toast.error((error as Error).message || 'Couldn’t save this account');
        } finally {
            setBusy(false);
        }
    };

    if (resolvedName) {
        return (
            <div className="space-y-4">
                <div className="rounded-lg border border-neutral-200 p-4 dark:border-white/[0.07]">
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Account holder</p>
                    <p className="mt-0.5 text-base font-semibold text-neutral-900 dark:text-white">{resolvedName}</p>
                    <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                        {bankName} · {accountNumber}
                    </p>
                </div>
                <p className={fieldHintClass}>Is this your account? Payouts can only go to an account in your name.</p>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="ghost" onClick={() => setResolvedName(null)} disabled={busy}>
                        Back
                    </Button>
                    <Button onClick={confirm} disabled={busy} className={primaryButtonClass}>
                        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Yes, use this account
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label className={fieldLabelClass}>Bank</Label>
                    <Select value={bankCode} onValueChange={setBankCode} disabled={banks === null}>
                        <SelectTrigger>
                            <SelectValue placeholder={banks === null ? 'Loading banks…' : 'Choose your bank'} />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                            {bankOptions.map((bank) => (
                                <SelectItem key={bank.code} value={bank.code}>
                                    {bank.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="accountNumber" className={fieldLabelClass}>Account number</Label>
                    <Input
                        id="accountNumber"
                        inputMode="numeric"
                        maxLength={10}
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value.replace(/[^\d]/g, ''))}
                        placeholder="10 digits"
                        className="tabular-nums"
                    />
                </div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                {onCancel && (
                    <Button variant="ghost" onClick={onCancel} disabled={busy}>
                        Cancel
                    </Button>
                )}
                <Button
                    onClick={verify}
                    disabled={busy || !bankCode || accountNumber.length !== 10}
                    className={primaryButtonClass}
                >
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Continue
                </Button>
            </div>
        </div>
    );
}

export default function PayoutSettingsPage() {
    const accounts = useQuery(api.paystack.getMyBankAccounts) as BankAccount[] | undefined;
    const deleteBankAccount = useMutation(api.paystack.deleteBankAccount);
    // Independent physios are paid by their own patients, never Rehabify payouts
    const { isIndependent, mode } = usePracticeMode();
    const [editing, setEditing] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);

    const account = accounts?.[0];

    const remove = async () => {
        if (!account) return;
        try {
            await deleteBankAccount({ accountId: account._id });
            toast.success('Payout account removed');
        } catch {
            toast.error('Couldn’t remove this account');
        } finally {
            setConfirmRemove(false);
        }
    };

    return (
        <div className="space-y-6">
            <SettingsPageHeader
                title="Payouts"
                description={isIndependent ? 'Where your patients’ payments on your invoices go.' : 'The account we send your session payouts to.'}
            />

            <SettingsSection title="Payout account">
                {accounts === undefined ? (
                    <Skeleton className="h-20 rounded-lg" />
                ) : account && !editing ? (
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{account.bankName}</p>
                                {account.needsReconnect ? (
                                    <StatusBadge tone="amber">Reconnect needed</StatusBadge>
                                ) : (
                                    account.isVerified && <StatusBadge tone="green">Verified</StatusBadge>
                                )}
                            </div>
                            <p className="mt-0.5 truncate text-sm text-neutral-500 dark:text-neutral-400">
                                {account.accountName} · <span className="tabular-nums">{maskAccount(account.accountNumber)}</span>
                            </p>
                            {account.needsReconnect && (
                                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                                    Payments have moved to live mode. Use Change account and enter the same details again so
                                    payments reach this account directly. Until then Rehabify holds your share and pays you.
                                </p>
                            )}
                        </div>
                        <div className="flex shrink-0 gap-2">
                            <Button variant="ghost" size="sm" className="text-neutral-500" onClick={() => setConfirmRemove(true)}>
                                Remove
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                                Change account
                            </Button>
                        </div>
                    </div>
                ) : (
                    <BankAccountForm
                        onDone={() => setEditing(false)}
                        onCancel={account ? () => setEditing(false) : undefined}
                    />
                )}
            </SettingsSection>

            {isIndependent ? (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Your patients pay your invoices by card, transfer or USSD, and the money comes to this account. Rehabify takes nothing.
                    If a patient pays you directly, record it as paid on the invoice.
                </p>
            ) : (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Rehabify Care patients pay Rehabify. For each session you earn the fixed payout for that service, plus your share of any
                    home-visit travel charge, and we send it to this account once the session is marked completed. See your{' '}
                    <Link href="/dashboard/physiotherapist/settings/fee-schedule" className="underline hover:text-neutral-900 dark:hover:text-white">
                        payout schedule
                    </Link>
                    .{mode === 'both' && ' Your own patients pay your invoices into this account too.'}
                </p>
            )}

            <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove your payout account?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {isIndependent
                                ? 'Your patients can’t pay your invoices online until you add another account.'
                                : 'Patients can’t book you until you add another account.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep it</AlertDialogCancel>
                        <AlertDialogAction onClick={remove} className="bg-red-600 text-white hover:bg-red-700">
                            Remove
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
