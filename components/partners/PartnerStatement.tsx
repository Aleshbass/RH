"use client";

import type { FunctionReturnType } from "convex/server";
import { AlertCircle, CheckCircle2, Clock, ShieldCheck } from "@/components/icons";
import type { api } from "@/convex/_generated/api";

export type PartnerStatementData = FunctionReturnType<typeof api.monthlySettlements.generatePartnerInvoice>;

/** One commission line of a settlement statement (convex/monthlySettlements.generatePartnerInvoice). */
export type StatementLine = {
  sn: number;
  date: string;
  trackingCode: string;
  eventType: string;
  patientName: string;
  physiotherapistName: string;
  careMode: string;
  grossAmountKobo: number;
  partnerShareKobo: number;
  partnerPercent: number;
  withholdingTaxKobo: number;
  netPartnerAmountKobo: number;
  paymentMethod: string;
  paymentReference: string;
  payoutStatus: string;
};

function naira(kobo: number) {
  const sign = kobo < 0 ? "-" : "";
  return `${sign}₦${(Math.abs(kobo) / 100).toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function eventLabel(eventType: string) {
  if (eventType === "payment") return "Payment";
  if (eventType === "refund_adjustment") return "Refund adjustment";
  return eventType.replace(/_/g, " ");
}

/** CSV export of a settlement statement (one row per commission line). */
export function exportStatementCsv(statement: PartnerStatementData) {
  const headers = [
    "S/N",
    "Date",
    "Tracking code",
    "Type",
    "Patient",
    "Physiotherapist",
    "Care mode",
    "Gross paid (NGN)",
    "Commission rate (%)",
    "Commission (NGN)",
    "Withholding tax (NGN)",
    "Net commission (NGN)",
    "Payment channel",
    "Payment reference",
    "Payout status",
  ];
  const rows = (statement.lineItems as StatementLine[]).map((l: StatementLine) => [
    l.sn,
    l.date,
    l.trackingCode,
    eventLabel(l.eventType),
    l.patientName,
    l.physiotherapistName,
    l.careMode,
    (l.grossAmountKobo / 100).toFixed(2),
    l.partnerPercent,
    (l.partnerShareKobo / 100).toFixed(2),
    (l.withholdingTaxKobo / 100).toFixed(2),
    (l.netPartnerAmountKobo / 100).toFixed(2),
    l.paymentMethod,
    l.paymentReference,
    l.payoutStatus,
  ]);
  const escape = (cell: string | number) => {
    const text = String(cell ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${statement.invoiceNumber}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Settlement statement body (portal and admin). Amounts come straight from the
 * server: each line's commission rate is the partner's contract rate, not a fixed split.
 */
export function PartnerStatementBody({ statement }: { statement: PartnerStatementData }) {
  const s = statement.summary;
  return (
    <div id="printable-partner-invoice" className="space-y-6 text-gray-900 bg-white">
      <div className="p-5 bg-[#FAF6E7]/40 rounded-2xl border border-amber-200/60 flex flex-col sm:flex-row justify-between gap-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#005b57] text-white flex items-center justify-center font-bold text-sm">RH</div>
            <div>
              <h2 className="text-base font-bold text-[#002e2c]">{statement.issuer.name}</h2>
              <p className="text-xs text-gray-500">{statement.issuer.address}</p>
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-600 space-y-0.5">
            <p>
              Email: <span className="font-medium text-gray-900">{statement.issuer.email}</span>
            </p>
            <p>
              Web: <span className="font-medium text-gray-900">{statement.issuer.website}</span>
            </p>
          </div>
        </div>
        <div className="sm:text-right text-xs space-y-1">
          <span className="inline-block px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-900 font-bold text-[10px] uppercase tracking-wider">
            Commission statement
          </span>
          <p className="text-sm font-bold font-mono text-[#002e2c] pt-1 break-all">{statement.invoiceNumber}</p>
          <p className="text-gray-600">
            Date: <strong>{statement.invoiceDate}</strong>
          </p>
          <p className="text-gray-600">
            Billing period: <strong>{statement.billingPeriodLabel}</strong>
          </p>
          <div className="pt-1">
            {statement.payoutStatus === "paid" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Paid
              </span>
            ) : statement.payoutStatus === "no_earnings" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-gray-700">No earnings this period</span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                <Clock className="w-3.5 h-3.5 text-amber-600" /> Not yet paid
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl border border-gray-200 bg-white space-y-1.5 text-xs">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Partner organisation</span>
          <h4 className="text-sm font-bold text-gray-900">{statement.recipient.name}</h4>
          <p className="text-gray-600">
            Partner code: <span className="font-mono font-semibold text-teal-800">{statement.recipient.code}</span>
          </p>
          <p className="text-gray-600">
            Type: <span className="capitalize">{statement.recipient.type.replace(/_/g, " ")}</span>
          </p>
          {statement.recipient.contactEmail && <p className="text-gray-600">Email: {statement.recipient.contactEmail}</p>}
        </div>
        <div className="p-4 rounded-2xl border border-gray-200 bg-white space-y-1.5 text-xs">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Payout bank account</span>
          {statement.bankDetails ? (
            <div className="space-y-1">
              <p className="text-gray-700">
                Bank: <strong className="text-gray-900">{statement.bankDetails.bankName}</strong>
              </p>
              <p className="text-gray-700">
                Account: <strong className="font-mono text-gray-900">{statement.bankDetails.accountNumber}</strong>
              </p>
              <p className="text-gray-700">
                Name: <strong className="text-gray-900">{statement.bankDetails.accountName}</strong>
              </p>
            </div>
          ) : (
            <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>No payout bank account on file.</span>
            </div>
          )}
        </div>
      </div>

      <div className="border border-gray-200 rounded-2xl overflow-hidden">
        <div className="p-3 bg-gray-50 border-b border-gray-200 font-bold text-xs text-gray-800">Commission lines ({statement.lineItems.length})</div>
        {statement.lineItems.length === 0 ? (
          <p className="p-6 text-center text-xs text-gray-500">No live commissions were earned in this billing period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Tracking code</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Patient</th>
                  <th className="py-2.5 px-3">Care mode</th>
                  <th className="py-2.5 px-3 text-right">Gross paid</th>
                  <th className="py-2.5 px-3 text-right">Rate</th>
                  <th className="py-2.5 px-3 text-right">Commission</th>
                  <th className="py-2.5 px-3 text-right">WHT</th>
                  <th className="py-2.5 px-3 text-right">Net</th>
                  <th className="py-2.5 px-3">Channel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(statement.lineItems as StatementLine[]).map((item: StatementLine) => (
                  <tr key={item.sn}>
                    <td className="py-2 px-3 text-gray-400 font-mono text-[11px]">{item.sn}</td>
                    <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{item.date}</td>
                    <td className="py-2 px-3 font-mono text-gray-700">{item.trackingCode}</td>
                    <td className="py-2 px-3 text-gray-700">{eventLabel(item.eventType)}</td>
                    <td className="py-2 px-3 font-medium text-gray-900">{item.patientName}</td>
                    <td className="py-2 px-3 text-gray-700">{item.careMode}</td>
                    <td className="py-2 px-3 text-right text-gray-900">{naira(item.grossAmountKobo)}</td>
                    <td className="py-2 px-3 text-right text-gray-700">{item.partnerPercent}%</td>
                    <td className="py-2 px-3 text-right text-gray-900">{naira(item.partnerShareKobo)}</td>
                    <td className="py-2 px-3 text-right text-gray-600">{naira(item.withholdingTaxKobo)}</td>
                    <td className="py-2 px-3 text-right font-bold text-teal-900">{naira(item.netPartnerAmountKobo)}</td>
                    <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{item.paymentMethod}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start gap-6">
        <div className="w-full sm:max-w-md p-4 bg-amber-50/60 rounded-2xl border border-amber-200 text-xs space-y-1.5">
          <span className="font-bold text-amber-950 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-amber-700" />
            Transfer fees and stamp duty
          </span>
          <p className="text-amber-900 text-[11px] leading-relaxed">
            Fees below are estimates for a single transfer of this period&apos;s net commission. Electronic transfers of ₦10,000 and above attract the
            statutory ₦50 Electronic Money Transfer Levy. The amount actually paid is shown on the payout.
          </p>
        </div>
        <div className="w-full sm:w-80 bg-gray-50 rounded-2xl p-4 border border-gray-200 space-y-2 text-xs">
          <Row label="Paid sessions" value={String(s.totalSessions)} />
          <Row label="Gross paid by patients" value={naira(s.totalGrossKobo)} />
          <Row label="Commission" value={naira(s.totalPartnerShareKobo)} strong />
          <Row label="Less: withholding tax" value={`- ${naira(s.totalWithholdingTaxKobo)}`} />
          <Row label="Less: transfer fee (est.)" value={`- ${naira(s.totalPaystackTransferFeesKobo)}`} />
          <Row label="Less: stamp duty (est.)" value={`- ${naira(s.totalStampDutyKobo)}`} />
          <div className="border-t-2 border-[#005b57] pt-2 flex justify-between items-center text-sm font-bold text-[#005b57]">
            <span>Net payable</span>
            <span className="text-base">{naira(s.totalNetPayableKobo)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-bold text-teal-900 border-t border-gray-200 pt-2" : "text-gray-600"}`}>
      <span>{label}</span>
      <span className={strong ? "" : "font-medium text-gray-900"}>{value}</span>
    </div>
  );
}
