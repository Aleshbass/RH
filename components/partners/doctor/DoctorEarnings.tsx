"use client";

import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, Download, Landmark, Plus, Printer, Receipt, Trash2, Wallet } from "@/components/icons";
import {
  EmptyState,
  LoadingBlocks,
  PageHeader,
  Panel,
  PhysioDrawer,
  StatTile,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/physio/ui";
import { StatusBadge, type Tone } from "@/components/patient/ui";
import { PartnerStatementBody, exportStatementCsv, type PartnerStatementData } from "@/components/partners/PartnerStatement";
import { api } from "@/convex/_generated/api";
import { playSound } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import { doctorRefs, type BankAccount, type CommissionRow } from "./refs";
import { FieldLabel, errorText, formatKobo, inputClass, longDate, selectClass } from "./ui";

const STATUS: Record<CommissionRow["status"], { label: string; tone: Tone }> = {
  pending: { label: "Awaiting approval", tone: "neutral" },
  approved: { label: "Ready for payout", tone: "blue" },
  paid: { label: "Paid", tone: "green" },
  reversed: { label: "Reversed", tone: "rose" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const SOURCE: Record<string, string> = {
  marketplace: "Online booking",
  joy: "Booked with Joy",
  bank_transfer: "Bank transfer",
  invoice: "Clinic invoice",
  invoice_manual: "Clinic invoice",
  refund: "Refund",
};

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function downloadCsv(filename: string, rows: string[][]) {
  const escape = (cell: string) => (/[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  const blob = new Blob([rows.map((r) => r.map(escape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Commission earned on referred patients' payments, payouts and the bank account they go to. */
export function DoctorEarnings({ partnerCode }: { partnerCode: string }) {
  const summary = useQuery(doctorRefs.summary, { partnerId: partnerCode });
  const contract = useQuery(doctorRefs.contract, { partnerId: partnerCode });
  const [status, setStatus] = useState("all");
  const commissions = useQuery(doctorRefs.commissions, { partnerId: partnerCode, status, limit: 300 });
  const [statementPeriod, setStatementPeriod] = useState<string | null>(null);
  const pending = summary?.pendingApprovalKobo ?? 0;

  const terms = contract
    ? [
        contract.revenueSharePercent != null ? `${contract.revenueSharePercent}% of each payment your patients make` : null,
        contract.baseFeePerBooking ? `${formatKobo(contract.baseFeePerBooking)} per new patient` : null,
        contract.activationBonusPerPatient ? `${formatKobo(contract.activationBonusPerPatient)} bonus when a patient starts` : null,
      ].filter(Boolean)
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Earnings"
        description="Commission on what patients you referred pay for their care. Paid to your bank account every month."
        info="Commission is earned on verified payments: online bookings, Joy bookings and clinic invoices. A refund reverses it."
        actions={
          <Button type="button" variant="outline" className={secondaryButtonClass} onClick={() => setStatementPeriod(currentPeriod())}>
            <Receipt className="h-4 w-4" />
            Monthly statement
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total earned" value={summary ? formatKobo(summary.totalEarnedKobo) : "—"} icon={Wallet} tone="neutral" info="After withholding tax, if your terms have it." />
        <StatTile label="Ready for payout" value={summary ? formatKobo(summary.availablePayoutKobo) : "—"} icon={CheckCircle2} tone="green" hint="Paid out monthly" />
        <StatTile
          label={pending > 0 ? "Awaiting approval" : "In payout"}
          value={summary ? formatKobo(pending > 0 ? pending : summary.inPayoutKobo) : "—"}
          icon={Clock}
          tone="blue"
          info={
            pending > 0
              ? "A clinic recorded a cash, POS or transfer payment by hand. Rehabify checks it before it counts towards your payout."
              : "Sent to your bank, waiting for the bank to confirm."
          }
        />
        <StatTile
          label="Paid to you"
          value={summary ? formatKobo(summary.paidOutKobo) : "—"}
          icon={Landmark}
          tone="neutral"
          hint={summary && summary.reversedKobo > 0 ? `${formatKobo(summary.reversedKobo)} reversed (refunds)` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Your terms" bodyClassName="px-5 pb-5 pt-3 sm:px-6">
          {contract === undefined ? (
            <LoadingBlocks rows={2} />
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-pt-ink">{contract.isDefault ? "Rehabify's standard terms for referrers" : `Agreement ${contract.contractNumber ?? ""}`.trim()}</p>
              {terms.length > 0 && (
                <ul className="space-y-1.5">
                  {terms.map((line) => (
                    <li key={line} className="flex gap-2 text-pt-muted">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-pt-green-fg" />
                      {line}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-pt-muted">
                Paid monthly{contract.paymentTermsDays ? `, within ${contract.paymentTermsDays} days of month end` : ""}
                {contract.withholdingTaxPercent ? `. ${contract.withholdingTaxPercent}% withholding tax is deducted.` : "."}
              </p>
            </div>
          )}
        </Panel>
        <PayoutAccount partnerCode={partnerCode} className="lg:col-span-2" />
      </div>

      <Panel
        title="Commissions"
        description="One line for each payment by a patient you referred."
        actions={
          <div className="flex items-center gap-2">
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter commissions" className={selectClass}>
              <option value="all">All</option>
              <option value="approved">Ready for payout</option>
              <option value="paid">Paid</option>
              <option value="pending">Awaiting approval</option>
              <option value="reversed">Reversed</option>
            </select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Download as a spreadsheet (CSV)"
              disabled={!commissions || commissions.length === 0}
              className={cn(secondaryButtonClass, "h-10 w-10")}
              onClick={() =>
                downloadCsv(`rehabify-earnings-${partnerCode}.csv`, [
                  ["Date", "Patient", "Tracking code", "Source", "Payment (NGN)", "You earn (NGN)", "Status", "Month"],
                  ...(commissions ?? []).map((c) => [
                    longDate(c.earnedAt),
                    c.patientName ?? "",
                    c.trackingCode ?? "",
                    SOURCE[c.source ?? ""] ?? "Payment",
                    (c.grossTransactionAmount / 100).toFixed(2),
                    (c.netPayable / 100).toFixed(2),
                    STATUS[c.status]?.label ?? c.status,
                    c.billingPeriod ?? "",
                  ]),
                ])
              }
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        }
      >
        {commissions === undefined ? (
          <div className="p-5 sm:p-6">
            <LoadingBlocks rows={3} />
          </div>
        ) : commissions.length === 0 ? (
          <EmptyState icon={<Wallet />} title="No commissions yet" description="They appear here when patients you referred pay for their sessions." />
        ) : (
          <ul className="mt-2 divide-y divide-pt-line">
            {commissions.map((c) => (
              <li key={c._id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-pt-ink">{c.patientName || c.trackingCode || "Payment"}</span>
                  <span className="block truncate text-xs text-pt-muted">
                    {longDate(c.earnedAt)} · {SOURCE[c.source ?? ""] ?? (c.eventType === "refund_adjustment" ? "Refund" : "Payment")} of{" "}
                    {formatKobo(c.grossTransactionAmount)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className={cn("text-sm font-semibold tabular-nums", c.netPayable < 0 ? "text-pt-rose-fg" : "text-pt-ink")}>{formatKobo(c.netPayable)}</span>
                  <StatusBadge tone={STATUS[c.status]?.tone ?? "neutral"}>{STATUS[c.status]?.label ?? c.status}</StatusBadge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <StatementDrawer partnerCode={partnerCode} period={statementPeriod} onPeriod={setStatementPeriod} />
    </div>
  );
}

function StatementDrawer({ partnerCode, period, onPeriod }: { partnerCode: string; period: string | null; onPeriod: (p: string | null) => void }) {
  const statement = useQuery(api.monthlySettlements.generatePartnerInvoice, period ? { partnerCode, billingPeriod: period } : "skip") as
    | PartnerStatementData
    | undefined;
  return (
    <PhysioDrawer
      open={period !== null}
      onOpenChange={(open) => !open && onPeriod(null)}
      title="Monthly statement"
      description={
        <span className="mt-1 flex items-center gap-2">
          Month
          <input type="month" value={period ?? ""} onChange={(e) => e.target.value && onPeriod(e.target.value)} className={cn(selectClass, "h-9")} aria-label="Statement month" />
        </span>
      }
      className="sm:max-w-2xl"
      footer={
        statement ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className={secondaryButtonClass} onClick={() => exportStatementCsv(statement)}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button type="button" className={primaryButtonClass} onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print or save as PDF
            </Button>
          </div>
        ) : undefined
      }
    >
      {statement === undefined ? <LoadingBlocks rows={4} /> : <PartnerStatementBody statement={statement} />}
    </PhysioDrawer>
  );
}

function PayoutAccount({ partnerCode, className }: { partnerCode: string; className?: string }) {
  const accounts = useQuery(doctorRefs.bankAccounts, { partnerCode });
  const getBanks = useAction(doctorRefs.bankList);
  const verify = useAction(doctorRefs.verifyBank);
  const save = useAction(doctorRefs.saveBank);
  const remove = useMutation(doctorRefs.removeBank);

  const [open, setOpen] = useState(false);
  const [banks, setBanks] = useState<Array<{ name: string; code: string }>>([]);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [busy, setBusy] = useState<"verify" | "save" | null>(null);
  const [removing, setRemoving] = useState<BankAccount | null>(null);
  const bankName = useMemo(() => banks.find((b) => b.code === bankCode)?.name ?? "", [banks, bankCode]);

  const start = async () => {
    setOpen(true);
    setBankCode("");
    setAccountNumber("");
    setResolvedName(null);
    if (banks.length === 0) {
      try {
        setBanks(await getBanks({}));
      } catch {
        toast.error("Couldn't load the list of banks. Try again.");
      }
    }
  };

  const lookup = async (code: string, number: string) => {
    setResolvedName(null);
    if (!code || !/^\d{10}$/.test(number)) return;
    setBusy("verify");
    try {
      const result = await verify({ partnerCode, bankCode: code, accountNumber: number });
      if (result.success && result.accountName) setResolvedName(result.accountName);
      else toast.error(result.message);
    } catch (err) {
      toast.error(errorText(err, "We couldn't check that account."));
    } finally {
      setBusy(null);
    }
  };

  const confirmSave = async () => {
    setBusy("save");
    try {
      const result = await save({ partnerCode, bankCode, bankName, accountNumber });
      playSound("success");
      toast.success(`${result.accountName} will receive your payouts`);
      setOpen(false);
    } catch (err) {
      playSound("error");
      toast.error(errorText(err, "We couldn't save the account."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel
      title="Payout account"
      info="We check the account name with Paystack before saving it. Payouts go to your default account."
      className={className}
      bodyClassName="px-5 pb-5 pt-3 sm:px-6"
      actions={
        <Button type="button" variant="outline" className={secondaryButtonClass} onClick={start}>
          <Plus className="h-4 w-4" />
          Add account
        </Button>
      }
    >
      {accounts === undefined ? (
        <LoadingBlocks rows={1} />
      ) : accounts.length === 0 ? (
        <div className="flex items-start gap-3 rounded-2xl bg-pt-sunken p-4">
          <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-pt-muted" />
          <p className="text-sm text-pt-muted">Add a Nigerian bank account so we can pay your commission.</p>
        </div>
      ) : (
        <ul className="divide-y divide-pt-line">
          {accounts.map((a) => (
            <li key={a._id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pt-sunken text-pt-muted">
                <Landmark className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-pt-ink">{a.accountName}</span>
                <span className="block truncate text-xs text-pt-muted">
                  {a.bankName} · <span className="font-mono">{a.accountNumberMasked}</span>
                </span>
              </span>
              {a.isDefault && <StatusBadge tone="green">Default</StatusBadge>}
              <button
                type="button"
                onClick={() => setRemoving(a)}
                aria-label={`Remove ${a.bankName} account`}
                className="rounded-lg p-2 text-pt-muted transition hover:bg-pt-hover hover:text-pt-rose-fg"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <PhysioDrawer
        open={open}
        onOpenChange={(next) => busy !== "save" && setOpen(next)}
        title="Add payout account"
        description="We confirm the account name with Paystack before saving it."
        footer={
          <Button type="button" className={cn(primaryButtonClass, "h-11 w-full")} disabled={!resolvedName || busy !== null} onClick={confirmSave}>
            {busy === "save" ? "Saving…" : "Save account"}
          </Button>
        }
      >
        <div className="space-y-4">
          <div>
            <FieldLabel htmlFor="payout-bank">Bank</FieldLabel>
            <select
              id="payout-bank"
              value={bankCode}
              onChange={(e) => {
                setBankCode(e.target.value);
                void lookup(e.target.value, accountNumber);
              }}
              className={cn(selectClass, "h-11 w-full")}
            >
              <option value="">{banks.length ? "Choose your bank" : "Loading banks…"}</option>
              {banks.map((b) => (
                <option key={`${b.code}-${b.name}`} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="payout-number">Account number</FieldLabel>
            <input
              id="payout-number"
              inputMode="numeric"
              maxLength={10}
              value={accountNumber}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "").slice(0, 10);
                setAccountNumber(value);
                void lookup(bankCode, value);
              }}
              className={cn(inputClass, "font-mono")}
              placeholder="10 digits"
            />
          </div>
          <div className={cn("rounded-2xl p-3.5 text-sm", resolvedName ? "bg-pt-green-bg text-pt-green-fg" : "bg-pt-sunken text-pt-muted")}>
            {busy === "verify" ? "Checking with Paystack…" : resolvedName ? <>Account name: <strong>{resolvedName}</strong></> : "Choose your bank and enter the account number."}
          </div>
        </div>
      </PhysioDrawer>

      <PhysioDrawer
        open={removing !== null}
        onOpenChange={(next) => !next && setRemoving(null)}
        title="Remove this account?"
        description={removing ? `${removing.bankName} · ${removing.accountNumberMasked}` : undefined}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className={secondaryButtonClass} onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-pt-rose-bg text-pt-rose-fg shadow-none hover:brightness-95"
              onClick={async () => {
                if (!removing) return;
                try {
                  await remove({ partnerCode, accountId: removing._id });
                  toast.success("Account removed");
                  setRemoving(null);
                } catch (err) {
                  playSound("error");
                  toast.error(errorText(err, "We couldn't remove the account."));
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </Button>
          </div>
        }
      >
        <p className="text-sm text-pt-muted">Payouts won&apos;t go to this account any more. Add another one so we can keep paying you.</p>
      </PhysioDrawer>
    </Panel>
  );
}
