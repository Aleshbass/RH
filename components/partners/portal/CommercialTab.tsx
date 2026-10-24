"use client";

import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { Clock, Download, Landmark, Plus, Printer, Receipt, Trash2, Wallet } from "@/components/icons";
import { PartnerStatementBody, exportStatementCsv, type PartnerStatementData } from "../PartnerStatement";
import {
  Busy,
  COMMISSION_STATUS_LABELS,
  commissionSourceLabel,
  DASH,
  EmptyState,
  KpiCard,
  LoadingBlock,
  Modal,
  Pill,
  btnLink,
  btnPrimary,
  btnSecondary,
  cardCls,
  downloadCsv,
  errorMessage,
  fmtDate,
  formatKobo,
  formatNumber,
  inputCls,
  labelCls,
  selectCls,
  tdCls,
  thCls,
  useConfirm,
  type PortalContext,
} from "./shared";

type Summary = {
  totalEarnedKobo: number;
  availablePayoutKobo: number;
  inPayoutKobo: number;
  paidOutKobo: number;
  reversedKobo: number;
  pendingApprovalKobo?: number;
  performance: { liveReferrals: number; paidPatients: number };
};

type CommissionRow = {
  _id: string;
  trackingCode: string | null;
  eventType: string;
  grossTransactionAmount: number;
  commissionRate: number;
  commissionAmount: number;
  netPayable: number;
  careMode: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  source: string | null;
  billingPeriod: string | null;
  status: "pending" | "approved" | "paid" | "reversed" | "cancelled";
  earnedAt: number;
  paidAt: number | null;
};

const STATUS_TONE: Record<CommissionRow["status"], "amber" | "teal" | "green" | "red" | "gray"> = {
  pending: "amber",
  approved: "teal",
  paid: "green",
  reversed: "red",
  cancelled: "gray",
};

