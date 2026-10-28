"use client";

import Link from "next/link";
import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { useMutation } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { ArrowRight, CheckCircle2, FileText, Loader2, X } from "@/components/icons";
import { careersApi, CV_MAX_BYTES } from "@/lib/careers";
import { cn } from "@/lib/utils";

const field =
  "mt-1.5 h-12 w-full rounded-xl bg-rh-canvas px-4 text-[15px] text-rh-ink ring-1 ring-inset ring-rh-ink/10 placeholder:text-rh-ink/40 focus:outline-none focus:ring-2 focus:ring-rh-ink";
const label = "block text-sm font-semibold text-rh-ink";
const optional = <span className="font-normal text-rh-ink/50">(optional)</span>;

const EMPTY = { fullName: "", email: "", phone: "", location: "", linkedinUrl: "", portfolioUrl: "", coverNote: "" };

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Apply for a role: the CV goes straight to Convex storage (guests may upload PDFs), then the
 * details go to /api/careers/apply, which rate-limits and saves the application.
 */
export function ApplyForm({ jobId, jobTitle }: { jobId: Id<"careerJobs">; jobTitle: string }) {
  const generateUploadUrl = useMutation(careersApi.generateUploadUrl);
  const [form, setForm] = useState(EMPTY);
  const [cv, setCv] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const set = (key: keyof typeof EMPTY) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const pickFile = (file: File | undefined) => {
    setError("");
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please attach your CV as a PDF.");
      return;
    }
    if (file.size > CV_MAX_BYTES) {
      setError("Your CV must be 5 MB or less.");
      return;
    }
    setCv(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!cv) {
      setError("Please attach your CV.");
      return;
    }
    if (!consent) {
      setError("Please confirm we can keep your application to review it.");
      return;
    }
    setState("sending");
    try {
      const uploadUrl = await generateUploadUrl({ fileType: "application/pdf", fileName: cv.name });
      const upload = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "application/pdf" }, body: cv });
      if (!upload.ok) throw new Error("Your CV didn't upload. Please try again.");
      const { storageId } = (await upload.json()) as { storageId: string };

      const res = await fetch("/api/careers/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, jobId, cvStorageId: storageId, cvFileName: cv.name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "We couldn't send your application. Please try again.");
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't send your application. Please try again.");
      setState("idle");
    }
  };

  if (state === "sent") {
    return (
      <div role="status" className="py-4 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rh-lime text-rh-ink">
          <CheckCircle2 className="h-7 w-7" />
        </span>
        <h3 className="mt-5 text-2xl font-bold leading-tight text-rh-ink">Application sent</h3>
        <p className="mx-auto mt-2 max-w-sm text-[15px] font-medium leading-relaxed text-rh-ink/70">
          Thanks for applying for {jobTitle}. We&apos;ve emailed a confirmation to {form.email}.
        </p>
        <Link href="/careers#roles" className="mt-6 inline-flex items-center gap-2 text-[15px] font-semibold text-rh-ink underline-offset-4 hover:underline">
          See other roles <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="apply-name" className={label}>Full name</label>
        <input id="apply-name" required autoComplete="name" value={form.fullName} onChange={(e) => set("fullName")(e.target.value)} className={field} />
      </div>
      <div>
        <label htmlFor="apply-email" className={label}>Email</label>
        <input id="apply-email" type="email" required autoComplete="email" value={form.email} onChange={(e) => set("email")(e.target.value)} className={field} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="apply-phone" className={label}>Phone {optional}</label>
          <input id="apply-phone" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone")(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="apply-location" className={label}>City {optional}</label>
          <input id="apply-location" autoComplete="address-level2" value={form.location} onChange={(e) => set("location")(e.target.value)} className={field} />
        </div>
      </div>

      <div>
        <span className={label}>CV</span>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          id="apply-cv"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        {cv ? (
          <div className="mt-1.5 flex items-center gap-3 rounded-xl bg-rh-canvas px-4 py-3 ring-1 ring-inset ring-rh-ink/10">
            <FileText className="h-5 w-5 shrink-0 text-rh-ink" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-rh-ink">{cv.name}</span>
              <span className="block text-xs text-rh-ink/55">{formatSize(cv.size)}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setCv(null);
                if (fileInput.current) fileInput.current.value = "";
              }}
              aria-label="Remove CV"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-rh-ink/60 hover:bg-white hover:text-rh-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              "mt-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
              dragging ? "border-rh-ink bg-rh-lime/10" : "border-rh-ink/15 bg-rh-canvas"
            )}
          >
            <label htmlFor="apply-cv" className="cursor-pointer text-[15px] font-semibold text-rh-ink underline-offset-4 hover:underline">
              Choose a PDF
            </label>
            <span className="text-[15px] text-rh-ink/60"> or drop it here</span>
            <p className="mt-1 text-xs text-rh-ink/50">PDF, up to 5 MB</p>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="apply-linkedin" className={label}>LinkedIn {optional}</label>
          <input id="apply-linkedin" inputMode="url" placeholder="linkedin.com/in/…" value={form.linkedinUrl} onChange={(e) => set("linkedinUrl")(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="apply-portfolio" className={label}>Website or portfolio {optional}</label>
          <input id="apply-portfolio" inputMode="url" value={form.portfolioUrl} onChange={(e) => set("portfolioUrl")(e.target.value)} className={field} />
        </div>
      </div>

      <div>
        <label htmlFor="apply-note" className={label}>Why this role? {optional}</label>
        <textarea
          id="apply-note"
          rows={4}
          maxLength={2000}
          value={form.coverNote}
          onChange={(e) => set("coverNote")(e.target.value)}
          className={`${field} h-auto resize-none py-3`}
        />
      </div>

      <label className="flex items-start gap-3 text-sm leading-relaxed text-rh-ink/75">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-rh-ink/30 accent-rh-ink"
        />
        <span>
          Rehabify may keep my application and CV to consider me for this role. See our{" "}
          <Link href="/privacy-policy" className="font-semibold text-rh-ink underline-offset-4 hover:underline">
            privacy policy
          </Link>
          .
        </span>
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={state === "sending" || !consent}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rh-lime text-[15px] font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2"
      >
        {state === "sending" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Sending…
          </>
        ) : (
          <>
            Send application <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  );
}
