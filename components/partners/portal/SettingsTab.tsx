"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { Building2, ImageIcon, Trash2, UploadCloud, UserRound } from "@/components/icons";
import { Busy, PARTNER_SUPPORT_EMAIL, btnDanger, btnPrimary, btnSecondary, cardCls, errorMessage, inputCls, labelCls, type PortalContext } from "./shared";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

export function SettingsTab({ ctx }: { ctx: PortalContext }) {
  const updateBranding = useMutation(api.partners.updatePartnerBranding);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const info = ctx.info;
  const initial = () => ({
    name: info.name ?? "",
    website: info.website ?? "",
    contactName: info.contactName ?? "",
    contactEmail: info.contactEmail ?? "",
    contactPhone: info.contactPhone ?? "",
    technicalContactEmail: info.technicalContactEmail ?? "",
    financeContactEmail: info.financeContactEmail ?? "",
    coverageStates: (info.coverageStates ?? []).join(", "),
    coverageCities: (info.coverageCities ?? []).join(", "),
  });
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Reset when switching organisation (admins) — not on every keystroke.
  useEffect(() => setForm(initial()), [ctx.partnerCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key: keyof ReturnType<typeof initial>, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const list = (value: string) => value.split(",").map((s) => s.trim()).filter(Boolean);

  const uploadLogo = async (file: File) => {
    if (!LOGO_TYPES.includes(file.type)) return toast.error("Upload a PNG, JPG, SVG or WebP image.");
    if (file.size > MAX_LOGO_BYTES) return toast.error("Logos must be smaller than 5 MB.");
    setUploading(true);
    try {
      const uploadUrl = (await generateUploadUrl({ fileName: file.name, fileType: file.type })) as string;
      const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!response.ok) throw new Error("Upload failed");
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      await updateBranding({ partnerCode: ctx.partnerCode, logoStorageId: storageId });
      toast.success("Logo updated");
    } catch (err) {
      toast.error(errorMessage(err, "Could not upload the logo"));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateBranding(
        ctx.isDoctor
          ? {
              partnerCode: ctx.partnerCode,
              name: form.name,
              contactName: form.name,
              contactEmail: form.contactEmail,
              contactPhone: form.contactPhone,
            }
          : {
              partnerCode: ctx.partnerCode,
              name: form.name,
              website: form.website,
              contactName: form.contactName,
              contactEmail: form.contactEmail,
              contactPhone: form.contactPhone,
              technicalContactEmail: form.technicalContactEmail,
              financeContactEmail: form.financeContactEmail,
              coverageStates: list(form.coverageStates),
              coverageCities: list(form.coverageCities),
            }
      );
      toast.success(ctx.isDoctor ? "Your details are saved" : "Organisation details saved");
    } catch (err) {
      toast.error(errorMessage(err, "Could not save your changes"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className={`${cardCls} p-6 space-y-4`}>
        <h3 className="text-sm font-semibold">{ctx.isDoctor ? "Photo or practice logo" : "Logo"}</h3>
        <p className="text-xs text-[#52706e]">
          {ctx.isDoctor ? "Shown on your referral link page, so patients know the link is from you." : "Shown on your co-branded referral landing pages and in this portal."}
        </p>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void uploadLogo(file);
          }}
          className={`rounded-2xl border-2 border-dashed p-6 flex flex-col items-center justify-center gap-3 text-center transition ${
            dragging ? "border-[#00cd0f] bg-[#00cd0f]/5" : "border-[#0b1312]/15 bg-[#FAF6E7]/50"
          }`}
        >
          {info.logoUrl ? (
            <img src={info.logoUrl} alt={info.name} className="max-h-16 max-w-[180px] object-contain" />
          ) : (
            <ImageIcon className="w-8 h-8 text-[#52706e]/50" />
          )}
          <p className="text-[11px] text-[#52706e]">Drag an image here or choose a file (PNG, JPG, SVG, WebP · max 5 MB)</p>
          <input ref={fileInput} type="file" accept={LOGO_TYPES.join(",")} className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
          <div className="flex gap-2">
            <button type="button" className={btnSecondary} onClick={() => fileInput.current?.click()} disabled={uploading}>
              <Busy busy={uploading} label="Choose file" busyLabel="Uploading…" icon={<UploadCloud className="w-3.5 h-3.5" />} />
            </button>
            {info.logoUrl && (
              <button
                type="button"
                className={btnDanger}
                disabled={uploading}
                onClick={async () => {
                  try {
                    await updateBranding({ partnerCode: ctx.partnerCode, removeLogo: true });
                    toast.success("Logo removed");
                  } catch (err) {
                    toast.error(errorMessage(err, "Could not remove the logo"));
                  }
                }}
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </button>
            )}
          </div>
        </div>
        <div className="text-[11px] text-[#52706e] space-y-1 pt-2 border-t border-rh-ink/10">
          <p>
            {ctx.isDoctor ? "Referral code" : "Partner code"}: <span className="font-mono font-semibold text-rh-ink">{ctx.partnerCode}</span>
          </p>
          <p>
            {ctx.isDoctor ? (
              <>Account: <span className="font-semibold text-rh-ink">Referring doctor</span></>
            ) : (
              <>
                Organisation type: <span className="font-semibold text-rh-ink uppercase">{info.type}</span>
              </>
            )}
          </p>
          {ctx.isDoctor && <p>Your payout bank account is under Earnings &amp; payouts.</p>}
          <p>
            To change the account owner email, contact{" "}
            <a className="underline" href={`mailto:${PARTNER_SUPPORT_EMAIL}`}>
              {PARTNER_SUPPORT_EMAIL}
            </a>
            .
          </p>
        </div>
      </div>

      <form onSubmit={save} className={`${cardCls} p-6 space-y-5 lg:col-span-2`}>
        <div className="flex items-center gap-2">
          {ctx.isDoctor ? <UserRound className="w-4 h-4 text-rh-ink" /> : <Building2 className="w-4 h-4 text-rh-ink" />}
          <h3 className="text-sm font-semibold">{ctx.isDoctor ? "Your details" : "Organisation details"}</h3>
        </div>
        {ctx.isDoctor ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Name patients see" hint="As it appears on your referral link page">
              <input required value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} maxLength={120} />
            </Field>
            <Field label="Email" hint="Referral updates and payout statements go here">
              <input type="email" required value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Phone">
              <input value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} className={inputCls} />
            </Field>
          </div>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Organisation name">
            <input required value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} maxLength={120} />
          </Field>
          <Field label="Website">
            <input value={form.website} onChange={(e) => set("website", e.target.value)} className={inputCls} placeholder="https://example.com" />
          </Field>
          <Field label="Primary contact name">
            <input value={form.contactName} onChange={(e) => set("contactName", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Primary contact email">
            <input type="email" required value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Phone">
            <input value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Technical contact email" hint="Receives go-live and security notices">
            <input type="email" value={form.technicalContactEmail} onChange={(e) => set("technicalContactEmail", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Finance contact email" hint="Receives settlement statements">
            <input type="email" value={form.financeContactEmail} onChange={(e) => set("financeContactEmail", e.target.value)} className={inputCls} />
          </Field>
          <Field label="States covered" hint="Comma separated">
            <input value={form.coverageStates} onChange={(e) => set("coverageStates", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Cities / areas covered" hint="Comma separated">
            <input value={form.coverageCities} onChange={(e) => set("coverageCities", e.target.value)} className={inputCls} />
          </Field>
        </div>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t border-rh-ink/10">
          <button type="button" className={btnSecondary} onClick={() => setForm(initial())}>
            Reset
          </button>
          <button type="submit" className={btnPrimary} disabled={saving}>
            <Busy busy={saving} label="Save changes" busyLabel="Saving…" />
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className="text-[10px] text-[#52706e] mt-1">{hint}</p>}
    </div>
  );
}
