"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Bell, Building2, Mail, ShieldCheck, Stethoscope } from "@/components/icons";
import { DetailRow, LoadingBlocks, PageHeader, Panel, primaryButtonClass, secondaryButtonClass } from "@/components/physio/ui";
import { playSound } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import type { PartnerInfo } from "@/components/partners/portal/shared";
import { doctorRefs } from "./refs";
import { FieldLabel, errorText, inputClass } from "./ui";

const SUPPORT_EMAIL = "partners@physioaroundme.com";

/** The doctor's name and contact details (where updates go) and their verified professional details. */
export function DoctorProfile({ partnerCode, info, isAdmin }: { partnerCode: string; info: PartnerInfo; isAdmin: boolean }) {
  const update = useMutation(doctorRefs.updateProfile);
  // An admin viewing a doctor sees the partner record only (the profile query reads the signed-in account)
  const profile = useQuery(doctorRefs.doctorProfile, isAdmin ? "skip" : {});
  const initial = () => ({ name: info.name ?? "", email: info.contactEmail ?? "", phone: info.contactPhone ?? "" });
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(initial()), [partnerCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = form.name !== (info.name ?? "") || form.email !== (info.contactEmail ?? "") || form.phone !== (info.contactPhone ?? "");
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await update({
        partnerCode,
        name: form.name.trim(),
        contactName: form.name.trim(),
        contactEmail: form.email.trim(),
        contactPhone: form.phone.trim(),
      });
      playSound("success");
      toast.success("Details saved");
    } catch (err) {
      playSound("error");
      toast.error(errorText(err, "We couldn't save your details."));
    } finally {
      setSaving(false);
    }
  };

  const p = profile?.profile ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="How patients and Rehabify see you, and where your updates go." />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Your details" className="lg:col-span-2" bodyClassName="px-5 pb-5 pt-3 sm:px-6">
          <form onSubmit={save} className="space-y-4">
            <div>
              <FieldLabel htmlFor="doc-name" hint="Shown to patients on your referral link">
                Name
              </FieldLabel>
              <input id="doc-name" required value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="doc-email" hint="Updates and payouts">
                  Email
                </FieldLabel>
                <input id="doc-email" type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} className={inputClass} />
              </div>
              <div>
                <FieldLabel htmlFor="doc-phone">Phone</FieldLabel>
                <input id="doc-phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={!dirty || saving} className={cn(primaryButtonClass, "h-10")}>
                {saving ? "Saving…" : "Save details"}
              </Button>
            </div>
          </form>
        </Panel>

        <div className="space-y-4">
          <Panel title="Professional details" bodyClassName="px-5 pb-5 pt-1 sm:px-6">
            {isAdmin ? (
              <p className="pt-2 text-sm text-pt-muted">Open the doctor in Admin → Partnerships to see their licence details.</p>
            ) : profile === undefined ? (
              <LoadingBlocks rows={2} />
            ) : (
              <>
                <div className="divide-y divide-pt-line">
                  <DetailRow icon={Stethoscope} label="Specialty">
                    {p?.specialty || "—"}
                  </DetailRow>
                  <DetailRow icon={Building2} label="Hospital or clinic">
                    {p?.hospitalAffiliation || "—"}
                  </DetailRow>
                  <DetailRow icon={ShieldCheck} label="MDCN folio or licence">
                    <span className="font-mono">{p?.medicalLicenseNumber || "—"}</span>
                  </DetailRow>
                </div>
                <Button asChild variant="outline" className={cn(secondaryButtonClass, "mt-3 w-full")}>
                  <Link href="/doctor">Update professional details</Link>
                </Button>
              </>
            )}
          </Panel>

          <Panel title="Updates" bodyClassName="px-5 pb-5 pt-3 sm:px-6">
            <p className="flex items-start gap-2.5 text-sm text-pt-muted">
              <Bell className="mt-0.5 h-4 w-4 shrink-0" />
              You get an update here, on your phone if you allow notifications, and by email each time a patient you referred moves forward.
            </p>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-3 flex items-center gap-2 text-sm font-medium text-pt-ink hover:underline">
              <Mail className="h-4 w-4" />
              {SUPPORT_EMAIL}
            </a>
          </Panel>
        </div>
      </div>
    </div>
  );
}