function currentPeriod() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function CommercialTab({ ctx }: { ctx: PortalContext }) {
  const summary = useQuery(api.commercialTerms.getPartnerCommercialSummary, { partnerId: ctx.partnerCode }) as Summary | undefined;
  const contract = useQuery(api.commercialTerms.getActivePartnerContract, { partnerId: ctx.partnerCode }) as any;
  const [status, setStatus] = useState("all");
  const [period, setPeriod] = useState("");
  const commissions = useQuery(api.commercialTerms.listPartnerCommissions, {
    partnerId: ctx.partnerCode,
    status,
    billingPeriod: period || undefined,
    limit: 500,
  }) as CommissionRow[] | undefined;
  const [statementPeriod, setStatementPeriod] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      {ctx.environment === "sandbox" && (
        <div className="p-4 rounded-2xl bg-white border border-rh-ink/15 text-xs text-[#52706e]">
          Commissions are earned only on live, verified payments. Sandbox activity never earns — the figures below are your live earnings.
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="Total earned" value={summary ? formatKobo(summary.totalEarnedKobo) : DASH} hint="Net of withholding tax" icon={<Wallet className="w-4 h-4" />} />
        <KpiCard label="Available for payout" value={summary ? formatKobo(summary.availablePayoutKobo) : DASH} hint="Paid out monthly" tone="green" />
        <KpiCard label="In payout" value={summary ? formatKobo(summary.inPayoutKobo) : DASH} hint="Transfer awaiting bank confirmation" tone="amber" />
        <KpiCard label="Paid out" value={summary ? formatKobo(summary.paidOutKobo) : DASH} hint={summary && summary.reversedKobo ? `${formatKobo(summary.reversedKobo)} reversed (refunds)` : "To your verified account"} />
      </div>

      {summary && (summary.pendingApprovalKobo ?? 0) > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
          <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-950 leading-relaxed">
            <p className="font-semibold">{formatKobo(summary.pendingApprovalKobo)} awaiting approval</p>
            <p className="text-amber-900/80">
              Some {ctx.isDoctor ? "of your patients" : "patients"} paid a clinic directly (cash, POS or transfer) and the clinic recorded it. Rehabify checks
              these payments first; once approved they count towards your next payout. Filter the ledger by &quot;Awaiting approval&quot; to see them.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${cardCls} p-5 space-y-3`}>
          <h3 className="text-sm font-semibold">Commercial terms</h3>
          {contract === undefined ? (
            <LoadingBlock />
          ) : (
            <dl className="text-xs space-y-2">
              <Row label="Agreement" value={contract.isDefault ? "Platform standard terms" : contract.contractNumber} />
              <Row label="Model" value={contract.modelType?.replace(/_/g, " ") ?? DASH} />
              <Row label="Revenue share" value={contract.revenueSharePercent != null ? `${contract.revenueSharePercent}% of each verified payment` : DASH} />
              {contract.baseFeePerBooking ? <Row label="Fee per new patient" value={formatKobo(contract.baseFeePerBooking)} /> : null}
              {contract.activationBonusPerPatient ? <Row label="Activation bonus" value={formatKobo(contract.activationBonusPerPatient)} /> : null}
              <Row label="Withholding tax" value={`${contract.withholdingTaxPercent ?? 0}%`} />
              <Row label="Payment terms" value={`Net-${contract.paymentTermsDays ?? 30}, monthly`} />
              {summary && <Row label="Paid patients" value={formatNumber(summary.performance.paidPatients)} />}
            </dl>
          )}
          <p className="text-[11px] text-[#52706e] leading-relaxed">
            Commissions are earned on paid bookings and clinic invoices by patients attributed to you. Refunds reverse the commission (or are deducted from the next
            payout if already paid).
          </p>
        </div>
        <BankAccounts ctx={ctx} />
      </div>

      <div className={`${cardCls} overflow-hidden`}>
        <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-rh-ink/10">
          <div>
            <h3 className="text-sm font-semibold">Commission ledger</h3>
            <p className="text-[11px] text-[#52706e]">One line per payment by a patient attributed to you (refund adjustments show as negative lines).</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls} aria-label="Status">
              <option value="all">All statuses</option>
              <option value="approved">Approved (awaiting payout)</option>
              <option value="paid">Paid</option>
              <option value="reversed">Reversed</option>
              <option value="pending">Awaiting approval</option>
            </select>
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={selectCls} aria-label="Billing period" />
            <button
              type="button"
              className={btnSecondary}
              disabled={!commissions || commissions.length === 0}
              onClick={() =>
                downloadCsv(
                  `rehabify-commissions-${ctx.partnerCode}${period ? `-${period}` : ""}.csv`,
                  ["Earned", "Tracking code", "Source", "Gross (NGN)", "Commission (NGN)", "Net payable (NGN)", "Status", "Billing period", "Payment reference", "Paid"],
                  (commissions ?? []).map((c) => [
                    fmtDate(c.earnedAt),
                    c.trackingCode,
                    commissionSourceLabel(c.source, c.eventType),
                    (c.grossTransactionAmount / 100).toFixed(2),
                    (c.commissionAmount / 100).toFixed(2),
                    (c.netPayable / 100).toFixed(2),
                    c.status,
                    c.billingPeriod,
                    c.paymentReference,
                    c.paidAt ? fmtDate(c.paidAt) : "",
                  ])
                )
              }
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button type="button" className={btnPrimary} onClick={() => setStatementPeriod(period || currentPeriod())}>
              <Receipt className="w-3.5 h-3.5" /> Statement
            </button>
          </div>
        </div>
        {commissions === undefined ? (
          <LoadingBlock />
        ) : commissions.length === 0 ? (
          <EmptyState icon={<Wallet className="w-8 h-8" />} title="No commissions yet" body="Commissions appear when patients you referred pay for care." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[#52706e] bg-[#FAF6E7]/60">
                <tr>
                  <th className={thCls}>Earned</th>
                  <th className={thCls}>Tracking code</th>
                  <th className={thCls}>Source</th>
                  <th className={`${thCls} text-right`}>Gross</th>
                  <th className={`${thCls} text-right`}>Commission</th>
                  <th className={`${thCls} text-right`}>Net payable</th>
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Period</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rh-ink/5">
                {commissions.map((c) => (
                  <tr key={c._id}>
                    <td className={`${tdCls} whitespace-nowrap`}>{fmtDate(c.earnedAt)}</td>
                    <td className={`${tdCls} font-mono`}>{c.trackingCode ?? DASH}</td>
                    <td className={tdCls}>{commissionSourceLabel(c.source, c.eventType)}</td>
                    <td className={`${tdCls} text-right`}>{formatKobo(c.grossTransactionAmount)}</td>
                    <td className={`${tdCls} text-right`}>{formatKobo(c.commissionAmount)}</td>
                    <td className={`${tdCls} text-right font-semibold`}>{formatKobo(c.netPayable)}</td>
                    <td className={tdCls}>
                      <Pill tone={STATUS_TONE[c.status]}>{COMMISSION_STATUS_LABELS[c.status] ?? c.status}</Pill>
                    </td>
                    <td className={tdCls}>{c.billingPeriod ?? DASH}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <StatementModal ctx={ctx} period={statementPeriod} onClose={() => setStatementPeriod(null)} onPeriod={setStatementPeriod} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-[#52706e]">{label}</dt>
      <dd className="font-semibold text-right">{value}</dd>
    </div>
  );
}

function StatementModal({ ctx, period, onClose, onPeriod }: { ctx: PortalContext; period: string | null; onClose: () => void; onPeriod: (p: string) => void }) {
  const statement = useQuery(api.monthlySettlements.generatePartnerInvoice, period ? { partnerCode: ctx.partnerCode, billingPeriod: period } : "skip") as
    | PartnerStatementData
    | undefined;
  return (
    <Modal
      open={period !== null}
      onClose={onClose}
      size="xl"
      title="Settlement statement"
      description={
        <span className="flex items-center gap-2">
          Billing period
          <input type="month" value={period ?? ""} onChange={(e) => e.target.value && onPeriod(e.target.value)} className={selectCls} aria-label="Statement period" />
        </span>
      }
      footer={
        statement ? (
          <>
            <button type="button" className={btnSecondary} onClick={() => exportStatementCsv(statement)}>
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button type="button" className={btnPrimary} onClick={() => window.print()}>
              <Printer className="w-3.5 h-3.5" /> Print / PDF
            </button>
          </>
        ) : undefined
      }
    >
      {statement === undefined ? <LoadingBlock /> : <PartnerStatementBody statement={statement} />}
    </Modal>
  );
}

// ─── Bank accounts ───────────────────────────────────────────────────────────

type BankAccount = {
  _id: Id<"partnerBankAccounts">;
  bankName: string;
  accountNumberMasked: string;
  accountName: string;
  isVerified: boolean;
  isDefault: boolean;
};

function BankAccounts({ ctx }: { ctx: PortalContext }) {
  const accounts = useQuery(api.partnerBankAccounts.getPartnerBankAccounts, { partnerCode: ctx.partnerCode }) as BankAccount[] | undefined;
  const getBanks = useAction(api.partnerBankAccounts.getPartnerBankList);
  const verify = useAction(api.partnerBankAccounts.verifyPartnerBankAccount);
  const save = useAction(api.partnerBankAccounts.savePartnerBankAccount);
  const remove = useMutation(api.partnerBankAccounts.deletePartnerBankAccount);
  const { confirm, element: confirmElement } = useConfirm();

  const [open, setOpen] = useState(false);
  const [banks, setBanks] = useState<Array<{ name: string; code: string }>>([]);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const bankName = useMemo(() => banks.find((b) => b.code === bankCode)?.name ?? "", [banks, bankCode]);

  const openModal = async () => {
    setOpen(true);
    setResolvedName(null);
    setAccountNumber("");
    setBankCode("");
    if (banks.length === 0) {
      try {
        setBanks((await getBanks({})) as Array<{ name: string; code: string }>);
      } catch {
        toast.error("Could not load the bank list");
      }
    }
  };

  const lookup = async (code: string, number: string) => {
    setResolvedName(null);
    if (!code || !/^\d{10}$/.test(number)) return;
    setBusy("verify");
    try {
      const result = (await verify({ partnerCode: ctx.partnerCode, bankCode: code, accountNumber: number })) as { success: boolean; accountName?: string; message: string };
      if (result.success && result.accountName) setResolvedName(result.accountName);
      else toast.error(result.message);
    } catch (err) {
      toast.error(errorMessage(err, "Could not verify the account"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`${cardCls} p-5 lg:col-span-2 space-y-4`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Payout account</h3>
          <p className="text-[11px] text-[#52706e]">Verified with Paystack. Payouts go to the default account.</p>
        </div>
        <button type="button" className={btnSecondary} onClick={openModal}>
          <Plus className="w-3.5 h-3.5" /> Add account
        </button>
      </div>
      {accounts === undefined ? (
        <LoadingBlock />
      ) : accounts.length === 0 ? (
        <EmptyState icon={<Landmark className="w-8 h-8" />} title="No payout account yet" body="Add a Nigerian bank account to receive commission payouts." />
      ) : (
        <ul className="divide-y divide-rh-ink/5">
          {accounts.map((a) => (
            <li key={a._id} className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{a.accountName}</div>
                <div className="text-xs text-[#52706e]">
                  {a.bankName} · <span className="font-mono">{a.accountNumberMasked}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {a.isDefault && <Pill tone="green">Default</Pill>}
                {a.isVerified && <Pill tone="teal">Verified</Pill>}
                <button
                  type="button"
                  className={`${btnLink} text-red-700`}
                  aria-label="Remove account"
                  onClick={async () => {
                    if (!(await confirm({ title: "Remove this payout account?", confirmLabel: "Remove", tone: "danger" }))) return;
                    try {
                      await remove({ partnerCode: ctx.partnerCode, accountId: a._id });
                      toast.success("Account removed");
                    } catch (err) {
                      toast.error(errorMessage(err, "Could not remove the account"));
                    }
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add payout account"
        description="We confirm the account holder's name with Paystack before saving it."
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={!resolvedName || busy === "save"}
              onClick={async () => {
                setBusy("save");
                try {
                  const result = (await save({ partnerCode: ctx.partnerCode, bankCode, bankName, accountNumber })) as { accountName: string };
                  toast.success(`Saved ${result.accountName} as your payout account`);
                  setOpen(false);
                } catch (err) {
                  toast.error(errorMessage(err, "Could not save the account"));
                } finally {
                  setBusy(null);
                }
              }}
            >
              <Busy busy={busy === "save"} label="Save account" busyLabel="Saving…" />
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Bank</label>
            <select
              value={bankCode}
              onChange={(e) => {
                setBankCode(e.target.value);
                void lookup(e.target.value, accountNumber);
              }}
              className={`${selectCls} w-full`}
            >
              <option value="">{banks.length ? "Select a bank" : "Loading banks…"}</option>
              {banks.map((b) => (
                <option key={`${b.code}-${b.name}`} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Account number (10 digits)</label>
            <input
              inputMode="numeric"
              maxLength={10}
              value={accountNumber}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "").slice(0, 10);
                setAccountNumber(value);
                void lookup(bankCode, value);
              }}
              className={`${inputCls} font-mono`}
            />
          </div>
          <div className="p-3 rounded-xl bg-[#FAF6E7] border border-rh-ink/10 text-xs">
            {busy === "verify" ? "Verifying with Paystack…" : resolvedName ? <span>Account name: <strong>{resolvedName}</strong></span> : "Enter the bank and account number to verify."}
          </div>
        </div>
      </Modal>
      {confirmElement}
    </div>
  );
}
