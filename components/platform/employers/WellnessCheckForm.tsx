"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { ArrowRight, Check, CheckCircle2, Loader2 } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * "Complimentary Workplace Wellness Check" sign-up on /platform/employers (owner, 25 Nov 2026).
 * Separate from "Request a pilot": organisations register interest in an introductory visit from
 * the physiotherapy team. Posts to /api/employer-wellness-check, which saves it for Admin ›
 * Partnerships › Inquiries (and Employer outreach) and emails the team and the requester.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

export const INDUSTRIES = [
  "Manufacturing / Industrial",
  "Logistics / Transportation",
  "Construction / Engineering",
  "Corporate / Professional Services",
  "Healthcare",
  "Education",
  "Government / Public Sector",
  "Retail / Hospitality",
  "Agriculture",
  "Other",
];

export const EMPLOYEE_RANGES = ["1–20", "21–50", "51–100", "101–500", "501–1,000", "More than 1,000"];

export const IMPROVEMENTS = [
  "Back, neck or joint pain",
  "Workplace posture and ergonomics",
  "Physical strain or work-related injuries",
  "Employee comfort and wellbeing",
  "Sick leave and reduced productivity",
  "Easier access to healthcare",
  "Not sure yet — we'd like to learn more",
  "Other",
];

const EMPTY = {
  organisation: "",
  industry: "",
  industryOther: "",
  employeeRange: "",
  location: "",
  name: "",
  role: "",
  email: "",
  phone: "",
  interests: [] as string[],
  interestOther: "",
  message: "",
  consent: false,
};
type Form = typeof EMPTY;
type TextField = "organisation" | "industryOther" | "location" | "name" | "role" | "email" | "phone" | "interestOther";

const field =
  "mt-1.5 h-12 w-full rounded-xl bg-rh-canvas px-4 text-[15px] text-rh-ink ring-1 ring-inset ring-rh-ink/10 placeholder:text-rh-ink/40 focus:outline-none focus:ring-2 focus:ring-rh-ink";
const label = "block text-sm font-semibold text-rh-ink";
const chip =
  "inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 py-2 text-left text-sm font-medium ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-rh-ink/50">{title}</legend>
      {children}
    </fieldset>
  );
}

