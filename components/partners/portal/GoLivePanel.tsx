"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { CheckCircle2, Circle, Clock, Rocket, ShieldAlert, XCircle } from "@/components/icons";
import { Busy, LoadingBlock, PARTNER_SUPPORT_EMAIL, btnPrimary, cardCls, errorMessage, fmtDateTime, inputCls, labelCls, type PortalContext } from "./shared";

type Checklist = {
  productionStatus: "not_requested" | "requested" | "approved" | "rejected" | "suspended";
  productionRequestedAt: number | null;
  productionRejectionReason: string | null;
  canRequest: boolean;
  items: Array<{ key: string; label: string; done: boolean; required: boolean }>;
};

export function GoLivePanel({ ctx }: { ctx: PortalContext }) {
  const checklist = useQuery(api.partners.getGoLiveChecklist, { partnerCode: ctx.partnerCode }) as Checklist | undefined;
  const request = useMutation(api.partners.requestProductionAccess);
  const [note, setNote] = useState("");
  const [volume, setVolume] = useState("");
  const [busy, setBusy] = useState(false);

  if (!checklist) return <LoadingBlock />;
  const status = checklist.productionStatus;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await request({
        partnerCode: ctx.partnerCode,
        note: note.trim() || undefined,
        expectedMonthlyReferrals: Number(volume) > 0 ? Number(volume) : undefined,
      });
      toast.success("Request sent — the Rehabify partnerships team will review it");
    } catch (err) {
      toast.error(errorMessage(err, "Could not send the request"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className={`${cardCls} p-6 lg:col-span-2 space-y-5`}>
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-2xl bg-[#FAF6E7] text-rh-ink shrink-0">
            <Rocket className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Go live</h3>
            <p className="text-xs text-[#52706e] leading-relaxed mt-0.5">
              Build and test in sandbox, then request production access. After Rehabify approves it you can create live (sk_live_) keys, a live webhook
              endpoint and live referral links. Real patients are contacted only for live referrals.
            </p>
          </div>
        </div>

        {status === "approved" && (
          <StatusCard tone="green" icon={<CheckCircle2 className="w-5 h-5" />} title="Production access approved">
            Switch to <strong>Live</strong> in the header to create live keys and your live webhook endpoint.
          </StatusCard>
        )}
        {status === "requested" && (
          <StatusCard tone="amber" icon={<Clock className="w-5 h-5" />} title="Request under review">
            Submitted {fmtDateTime(checklist.productionRequestedAt)}. We&apos;ll email you when it&apos;s reviewed — usually within 2 business days.
          </StatusCard>
        )}
        {status === "rejected" && (
          <StatusCard tone="red" icon={<XCircle className="w-5 h-5" />} title="Changes needed before go-live">
            {checklist.productionRejectionReason || "Your last request was not approved."} You can address this and request again below.
          </StatusCard>
        )}
        {status === "suspended" && (
          <StatusCard tone="red" icon={<ShieldAlert className="w-5 h-5" />} title="Production access suspended">
            {checklist.productionRejectionReason ? `${checklist.productionRejectionReason}. ` : ""}Live keys are disabled. Contact{" "}
            <a className="underline font-semibold" href={`mailto:${PARTNER_SUPPORT_EMAIL}`}>
              {PARTNER_SUPPORT_EMAIL}
            </a>
            .
          </StatusCard>
        )}

        {(status === "not_requested" || status === "rejected") && (
          <form onSubmit={submit} className="space-y-4 pt-2 border-t border-rh-ink/10">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Expected referrals per month</label>
                <input type="number" min={1} value={volume} onChange={(e) => setVolume(e.target.value)} className={inputCls} placeholder="e.g. 50" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Anything we should know (optional)</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1500} className={inputCls} placeholder="Integration approach, launch date, contract reference…" />
            </div>
            <button type="submit" className={btnPrimary} disabled={!checklist.canRequest || busy}>
              <Busy busy={busy} label="Request production access" busyLabel="Sending…" icon={<Rocket className="w-3.5 h-3.5" />} />
            </button>
            {!checklist.canRequest && <p className="text-[11px] text-[#52706e]">Complete the required checklist items first.</p>}
          </form>
        )}
      </div>

      <div className={`${cardCls} p-6 space-y-3`}>
        <h4 className="text-sm font-semibold">Checklist</h4>
        <ul className="space-y-2.5">
          {checklist.items.map((item) => (
            <li key={item.key} className="flex items-start gap-2 text-xs">
              {item.done ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <Circle className="w-4 h-4 text-[#52706e]/50 shrink-0" />}
              <span className={item.done ? "text-rh-ink" : "text-[#52706e]"}>
                {item.label}
                {!item.required && <span className="text-[10px] text-[#52706e]"> (recommended)</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function StatusCard({ tone, icon, title, children }: { tone: "green" | "amber" | "red"; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  const tones = {
    green: "bg-emerald-50 border-emerald-200 text-emerald-900",
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    red: "bg-red-50 border-red-200 text-red-900",
  };
  return (
    <div className={`p-4 rounded-2xl border flex items-start gap-3 ${tones[tone]}`}>
      <span className="shrink-0">{icon}</span>
      <div className="text-xs leading-relaxed">
        <p className="font-semibold text-sm mb-0.5">{title}</p>
        {children}
      </div>
    </div>
  );
}
