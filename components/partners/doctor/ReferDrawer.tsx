"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  House,
  Paperclip,
  ShieldCheck,
  Video,
  WhatsApp,
  X,
} from "@/components/icons";
import { InfoTip, PhysioDrawer, primaryButtonClass, secondaryButtonClass } from "@/components/physio/ui";
import { IconChip } from "@/components/patient/ui";
import { playSound } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";
import { DOCTOR_CARE_SETTING_LABELS, type DoctorCareSetting, type DoctorUrgency } from "@/convex/helpers/doctorStages";
import { doctorRefs, type CreatedReferral } from "./refs";
import { FieldLabel, Segmented, errorText, inputClass, textareaClass, whatsappDigits } from "./ui";

const MAX_LETTER_BYTES = 10 * 1024 * 1024;
const LETTER_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
/** The doctor's last "where" and area, so the next referral starts with them. */
const DEFAULTS_KEY = "rh_doctor_refer_defaults";

type Form = {
  name: string;
  phone: string;
  email: string;
  condition: string;
  urgency: DoctorUrgency;
  careSetting: DoctorCareSetting;
  city: string;
  notes: string;
  consent: boolean;
};

const EMPTY: Form = {
  name: "",
  phone: "",
  email: "",
  condition: "",
  urgency: "routine",
  careSetting: "clinic",
  city: "",
  notes: "",
  consent: false,
};

function readDefaults(): Partial<Form> {
  try {
    const raw = localStorage.getItem(DEFAULTS_KEY);
    const saved = raw ? (JSON.parse(raw) as { careSetting?: string; city?: string }) : null;
    if (!saved) return {};
    const careSetting = saved.careSetting === "home" || saved.careSetting === "online" || saved.careSetting === "clinic" ? saved.careSetting : undefined;
    return { ...(careSetting ? { careSetting } : {}), ...(typeof saved.city === "string" ? { city: saved.city.slice(0, 80) } : {}) };
  } catch {
    return {};
  }
}

function saveDefaults(form: Form) {
  try {
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify({ careSetting: form.careSetting, city: form.city.trim() }));
  } catch {
    // Storage blocked: the next form just starts empty
  }
}

function splitName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") || undefined };
}

function fileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * "Refer a patient": a one-minute form in a drawer (partners.createPortalReferral), then what
 * happens next and a ready WhatsApp message to send the patient their start link.
 */
