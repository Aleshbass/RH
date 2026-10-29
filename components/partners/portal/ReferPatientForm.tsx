"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { CheckCircle2, ExternalLink, Send, ShieldCheck, UserPlus, WhatsApp } from "@/components/icons";
import { Busy, CopyButton, Modal, btnPrimary, btnSecondary, errorMessage, inputCls, labelCls, selectCls, type PortalContext } from "./shared";

type CreatedReferral = {
  id: string;
  tracking_code: string;
  links?: { tracking_url?: string; whatsapp_intake_url?: string };
};

const EMPTY = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  city: "",
  condition: "",
  notes: "",
  priority: "standard" as "standard" | "urgent",
  recommendedSessions: "",
  preferredMode: "patient_choice" as "remote" | "in_person" | "patient_choice",
  consent: false,
};

/**
 * A real referral typed into the portal (partners.createPortalReferral): how referring doctors
 * refer, and a manual option for partner organisations with live access. After it is sent the
 * patient's WhatsApp link to Joy is shown, ready to pass on.
 */
export function ReferPatientForm({ ctx, onDone, compact = false }: { ctx: PortalContext; onDone?: () => void; compact?: boolean }) {
  const create = useMutation(api.partners.createPortalReferral);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; referral: CreatedReferral } | null>(null);
  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.consent) {
      setError("Tick the box to confirm the patient agreed to be contacted by Rehabify.");
      return;
    }
    setBusy(true);
    try {
      const sessions = Number(form.recommendedSessions);
      const referral = (await create({
        partnerCode: ctx.partnerCode,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        city: form.city.trim() || undefined,
        condition: form.condition.trim() || undefined,
        notes: form.notes.trim() || undefined,
        priority: form.priority,
        recommendedSessions: Number.isFinite(sessions) && sessions > 0 ? Math.round(sessions) : undefined,
        preferredMode: form.preferredMode,
        consentGranted: true,
      })) as CreatedReferral;
      setCreated({ name: `${form.firstName} ${form.lastName}`.trim(), referral });
      toast.success(`Referral ${referral.tracking_code} sent`);
    } catch (err) {
      setError(errorMessage(err, "We couldn't send this referral. Check the details and try again."));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    const { referral } = created;
    const whatsapp = referral.links?.whatsapp_intake_url;
    const tracking = referral.links?.tracking_url;
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
          <div className="text-xs text-emerald-900 leading-relaxed">
            <p className="font-semibold text-sm">Referral sent for {created.name}</p>
            <p>Our care team will contact them on WhatsApp. You&apos;ll get an email as their care moves forward.</p>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-[#FAF6E7]/70 border border-rh-ink/10 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-[#52706e]">Tracking code</p>
            <p className="font-mono text-base font-bold text-rh-ink">{referral.tracking_code}</p>
          </div>
          <CopyButton text={referral.tracking_code} label="Tracking code" />
        </div>
        {whatsapp && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-rh-ink">Want them to start now?</p>
            <p className="text-xs text-[#52706e] leading-relaxed">
              Send your patient this link. It opens WhatsApp with Joy, our care assistant, already holding their referral.
            </p>
            <div className="flex flex-wrap gap-2">
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={btnPrimary}>
                <WhatsApp className="w-3.5 h-3.5" />
                Open the WhatsApp link
              </a>
              <CopyButton text={whatsapp} label="WhatsApp link" className="border border-rh-ink/15 bg-white" />
              {tracking && (
                <a href={tracking} target="_blank" rel="noopener noreferrer" className={btnSecondary}>
                  <ExternalLink className="w-3.5 h-3.5" />
                  Tracking page
                </a>
              )}
            </div>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-rh-ink/10">
          {onDone && (
            <button type="button" className={btnSecondary} onClick={onDone}>
              Done
            </button>
          )}
          <button
            type="button"
            className={btnPrimary}
            onClick={() => {
              setCreated(null);
              setForm(EMPTY);
            }}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Refer another patient
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="ref-first">First name</label>
          <input id="ref-first" required value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className={inputCls} autoComplete="off" />
        </div>
        <div>
          <label className={labelCls} htmlFor="ref-last">Last name</label>
          <input id="ref-last" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className={inputCls} autoComplete="off" />
        </div>
        <div>
          <label className={labelCls} htmlFor="ref-phone">Phone (WhatsApp)</label>
          <input
            id="ref-phone"
            required
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            className={`${inputCls} font-mono`}
            placeholder="+234 801 234 5678"
          />
          <p className="text-[10px] text-[#52706e] mt-1">We contact the patient on this number.</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="ref-email">Email (optional)</label>
          <input id="ref-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="ref-city">City (optional)</label>
          <input id="ref-city" value={form.city} onChange={(e) => set("city", e.target.value)} className={inputCls} placeholder="e.g. Ikeja, Lagos" />
        </div>
        <div>
          <label className={labelCls} htmlFor="ref-condition">Condition</label>
          <input id="ref-condition" value={form.condition} onChange={(e) => set("condition", e.target.value)} className={inputCls} placeholder="e.g. Post-op knee, low back pain" />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="ref-notes">Notes for the physiotherapist (optional)</label>
        <textarea
          id="ref-notes"
          rows={compact ? 2 : 3}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          className={`${inputCls} resize-none`}
          placeholder="Diagnosis, precautions, anything they should know"
        />
        <p className="text-[10px] text-[#52706e] mt-1">Only Rehabify&apos;s clinical team and the treating physiotherapist see this.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={labelCls} htmlFor="ref-priority">Urgency</label>
          <select id="ref-priority" value={form.priority} onChange={(e) => set("priority", e.target.value as typeof form.priority)} className={`${selectCls} w-full`}>
            <option value="standard">Standard</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="ref-sessions">Sessions (optional)</label>
          <input
            id="ref-sessions"
            type="number"
            min={1}
            max={52}
            inputMode="numeric"
            value={form.recommendedSessions}
            onChange={(e) => set("recommendedSessions", e.target.value)}
            className={inputCls}
            placeholder="4"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="ref-mode">Preferred care</label>
          <select id="ref-mode" value={form.preferredMode} onChange={(e) => set("preferredMode", e.target.value as typeof form.preferredMode)} className={`${selectCls} w-full`}>
            <option value="patient_choice">Patient&apos;s choice</option>
            <option value="remote">Video sessions</option>
            <option value="in_person">Home or clinic visits</option>
          </select>
        </div>
      </div>

      <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#FAF6E7]/70 border border-rh-ink/10 cursor-pointer">
        <input
          type="checkbox"
          checked={form.consent}
          onChange={(e) => set("consent", e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded accent-rh-ink shrink-0"
        />
        <span className="text-xs text-rh-ink leading-relaxed">
          <span className="font-semibold">The patient agreed to be contacted by Rehabify</span>
          <span className="block text-[#52706e]">We record this consent with the referral, as data protection law requires.</span>
        </span>
      </label>

      {error && (
        <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="flex items-center gap-1.5 text-[11px] text-[#52706e]">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
          Sent securely to Rehabify&apos;s care team
        </p>
        <button type="submit" className={btnPrimary} disabled={busy || !form.consent}>
          <Busy busy={busy} label="Send referral" busyLabel="Sending…" icon={<Send className="w-3.5 h-3.5" />} />
        </button>
      </div>
    </form>
  );
}

/** The form in a pop-up (bottom sheet on phones), for partner organisations with live access. */
export function ReferPatientModal({ ctx, open, onClose }: { ctx: PortalContext; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Refer a patient" description="We contact the patient, match them with a physiotherapist and keep you updated.">
      {open && <ReferPatientForm ctx={ctx} onDone={onClose} compact />}
    </Modal>
  );
}
