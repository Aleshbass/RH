"use client";

import { useState } from "react";
import {
  Banknote,
  ShieldCheck,
  Clock,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
  User,
  Phone,
  Mail
} from "lucide-react";

const STEPS = [
  {
    number: "01",
    title: "Book Your Session",
    description:
      "Choose your physiotherapist and book a session on Rehabify as usual.",
    icon: Clock,
  },
  {
    number: "02",
    title: "Apply for MediLoan",
    description:
      "On the booking page, click 'Seek Loan from MediLoan', fill in your details, and submit — it takes under 2 minutes.",
    icon: Banknote,
  },
  {
    number: "03",
    title: "Get Approved Instantly",
    description:
      "MediLoan sends you a quick application link via SMS. Apply in minutes.",
    icon: ShieldCheck,
  },
  {
    number: "04",
    title: "Start Treatment",
    description:
      "Once approved, your treatment is funded immediately. Repay MediLoan at your pace.",
    icon: CheckCircle2,
  },
];

const BENEFITS = [
  "Zero upfront payment for your physiotherapy",
  "Quick SMS-based application — no paperwork",
  "Flexible repayment plans that suit your budget",
  "Get treated immediately, don't delay recovery",
];

const FAQ_ITEMS = [
  {
    q: "Who is MediLoan?",
    a: "MediLoan is a healthcare financing service powered by MyItura. They provide short-term medical loans so patients can access treatment immediately and repay over time. MediLoan is an independent company and is not owned or operated by Rehabify.",
  },
  {
    q: "How do I apply?",
    a: "Directly on the booking page, click 'Seek Loan from Our Partners — MediLoan', fill in your name, phone number, and optional email, then submit. MediLoan will send you an SMS with a secure link to complete your application — no paperwork, no waiting. The whole process takes under 2 minutes.",
  },
  {
    q: "What if I have an issue with my loan?",
    a: "All loan-related matters — approvals, repayments, disputes — are handled directly by MediLoan (MyItura). Rehabify facilitates the connection but does not manage or guarantee loan outcomes. Contact MediLoan's support team for any loan inquiries.",
  },
];