export function ReferDrawer({
  partnerCode,
  doctorName,
  open,
  onOpenChange,
  onViewReferral,
}: {
  partnerCode: string;
  doctorName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewReferral: (referralId: string) => void;
}) {
  const create = useMutation(doctorRefs.createReferral);
  const generateUploadUrl = useMutation(doctorRefs.uploadUrl);
  const [form, setForm] = useState<Form>(EMPTY);
  const [letter, setLetter] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ firstName: string; phone: string; careSetting: DoctorCareSetting; referral: CreatedReferral } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  // Each time it opens: a fresh form with the last "where" and area filled in
  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY, ...readDefaults() });
    setLetter(null);
    setError(null);
    setSent(null);
  }, [open]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (error) setError(null);
  };

  const ready = form.name.trim().length > 1 && form.phone.trim().length >= 7 && form.condition.trim().length > 1 && form.consent;

  const pickLetter = (file: File | undefined) => {
    if (!file) return;
    if (!LETTER_TYPES.includes(file.type)) {
      toast.error("Attach the letter as a PDF or a photo.");
      return;
    }
    if (file.size > MAX_LETTER_BYTES) {
      toast.error("The letter must be smaller than 10 MB.");
      return;
    }
    setLetter(file);
  };

  const uploadLetter = async (file: File): Promise<Id<"_storage">> => {
    const url = await generateUploadUrl({ fileType: file.type, fileName: file.name.slice(0, 200) });
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
    if (!response.ok) throw new Error("The referral letter didn't upload. Try again.");
    const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
    return storageId;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.consent) {
      setError("Tick the box to confirm the patient agreed to be contacted by Rehabify.");
      return;
    }
    const { firstName, lastName } = splitName(form.name);
    if (!firstName) {
      setError("Enter the patient's name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const letterStorageId = letter ? await uploadLetter(letter) : undefined;
      const referral = await create({
        partnerCode,
        firstName,
        lastName,
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        condition: form.condition.trim(),
        urgency: form.urgency,
        careSetting: form.careSetting,
        city: form.city.trim() || undefined,
        notes: form.notes.trim() || undefined,
        letterStorageId,
        letterName: letter?.name,
        consentGranted: true,
      });
      saveDefaults(form);
      playSound("send");
      setSent({ firstName, phone: form.phone.trim(), careSetting: form.careSetting, referral });
    } catch (err) {
      playSound("error");
      setError(errorText(err, "We couldn't send this referral. Check the details and try again."));
    } finally {
      setBusy(false);
    }
  };

  const close = () => onOpenChange(false);

  if (sent) {
    return (
      <PhysioDrawer open={open} onOpenChange={onOpenChange} title="Referral sent" description={`Tracking code ${sent.referral.tracking_code}`}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className={secondaryButtonClass}
              onClick={() => {
                setForm({ ...EMPTY, ...readDefaults() });
                setLetter(null);
                setSent(null);
                setTimeout(() => nameInput.current?.focus(), 50);
              }}
            >
              Refer another patient
            </Button>
            <Button type="button" className={primaryButtonClass} onClick={close}>
              Done
            </Button>
          </div>
        }
      >
        <SentView sent={sent} doctorName={doctorName} onView={() => onViewReferral(sent.referral.id)} />
      </PhysioDrawer>
    );
  }

  return (
    <PhysioDrawer
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
      title="Refer a patient"
      description="Takes about a minute. We contact them and keep you updated."
      footer={
        <div className="space-y-3">
          {error && (
            <p role="alert" className="rounded-xl bg-pt-rose-bg px-3.5 py-2.5 text-[13px] text-pt-rose-fg">
              {error}
            </p>
          )}
          <Button type="submit" form="doctor-refer-form" disabled={!ready || busy} className={cn(primaryButtonClass, "h-12 w-full text-[15px]")}>
            {busy ? "Sending…" : "Send referral"}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-xs text-pt-muted">
            <ShieldCheck className="h-3.5 w-3.5" />
            Only Rehabify&apos;s care team and the treating physio see this.
          </p>
        </div>
      }
    >
      <form id="doctor-refer-form" onSubmit={submit} className="space-y-5 pb-2">
        <section className="space-y-3">
          <div>
            <FieldLabel htmlFor="dr-name">Patient&apos;s name</FieldLabel>
            <input
              ref={nameInput}
              id="dr-name"
              autoFocus
              autoComplete="off"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputClass}
              placeholder="e.g. Ada Okafor"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="dr-phone">WhatsApp number</FieldLabel>
              <input
                id="dr-phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                className={inputClass}
                placeholder="0801 234 5678"
              />
            </div>
            <div>
              <FieldLabel htmlFor="dr-email" hint="Optional">
                Email
              </FieldLabel>
              <input
                id="dr-email"
                type="email"
                autoComplete="off"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <FieldLabel htmlFor="dr-condition">Condition or diagnosis</FieldLabel>
            <input
              id="dr-condition"
              autoComplete="off"
              value={form.condition}
              onChange={(e) => set("condition", e.target.value)}
              className={inputClass}
              placeholder="e.g. Post-op ACL repair, low back pain"
            />
          </div>
          <div>
            <FieldLabel>
              How soon
              <InfoTip>We contact every patient. Urgent referrals go to the top of our care team&apos;s list.</InfoTip>
            </FieldLabel>
            <Segmented
              label="How soon"
              value={form.urgency}
              onChange={(v) => set("urgency", v)}
              options={[
                { value: "routine", label: "Routine" },
                { value: "soon", label: "Soon" },
                { value: "urgent", label: "Urgent" },
              ]}
            />
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <FieldLabel>
              Where
              <InfoTip>We match them with a verified physio for a clinic visit, a home visit or video sessions. They can still change it with us.</InfoTip>
            </FieldLabel>
            <Segmented
              label="Where"
              value={form.careSetting}
              onChange={(v) => set("careSetting", v)}
              options={[
                { value: "clinic", label: "Clinic", icon: Building2 },
                { value: "home", label: "Home visit", icon: House },
                { value: "online", label: "Online", icon: Video },
              ]}
            />
          </div>
          <div>
            <FieldLabel htmlFor="dr-city" hint={form.careSetting === "online" ? "Optional" : undefined}>
              Area or city
            </FieldLabel>
            <input
              id="dr-city"
              autoComplete="off"
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              className={inputClass}
              placeholder="e.g. Ikeja, Lagos"
            />
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <FieldLabel htmlFor="dr-notes" hint="Optional">
              Notes for the physio
            </FieldLabel>
            <textarea
              id="dr-notes"
              rows={3}
              maxLength={3000}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              className={textareaClass}
              placeholder="Precautions, surgery date, imaging, anything they should know"
            />
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="hidden"
            onChange={(e) => {
              pickLetter(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {letter ? (
            <div className="flex items-center gap-3 rounded-2xl bg-pt-sunken px-3.5 py-3">
              <FileText className="h-4 w-4 shrink-0 text-pt-muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-pt-ink">{letter.name}</span>
                <span className="block text-xs text-pt-muted">{fileSize(letter.size)}</span>
              </span>
              <button
                type="button"
                onClick={() => setLetter(null)}
                aria-label="Remove the letter"
                className="rounded-lg p-1.5 text-pt-muted transition hover:bg-pt-hover hover:text-pt-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-pt-line-strong px-3.5 py-3 text-left transition hover:bg-pt-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50"
            >
              <Paperclip className="h-4 w-4 shrink-0 text-pt-muted" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-pt-ink">Attach a referral letter</span>
                <span className="block text-xs text-pt-muted">Optional. PDF or a photo, up to 10 MB.</span>
              </span>
            </button>
          )}
        </section>

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-pt-line-strong px-3.5 py-3.5 transition hover:bg-pt-hover">
          <input
            type="checkbox"
            checked={form.consent}
            onChange={(e) => set("consent", e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded accent-[#16181c]"
          />
          <span className="text-sm leading-snug">
            <span className="block font-medium text-pt-ink">The patient agreed to be contacted by Rehabify</span>
            <span className="mt-0.5 block text-xs text-pt-muted">We record this with the referral, as data protection law requires.</span>
          </span>
        </label>
      </form>
    </PhysioDrawer>
  );
}

function SentView({
  sent,
  doctorName,
  onView,
}: {
  sent: { firstName: string; phone: string; careSetting: DoctorCareSetting; referral: CreatedReferral };
  doctorName: string;
  onView: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const startLink = sent.referral.links?.whatsapp_intake_url;
  const digits = whatsappDigits(sent.phone);
  const message = startLink
    ? `Hello ${sent.firstName}, this is ${doctorName}. I've referred you to Rehabify for physiotherapy. Tap this link to start on WhatsApp with Joy, their care assistant: ${startLink}`
    : null;
  const where =
    sent.careSetting === "online" ? "for video sessions" : sent.careSetting === "home" ? "for home visits" : `at a ${DOCTOR_CARE_SETTING_LABELS.clinic.toLowerCase()}`;

  const steps = [
    `We message ${sent.firstName} on WhatsApp.`,
    `They book a verified physiotherapist ${where}.`,
    "You get an update here and by email at each step.",
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <IconChip icon={CheckCircle2} tone="green" size="lg" />
        <div className="min-w-0">
          <p className="text-[17px] font-semibold tracking-tight text-pt-ink">{sent.firstName} is on our list</p>
          <p className="mt-0.5 text-sm text-pt-muted">Our care team has their referral now.</p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-pt-faint">What happens next</p>
        <ol className="space-y-2.5">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pt-sunken text-xs font-semibold text-pt-ink">{i + 1}</span>
              <span className="pt-0.5 text-sm text-pt-ink">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {message && (
        <div className="rounded-2xl bg-pt-sunken p-4">
          <p className="text-sm font-semibold text-pt-ink">Want them to start now?</p>
          <p className="mt-0.5 text-[13px] text-pt-muted">Send {sent.firstName} their start link from your WhatsApp. It opens a chat with Joy, already holding the referral.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`https://wa.me/${digits ?? ""}?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-pt-accent px-4 text-sm font-semibold text-[#06210a] transition hover:bg-[#00b80e] active:scale-[0.98]"
            >
              <WhatsApp className="h-4 w-4" />
              Send on WhatsApp
            </a>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(message);
                  setCopied(true);
                  toast.success("Message copied");
                  setTimeout(() => setCopied(false), 1800);
                } catch {
                  toast.error("Couldn't copy. Select the text and copy it instead.");
                }
              }}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-pt-line-strong bg-pt-surface px-4 text-sm font-medium text-pt-ink transition hover:bg-pt-hover"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              Copy message
            </button>
          </div>
        </div>
      )}

      <button type="button" onClick={onView} className="text-sm font-semibold text-pt-ink underline-offset-4 hover:underline">
        Follow this referral
      </button>
    </div>
  );
}
