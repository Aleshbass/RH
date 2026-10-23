"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { FlaskConical, Plus, Search, UserPlus, Users, WhatsApp } from "@/components/icons";
import { ReferPatientModal } from "./ReferPatientForm";
import {
  Busy,
  CopyButton,
  referralSourceLabel,
  DASH,
  Drawer,
  EmptyState,
  LoadingBlock,
  MAGIC_PHONES,
  Modal,
  PUBLIC_STATUSES,
  Pill,
  SANDBOX_STEPS,
  STATUS_META,
  StatusBadge,
  btnPrimary,
  btnSecondary,
  cardCls,
  errorMessage,
  fmtDate,
  fmtDateTime,
  humanize,
  inputCls,
  labelCls,
  selectCls,
  tdCls,
  thCls,
  type PortalContext,
  type SandboxStep,
} from "./shared";

type Row = {
  referralId: string;
  trackingCode: string;
  partnerExternalId: string | null;
  patientName: string;
  phone: string;
  city: string | null;
  condition: string | null;
  status: string;
  source: string;
  createdAt: number;
};

export function ReferralsTab({ ctx }: { ctx: PortalContext }) {
  const [status, setStatus] = useState<string>("all");
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [referOpen, setReferOpen] = useState(false);
  // Real referrals typed in here: doctors always; organisations once they're live
  const canReferLive = ctx.environment === "live" && ctx.info.productionStatus === "approved";

  const paged = usePaginatedQuery(
    api.partners.listPartnerReferrals,
    query ? "skip" : { partnerCode: ctx.partnerCode, environment: ctx.environment, status },
    { initialNumItems: 25 }
  );
  const searchResults = useQuery(
    api.partners.searchPartnerReferrals,
    query ? { partnerCode: ctx.partnerCode, environment: ctx.environment, term: query } : "skip"
  ) as Row[] | undefined;

  const rows: Row[] | undefined = query ? searchResults : (paged.results as Row[]);
  const loading = query ? searchResults === undefined : paged.status === "LoadingFirstPage";

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-4 flex flex-col lg:flex-row lg:items-center gap-3 justify-between`}>
        <form
          className="flex items-center gap-2 flex-1 min-w-0"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(term.trim().length >= 2 ? term.trim() : "");
          }}
        >
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-[#52706e] absolute left-3 top-3" />
            <input
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
                if (!e.target.value.trim()) setQuery("");
              }}
              placeholder={ctx.isDoctor ? "Search tracking code, patient name or phone" : "Search tracking code, your reference, patient name or phone"}
              className={`${inputCls} pl-9`}
              aria-label="Search referrals"
            />
          </div>
          <button type="submit" className={btnSecondary}>
            Search
          </button>
        </form>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls} disabled={Boolean(query)} aria-label="Filter by status">
            <option value="all">All statuses</option>
            {PUBLIC_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s]?.label ?? s}
              </option>
            ))}
          </select>
          {canReferLive && (
            <button type="button" className={ctx.isDoctor ? btnPrimary : btnSecondary} onClick={() => setReferOpen(true)}>
              <UserPlus className="w-3.5 h-3.5" />
              {ctx.isDoctor ? "Refer a patient" : "Add a referral"}
            </button>
          )}
          {ctx.environment === "sandbox" && (
            <button type="button" className={btnPrimary} onClick={() => setCreateOpen(true)}>
              <Plus className="w-3.5 h-3.5" />
              Create test referral
            </button>
          )}
        </div>
      </div>

      <div className={`${cardCls} overflow-hidden`}>
        {loading ? (
          <LoadingBlock />
        ) : !rows || rows.length === 0 ? (
          <EmptyState
            icon={<Users className="w-8 h-8" />}
            title={query ? "No matching referrals" : "No referrals yet"}
            body={
              query
                ? "Try the full tracking code (RHB-…), your own reference, or part of the patient's name."
                : ctx.environment === "sandbox"
                  ? "Create a test referral here or with POST /v1/partners/referrals and a sandbox key."
                  : ctx.isDoctor
                    ? "Patients you refer, or who use your referral link, appear here with where their care is up to."
                    : "Referrals you send through the API or your referral links appear here."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[#52706e] bg-[#FAF6E7]/60">
                <tr>
                  <th className={thCls}>Tracking code</th>
                  {!ctx.isDoctor && <th className={thCls}>Your reference</th>}
                  <th className={thCls}>Patient</th>
                  <th className={thCls}>Condition</th>
                  <th className={thCls}>Source</th>
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#002e2c]/5">
                {rows.map((r) => (
                  <tr key={r.referralId} className="hover:bg-[#FAF6E7]/40 cursor-pointer" onClick={() => setDetailId(r.referralId)}>
                    <td className={`${tdCls} font-mono font-semibold text-[#005b57]`}>{r.trackingCode || DASH}</td>
                    {!ctx.isDoctor && <td className={`${tdCls} font-mono`}>{r.partnerExternalId || DASH}</td>}
                    <td className={tdCls}>
                      <div className="font-medium">{r.patientName || DASH}</div>
                      <div className="text-[#52706e]">{r.phone || DASH}</div>
                    </td>
                    <td className={`${tdCls} max-w-[180px] truncate`}>{r.condition || DASH}</td>
                    <td className={tdCls}>
                      <Pill tone={r.source === "partner_link" ? "purple" : r.source === "api" ? "blue" : "gray"}>{referralSourceLabel(r.source, ctx.isDoctor)}</Pill>
                    </td>
                    <td className={tdCls}>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className={`${tdCls} whitespace-nowrap`}>{fmtDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!query && paged.status === "CanLoadMore" && (
          <div className="p-4 border-t border-[#002e2c]/10 flex justify-center">
            <button type="button" className={btnSecondary} onClick={() => paged.loadMore(25)}>
              Load more
            </button>
          </div>
        )}
        {!query && paged.status === "LoadingMore" && <LoadingBlock label="Loading more…" />}
      </div>

      <ReferralDetailDrawer ctx={ctx} referralId={detailId} onClose={() => setDetailId(null)} />
      {ctx.environment === "sandbox" && <CreateTestReferralModal ctx={ctx} open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id) => setDetailId(id)} />}
      {canReferLive && <ReferPatientModal ctx={ctx} open={referOpen} onClose={() => setReferOpen(false)} />}
    </div>
  );
}