function LandingMediLoanWidget() {
  const [state, setState] = useState<"idle" | "open" | "submitting" | "success" | "error">("idle");
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
      } catch (err: any) {
          setError(err.message || "Something went wrong. Please try again.");
          setState("error");
      }
  };

  if (state === "idle") {
      return (
          <div className="relative bg-gradient-to-br from-emerald-600/20 to-teal-600/10 backdrop-blur-sm border border-emerald-500/30 rounded-2xl p-8 flex flex-col justify-between overflow-hidden h-full">
            <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="relative z-10 flex flex-col h-full justify-center">
              <h3 className="text-white text-2xl font-semibold mb-4">
                Seek Loan
              </h3>
              <p className="text-gray-300 text-[15px] leading-relaxed mb-8">
                Get treated now, pay later. Apply for MediLoan directly right now and our team will contact you immediately to match you with a physiotherapist and process your loan.
              </p>

              <button
                onClick={() => setState("open")}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-emerald-900/30 hover:shadow-emerald-800/40"
              >
                Seek Loan Now
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
      );
  }

  // Success state
  if (state === "success") {
      return (
          <div className="relative bg-gradient-to-br from-emerald-600/20 to-teal-600/10 backdrop-blur-sm border border-emerald-500/30 rounded-2xl p-8 flex flex-col justify-between overflow-hidden h-full">
            <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="relative z-10 flex flex-col h-full justify-center">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="text-white font-semibold text-lg">Request Received!</h3>
                        <p className="text-emerald-400/80 text-sm">The Rehabify team has been notified</p>
                    </div>
                </div>
                <p className="text-gray-300 text-[15px] leading-relaxed mb-4">
                    Your MediLoan request has been submitted successfully. We will review it and
                    initiate your loan.
                </p>
                <p className="text-emerald-300/90 text-sm leading-relaxed">
                    You&#39;ll receive an SMS from MediLoan with
                    a secure link to complete your application shortly.
                </p>
            </div>
          </div>
      );
  }

  // Form State
  return (
      <div className="relative bg-gradient-to-br from-emerald-600/20 to-teal-600/10 backdrop-blur-sm border border-emerald-500/30 rounded-2xl p-6 sm:p-8 flex flex-col justify-between overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                  <div>
                      <h3 className="text-white text-lg font-semibold">Apply for MediLoan</h3>
                      <p className="text-emerald-400/70 text-sm">Independent financing by MyItura</p>
                  </div>
                  <button onClick={() => { setState("idle"); setError(""); }} className="text-gray-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors">
                      <X className="w-5 h-5" />
                  </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                      <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                          <input type="text" placeholder="First name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full bg-[#111916]/80 border border-emerald-900/30 rounded-xl pl-9 pr-3 py-3 text-white text-sm focus:border-emerald-500/60 focus:outline-none transition-colors" />
                      </div>
                      <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                          <input type="text" placeholder="Last name" required value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full bg-[#111916]/80 border border-emerald-900/30 rounded-xl pl-9 pr-3 py-3 text-white text-sm focus:border-emerald-500/60 focus:outline-none transition-colors" />
                      </div>
                  </div>

                  <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                      <input type="tel" placeholder="Phone number (must receive SMS)" required value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-[#111916]/80 border border-emerald-900/30 rounded-xl pl-9 pr-3 py-3 text-white text-sm focus:border-emerald-500/60 focus:outline-none transition-colors" />
                  </div>
                  
                  <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                      <input type="email" placeholder="Email address (optional)" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-[#111916]/80 border border-emerald-900/30 rounded-xl pl-9 pr-3 py-3 text-white text-sm focus:border-emerald-500/60 focus:outline-none transition-colors" />
                  </div>

                  <div className="relative">
                      <textarea placeholder="Describe your symptoms or condition (e.g. lower back pain)" required value={symptoms} onChange={(e) => setSymptoms(e.target.value)} className="w-full bg-[#111916]/80 border border-emerald-900/30 rounded-xl px-4 py-3 text-white text-sm focus:border-emerald-500/60 focus:outline-none transition-colors min-h-[80px] resize-none" />
                  </div>

                  {error && <p className="text-red-400 text-xs bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">{error}</p>}

                  <button type="submit" disabled={state === "submitting"} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-all flex items-center justify-center gap-2 mt-2 shadow-lg shadow-emerald-900/20">
                      {state === "submitting" ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : <><Banknote className="w-4 h-4" /> Submit Application</>}
                  </button>
              </form>
          </div>
      </div>
  );
}

export function MediloanSection() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <section className="relative py-20 sm:py-28 overflow-hidden" id="mediloan">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#002e2c] via-[#003d38] to-[#002e2c]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(0,91,87,0.15)_0%,transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_80%,rgba(0,91,87,0.10)_0%,transparent_50%)]" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6">
            <Banknote className="w-4 h-4 text-emerald-400" />
            <span className="text-emerald-400 text-sm font-medium tracking-wide">
              Healthcare Financing Partner
            </span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 tracking-tight">
            Get Treated Now,{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              Pay Later
            </span>
          </h2>

          <p className="text-gray-400 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed">
            Don't let cost delay your recovery. Through our partner{" "}
            <span className="text-emerald-400 font-semibold">MediLoan</span>,
            you can access physiotherapy treatment now and pay at your own pace.
          </p>
        </div>

        {/* How It Works — Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-16">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className="group relative bg-[#111916]/60 backdrop-blur-sm border border-emerald-900/30 rounded-2xl p-6 hover:border-emerald-500/40 transition-all duration-300 hover:shadow-[0_0_30px_-10px_rgba(16,185,129,0.15)]"
              >
                {/* Step number */}
                <span className="text-emerald-500/30 text-5xl font-black absolute top-4 right-5 select-none group-hover:text-emerald-500/50 transition-colors">
                  {step.number}
                </span>

                <div className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4 group-hover:bg-emerald-500/20 transition-colors">
                  <Icon className="w-5 h-5 text-emerald-400" />
                </div>

                <h3 className="text-white font-semibold text-lg mb-2">
                  {step.title}
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  {step.description}
                </p>

                {/* Connector arrow (not on last) */}
                {idx < STEPS.length - 1 && (
                  <div className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 z-20">
                    <ArrowRight className="w-5 h-5 text-emerald-700/60" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Benefits + CTA */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16 items-stretch">
          {/* Benefits */}
          <div className="bg-[#111916]/50 backdrop-blur-sm border border-emerald-900/30 rounded-2xl p-8 h-full">
            <h3 className="text-white text-xl font-semibold mb-6">
              Why Choose MediLoan?
            </h3>
            <ul className="space-y-4">
              {BENEFITS.map((benefit, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-300 text-[15px]">{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* CTA Card replaces old text block */}
          <LandingMediLoanWidget />
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h3 className="text-white text-xl font-semibold text-center mb-6">
            Frequently Asked Questions
          </h3>
          <div className="space-y-3">
            {FAQ_ITEMS.map((item, i) => (
              <div
                key={i}
                className="bg-[#111916]/50 border border-emerald-900/20 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left group"
                >
                  <span className="text-white font-medium text-[15px] group-hover:text-emerald-400 transition-colors">
                    {item.q}
                  </span>
                  {openFaq === i ? (
                    <ChevronUp className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  )}
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4">
                    <p className="text-gray-400 text-sm leading-relaxed">
                      {item.a}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
