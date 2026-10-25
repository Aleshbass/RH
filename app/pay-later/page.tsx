"use client";

import Image from "next/image";
import { useState } from "react";
import { ArrowRight, Loader2, Plus } from "@/components/icons";
import { joyWhatsAppUrl } from "@/lib/joyWhatsApp";

const MEDILOAN_LOGO = "https://loans.myitura.com/static/assets/logos/mediloan.svg?v=a5762be08a39";

const STEPS = [
  { title: "Tell us about you", body: "Your name, phone number and what is bothering you. It takes about two minutes." },
  { title: "Get your MediLoan link", body: "MediLoan sends a secure application link to your phone by SMS." },
  { title: "Review and apply", body: "Check the repayments, charges and late-payment terms before you agree." },
  { title: "Start treatment", body: "Once MediLoan approves you, we match you with a physiotherapist. Repay at your own pace." },
];

const FAQ_ITEMS = [
  {
    q: "Who is MediLoan?",
    a: "MediLoan is a healthcare financing service powered by MyItura. They provide short-term medical loans so patients can access treatment immediately and repay over time. MediLoan is an independent company and is not owned or operated by Rehabify.",
  },
  {
    q: "Can I apply while booking?",
    a: "Yes. On the booking page, choose 'Seek Loan from MediLoan' and fill in your details. You can also apply on this page and the team will match you with a physiotherapist.",
  },
  {
    q: "What should I check before I agree?",
    a: "Read the repayments, any charges and the late-payment terms in your MediLoan application. Only go ahead once you are happy with them.",
  },
  {
    q: "What if I have an issue with my loan?",
    a: "All loan-related matters (approvals, repayments, disputes) are handled directly by MediLoan (MyItura). Rehabify facilitates the connection but does not manage or guarantee loan outcomes. Contact MediLoan's support team for any loan inquiries.",
  },
];

const input =
  "mt-1.5 h-12 w-full rounded-xl bg-rh-canvas px-4 text-[15px] text-rh-ink ring-1 ring-inset ring-rh-ink/10 placeholder:text-rh-ink/40 focus:outline-none focus:ring-2 focus:ring-rh-ink";
const label = "block text-sm font-semibold text-rh-ink";

function ApplyCard() {
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setState("submitting");
    try {
      const res = await fetch("/api/myitura/loan-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim(),
          treatment: `General Booking: ${symptoms.trim()}`,
          treatmentAmount: undefined,
          physiotherapistName: "General Landing Page Booking",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to submit loan request.");
      setState("success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setState("error");
    }
  };

  if (state === "success") {
    return (
      <div className="rounded-[2rem] bg-white p-6 sm:p-8" role="status">
        <span className="inline-flex rounded-full bg-rh-lime px-3 py-1 text-xs font-semibold text-rh-ink">Request received</span>
        <h2 className="mt-4 text-2xl font-bold leading-tight text-rh-ink">Check your phone for MediLoan&apos;s SMS.</h2>
        <p className="mt-3 text-[15px] font-medium leading-relaxed text-rh-ink/75">
          It has a secure link to finish your application. The Rehabify team has your request and will match you with a
          physiotherapist.
        </p>
      </div>
    );
  }

  return (
    <form id="apply" onSubmit={handleSubmit} className="scroll-mt-28 rounded-[2rem] bg-white p-6 sm:p-8">
      <h2 className="text-2xl font-bold leading-tight text-rh-ink">Apply for MediLoan</h2>
      <p className="mt-1 text-sm text-rh-ink/60">Independent financing by MyItura</p>

      <div className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="ml-first" className={label}>First name</label>
            <input id="ml-first" required autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={input} />
          </div>
          <div>
            <label htmlFor="ml-last" className={label}>Last name</label>
            <input id="ml-last" required autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} className={input} />
          </div>
        </div>
        <div>
          <label htmlFor="ml-phone" className={label}>Phone number</label>
          <input id="ml-phone" type="tel" required autoComplete="tel" placeholder="It must receive SMS" value={phone} onChange={(e) => setPhone(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor="ml-email" className={label}>
            Email <span className="font-normal text-rh-ink/50">(optional)</span>
          </label>
          <input id="ml-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor="ml-symptoms" className={label}>What is bothering you?</label>
          <textarea
            id="ml-symptoms"
            required
            placeholder="e.g. lower back pain for three weeks"
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            className={`${input} min-h-[96px] resize-none py-3`}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={state === "submitting"}
        className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rh-lime text-[15px] font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2"
      >
        {state === "submitting" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Sending…
          </>
        ) : (
          <>
            Send my application <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
      <p className="mt-3 text-xs leading-relaxed text-rh-ink/55">
        Subject to MediLoan&apos;s approval and terms. Rehabify does not approve or manage loans.
      </p>
    </form>
  );
}

export default function PayLaterPage() {
  return (
    <main className="min-h-screen bg-rh-canvas px-4 pb-24 pt-32 sm:px-6 sm:pt-40">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div>
            <Image src={MEDILOAN_LOGO} alt="MediLoan by MyItura" width={160} height={48} unoptimized className="h-10 w-auto" />
            <h1 className="mt-7 text-[40px] font-bold leading-[1.04] tracking-tight text-rh-ink sm:text-[56px]">
              Get treated now,{" "}
              <span className="relative inline-block">
                pay later.
                <span aria-hidden className="absolute -bottom-1 left-0 h-[0.12em] w-full rounded-full bg-rh-lime" />
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg font-medium leading-relaxed text-rh-ink/75">
              Spread the cost of your physiotherapy with MediLoan, healthcare financing from our partner MyItura, subject
              to approval and the lender&apos;s terms.
            </p>

            <ol className="mt-10 max-w-xl">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-5 border-t border-rh-ink/10 py-5">
                  <span className="w-6 shrink-0 pt-0.5 text-sm tabular-nums text-rh-ink/40">{String(i + 1).padStart(2, "0")}</span>
                  <span>
                    <span className="block text-[17px] font-semibold text-rh-ink">{step.title}</span>
                    <span className="mt-1 block text-[15px] font-medium leading-relaxed text-rh-ink/70">{step.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="lg:sticky lg:top-28 lg:self-start">
            <ApplyCard />
          </div>
        </div>

        <section className="mt-24 grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <h2 className="text-[32px] font-bold leading-tight tracking-tight text-rh-ink sm:text-[40px]">Good to know.</h2>
            <a
              href={joyWhatsAppUrl("Hi Joy, I have a question about paying later with MediLoan.")}
              target="_blank"
              rel="noopener noreferrer"
              className="group mt-5 inline-flex items-center gap-2 text-[15px] font-semibold text-rh-ink underline-offset-4 hover:underline"
            >
              Ask Joy a question
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
          </div>
          <div className="border-b border-rh-ink/10">
            {FAQ_ITEMS.map((item) => (
              <details key={item.q} className="group border-t border-rh-ink/10">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-lg font-semibold text-rh-ink [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <Plus className="h-4 w-4 shrink-0 transition-transform duration-300 group-open:rotate-45 motion-reduce:transition-none" />
                </summary>
                <p className="-mt-1 max-w-2xl pb-5 text-[15px] leading-relaxed text-rh-ink/70">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