function CreateTestReferralModal({
  ctx,
  open,
  onClose,
  onCreated,
}: {
  ctx: PortalContext;
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const create = useMutation(api.partners.createSandboxReferral);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    firstName: "Test",
    lastName: "Patient",
    phone: "+2348000000003",
    partnerReference: "",
    condition: "Lower back pain",
    recommendedSessions: "4",
    preferredMode: "patient_choice",
  });
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const referral = (await create({
        partnerCode: ctx.partnerCode,
        firstName: form.firstName,
        lastName: form.lastName || undefined,
        phone: form.phone,
        partnerReference: form.partnerReference.trim() || undefined,
        condition: form.condition || undefined,
        recommendedSessions: Number(form.recommendedSessions) || undefined,
        preferredMode: form.preferredMode,
      })) as { id: string; tracking_code: string };
      toast.success(`Sandbox referral ${referral.tracking_code} created`);
      onClose();
      onCreated(referral.id);
    } catch (err) {
      toast.error(errorMessage(err, "Could not create the test referral"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a sandbox referral"
      description="Behaves exactly like POST /v1/partners/referrals with a sandbox key: fires webhooks to your sandbox endpoint, never contacts anyone."
      footer={
        <>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="create-test-referral" className={btnPrimary} disabled={busy}>
            <Busy busy={busy} label="Create referral" busyLabel="Creating…" />
          </button>
        </>
      }
    >
      <form id="create-test-referral" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>First name</label>
            <input required value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Last name</label>
            <input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Phone (magic numbers drive scenarios)</label>
          <select value={MAGIC_PHONES.some((m) => m.phone === form.phone) ? form.phone : "custom"} onChange={(e) => e.target.value !== "custom" && set("phone", e.target.value)} className={`${selectCls} w-full mb-2`}>
            {MAGIC_PHONES.map((m) => (
              <option key={m.phone} value={m.phone}>
                {m.phone} — {m.effect}
              </option>
            ))}
            <option value="custom">Other number (stays received — advance it manually)</option>
          </select>
          <input required value={form.phone} onChange={(e) => set("phone", e.target.value)} className={`${inputCls} font-mono`} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Your reference (optional)</label>
            <input value={form.partnerReference} onChange={(e) => set("partnerReference", e.target.value)} className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className={labelCls}>Recommended sessions</label>
            <input type="number" min={1} max={52} value={form.recommendedSessions} onChange={(e) => set("recommendedSessions", e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Condition</label>
            <input value={form.condition} onChange={(e) => set("condition", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Care mode</label>
            <select value={form.preferredMode} onChange={(e) => set("preferredMode", e.target.value)} className={`${selectCls} w-full`}>
              <option value="patient_choice">Patient&apos;s choice</option>
              <option value="remote">Remote (tele-rehab)</option>
              <option value="in_person">In person</option>
            </select>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function ReferralDetailDrawer({ ctx, referralId, onClose }: { ctx: PortalContext; referralId: string | null; onClose: () => void }) {
  const detail = useQuery(
    api.partners.getPartnerReferralDetail,
    referralId ? { partnerCode: ctx.partnerCode, environment: ctx.environment, referralId } : "skip"
  ) as any;
  const advance = useMutation(api.partners.advanceSandboxReferral);
  const [step, setStep] = useState<SandboxStep>("contacted");
  const [busy, setBusy] = useState(false);

  const referral = detail?.referral;
  return (
    <Drawer
      open={referralId !== null}
      onClose={onClose}
      title={referral ? <span className="font-mono">{referral.tracking_code}</span> : "Referral"}
      subtitle={referral ? `${referral.patient?.first_name ?? ""} ${referral.patient?.last_name ?? ""}`.trim() : undefined}
      footer={
        ctx.environment === "sandbox" && referral ? (
          <div className="flex items-center gap-2 flex-wrap w-full">
            <FlaskConical className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-semibold">Sandbox: advance to</span>
            <select value={step} onChange={(e) => setStep(e.target.value as SandboxStep)} className={selectCls} aria-label="Advance to">
              {SANDBOX_STEPS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={btnPrimary}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await advance({ partnerCode: ctx.partnerCode, referralId: referral.id, status: step });
                  toast.success("Referral advanced — webhooks queued");
                } catch (err) {
                  toast.error(errorMessage(err, "Could not advance the referral"));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Busy busy={busy} label="Advance" />
            </button>
          </div>
        ) : undefined
      }
    >
      {detail === undefined ? (
        <LoadingBlock />
      ) : detail === null ? (
        <EmptyState title="Referral not found in this environment" />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3">
            <Field label="Status" value={<StatusBadge status={referral.status} />} />
            {!ctx.isDoctor && <Field label="Your reference" value={<span className="font-mono">{referral.partner_reference ?? DASH}</span>} />}
            <Field label="Phone" value={referral.patient?.phone ?? DASH} />
            <Field label="Email" value={referral.patient?.email ?? DASH} />
            <Field label="Condition" value={referral.clinical?.condition ?? DASH} />
            <Field label="Physiotherapist" value={referral.provider ? `${referral.provider.name}${referral.provider.license_number ? ` (${referral.provider.license_number})` : ""}` : "Not matched yet"} />
            <Field label="Sessions" value={`${referral.sessions?.completed ?? 0} of ${referral.sessions?.total ?? DASH} completed`} />
            <Field label="Next session" value={fmtDateTime(referral.sessions?.next_session_at)} />
            <Field label="Created" value={fmtDateTime(referral.created_at)} />
            <Field label="Updated" value={fmtDateTime(referral.updated_at)} />
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-2">Milestones</h4>
            <ol className="space-y-2">
              {(detail.report?.milestones ?? []).map((m: any) => (
                <li key={m.key} className="flex items-center justify-between gap-3">
                  <span className="font-medium">{m.label}</span>
                  <span className="text-[#52706e]">
                    {m.status === "completed" ? `Done · ${fmtDate(m.completed_at)}` : m.status === "in_progress" ? "In progress" : "Pending"}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-2">Sessions</h4>
            {(detail.sessions ?? []).length === 0 ? (
              <p className="text-[#52706e]">No sessions yet.</p>
            ) : (
              <ul className="divide-y divide-[#002e2c]/5">
                {detail.sessions.map((s: any) => (
                  <li key={s.id} className="py-2 flex items-center justify-between gap-3">
                    <span>
                      #{s.sequence} · {fmtDateTime(s.scheduled_start)} · {s.mode === "virtual" ? "Virtual" : "In person"}
                      {s.simulated ? " · simulated" : ""}
                    </span>
                    <Pill tone={s.status === "completed" ? "green" : s.status === "scheduled" ? "blue" : "gray"}>{humanize(s.status)}</Pill>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-2">Timeline</h4>
            <ul className="space-y-1.5">
              {(detail.timeline ?? []).map((t: any, i: number) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span>{humanize(t.name)}</span>
                  <span className="text-[#52706e] whitespace-nowrap">{fmtDateTime(t.occurredAt)}</span>
                </li>
              ))}
            </ul>
          </section>

          {referral.links?.whatsapp_intake_url && (referral.status === "received" || referral.status === "contacted") && (
            <section className="p-4 rounded-2xl bg-[#FAF6E7]/70 border border-[#002e2c]/10 space-y-2">
              <h4 className="text-xs font-semibold text-[#002e2c]">Help them get started</h4>
              <p className="text-[#52706e] leading-relaxed">
                Send the patient this link. It opens WhatsApp with Joy, our care assistant, already holding their referral.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <a href={referral.links.whatsapp_intake_url} target="_blank" rel="noopener noreferrer" className={btnPrimary}>
                  <WhatsApp className="w-3.5 h-3.5" />
                  Open the WhatsApp link
                </a>
                <CopyButton text={referral.links.whatsapp_intake_url} label="WhatsApp link" className="border border-[#002e2c]/15 bg-white" />
              </div>
            </section>
          )}

          {!ctx.isDoctor && (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-2">Webhook events for this referral</h4>
              {(detail.webhookDeliveries ?? []).length === 0 ? (
                <p className="text-[#52706e]">No events yet.</p>
              ) : (
                <ul className="divide-y divide-[#002e2c]/5">
                  {detail.webhookDeliveries.map((d: any) => (
                    <li key={d._id} className="py-2 flex items-center justify-between gap-3">
                      <span className="font-mono">{d.eventType}</span>
                      <span className="flex items-center gap-2">
                        <Pill tone={d.status === "succeeded" ? "green" : d.status === "failed" ? "red" : d.status === "skipped" ? "gray" : "amber"}>{d.status}</Pill>
                        <span className="text-[#52706e]">{fmtDateTime(d.createdAt)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </Drawer>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-[#52706e]">{label}</div>
      <div className="mt-0.5 text-[#002e2c] break-words">{value}</div>
    </div>
  );
}