export function WellnessCheckForm() {
  const reduce = useReducedMotion();
  const [form, setForm] = useState<Form>(EMPTY);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggleInterest = (value: string) =>
    setForm((f) => ({ ...f, interests: f.interests.includes(value) ? f.interests.filter((i) => i !== value) : [...f.interests, value] }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.employeeRange) return setError("Choose roughly how many employees work at your organisation.");
    if (!form.consent) return setError("Please tick the box to agree to be contacted about your request.");
    const industry = form.industry === "Other" ? `Other: ${form.industryOther.trim()}` : form.industry;
    const interests = form.interests.map((i) => (i === "Other" && form.interestOther.trim() ? `Other: ${form.interestOther.trim()}` : i));
    setState("sending");
    try {
      const res = await fetch("/api/employer-wellness-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisation: form.organisation,
          industry,
          employeeRange: form.employeeRange,
          location: form.location,
          name: form.name,
          role: form.role,
          email: form.email,
          phone: form.phone,
          interests,
          message: form.message,
          consent: form.consent,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "We couldn't send your request.");
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't send your request.");
      setState("idle");
    }
  };

  const input = (key: TextField, text: string, props: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={`wellness-${key}`} className={label}>
        {text}
      </label>
      <input
        id={`wellness-${key}`}
        required
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        className={field}
        {...props}
      />
    </div>
  );

  if (state === "sent") {
    return (
      <motion.div
        role="status"
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        className="flex h-full flex-col justify-center"
      >
        <motion.span
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rh-lime"
          initial={reduce ? false : { scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 18, delay: 0.1 }}
        >
          <CheckCircle2 className="h-6 w-6 text-rh-ink" />
        </motion.span>
        <h3 className="mt-5 text-2xl font-bold tracking-tight text-rh-ink">Thanks, {form.name.trim().split(" ")[0] || "we've got it"}.</h3>
        <p className="mt-2 text-[15px] leading-relaxed text-rh-ink/70">
          We&apos;ve received your request for {form.organisation.trim() || "your organisation"}. Our team will contact you to discuss the next
          steps, and a confirmation is on its way to {form.email}.
        </p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      <Group title="Tell us about your organisation">
        {input("organisation", "Organisation name", { autoComplete: "organization" })}
        <div>
          <label htmlFor="wellness-industry" className={label}>
            What industry does your organisation operate in?
          </label>
          <select
            id="wellness-industry"
            required
            value={form.industry}
            onChange={(e) => set("industry", e.target.value)}
            className={cn(field, "pr-3", !form.industry && "text-rh-ink/40")}
          >
            <option value="" disabled>
              Choose an industry
            </option>
            {INDUSTRIES.map((industry) => (
              <option key={industry} value={industry} className="text-rh-ink">
                {industry === "Other" ? "Other (please specify)" : industry}
              </option>
            ))}
          </select>
        </div>
        {form.industry === "Other" && input("industryOther", "Your industry", { placeholder: "e.g. Oil and gas" })}
        <div role="radiogroup" aria-labelledby="wellness-employees-label">
          <p id="wellness-employees-label" className={label}>
            Approximately how many employees work at your organisation?
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {EMPLOYEE_RANGES.map((range) => {
              const selected = form.employeeRange === range;
              return (
                <button
                  key={range}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => set("employeeRange", range)}
                  className={cn(chip, "justify-center", selected ? "bg-rh-ink text-white ring-rh-ink" : "bg-rh-canvas text-rh-ink ring-rh-ink/10 hover:ring-rh-ink/30")}
                >
                  {range}
                </button>
              );
            })}
          </div>
        </div>
        {input("location", "Where is your workplace located?", { placeholder: "City and state, e.g. Ikeja, Lagos", autoComplete: "address-level2" })}
      </Group>

      <Group title="Your contact details">
        <div className="grid gap-4 sm:grid-cols-2">
          {input("name", "Full name", { autoComplete: "name" })}
          {input("role", "Job title / Role", { autoComplete: "organization-title", placeholder: "e.g. HR manager" })}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {input("email", "Work email address", { type: "email", autoComplete: "email" })}
          {input("phone", "WhatsApp / Phone number", { type: "tel", autoComplete: "tel", placeholder: "e.g. 0803 123 4567" })}
        </div>
      </Group>

      <Group title="One last question">
        <div>
          <p className={label}>
            What would you most like to improve about your team&apos;s physical health at work?{" "}
            <span className="font-normal text-rh-ink/50">(optional, choose any)</span>
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {IMPROVEMENTS.map((item) => {
              const selected = form.interests.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  onClick={() => toggleInterest(item)}
                  className={cn(chip, selected ? "bg-rh-lime/40 text-rh-ink ring-rh-ink" : "bg-rh-canvas text-rh-ink ring-rh-ink/10 hover:ring-rh-ink/30")}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 ring-inset",
                      selected ? "bg-rh-ink ring-rh-ink" : "bg-white ring-rh-ink/20",
                    )}
                  >
                    {selected && <Check className="h-3 w-3 text-white" />}
                  </span>
                  {item}
                </button>
              );
            })}
          </div>
        </div>
        {form.interests.includes("Other") && input("interestOther", "What else?", { required: false, placeholder: "Tell us briefly" })}
        <div>
          <label htmlFor="wellness-message" className={label}>
            Anything else you&apos;d like us to know? <span className="font-normal text-rh-ink/50">(optional)</span>
          </label>
          <textarea
            id="wellness-message"
            rows={4}
            maxLength={2000}
            value={form.message}
            onChange={(e) => set("message", e.target.value)}
            className={cn(field, "h-auto resize-none py-3")}
          />
        </div>
      </Group>

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-rh-canvas p-4">
        <input
          type="checkbox"
          required
          checked={form.consent}
          onChange={(e) => set("consent", e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-rh-ink"
        />
        <span className="text-sm leading-relaxed text-rh-ink/80">
          I agree to be contacted by Rehabify about my workplace wellness check request and related next steps. I understand that my information
          will be handled in accordance with Rehabify&apos;s{" "}
          <Link href="/privacy-policy" target="_blank" className="font-semibold text-rh-ink underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </span>
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="space-y-3">
        <button
          type="submit"
          disabled={state === "sending"}
          className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rh-lime text-[15px] font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state === "sending" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Sending…
            </>
          ) : (
            <>
              Register interest <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </>
          )}
        </button>
        <p className="text-xs leading-relaxed text-rh-ink/55">
          The complimentary check is an introductory workplace physical-health review, not a comprehensive medical examination or a substitute
          for individual clinical care. Visits are subject to availability and confirmation.
        </p>
      </div>
    </form>
  );
}
