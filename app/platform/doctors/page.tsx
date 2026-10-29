"use client";

import { Check, FileText, Wallet } from "@/components/icons";
import PlatformPageLayout, { type PlatformFeature } from "@/components/platform/PlatformPageLayout";
import { cn } from "@/lib/utils";

const FEATURES: PlatformFeature[] = [
  { title: "Refer in a minute", description: "Name, WhatsApp number, condition and where they'd like to be seen. Attach a letter if you have one." },
  { title: "We reach them for you", description: "Our care team contacts your patient on WhatsApp and helps them book." },
  { title: "Verified physiotherapists", description: "Registered physios in clinics, at home or online, across Nigeria." },
  { title: "Updates at every step", description: "Received, contacted, booked, seen, in treatment and discharged. In your portal and by email." },
  { title: "Reports back to you", description: "The treating physio shares progress and discharge reports, with the patient's agreement." },
  { title: "Your own link and QR code", description: "Share it on WhatsApp, or print it for your consulting room." },
  { title: "Commission on their care", description: "Earn on what your patients pay for their sessions, paid to your bank account monthly." },
  { title: "Free to join", description: "No fees. We check your MDCN licence before you start referring." },
];

const STEPS = [
  { title: "You refer", body: "Send the patient's details from your portal, or give them your link or QR code." },
  { title: "We take it from there", body: "We contact them on WhatsApp, match them with a verified physio and help them book." },
  { title: "You stay in the loop", body: "Follow each step as it happens, and read the physio's reports when they share them." },
];

const TIMELINE = [
  { label: "Received", date: "2 Oct", state: "done" },
  { label: "Contacted", date: "2 Oct", state: "done" },
  { label: "Booked", date: "3 Oct", state: "done" },
  { label: "Seen", date: "6 Oct", state: "current" },
  { label: "In treatment", date: "", state: "upcoming" },
  { label: "Discharged", date: "", state: "upcoming" },
] as const;

function HowItWorks() {
  return (
    <section className="px-4 pb-20 sm:px-6 lg:pb-28">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-xl text-[30px] font-bold leading-[1.1] tracking-tight text-rh-ink sm:text-[40px]">How it works</h2>
        <ol className="mt-8 grid gap-5 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="rounded-[2rem] bg-white p-7 sm:p-8">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rh-ink text-[15px] font-bold text-white">{i + 1}</span>
              <h3 className="mt-5 text-[20px] font-bold tracking-tight text-rh-ink">{step.title}</h3>
              <p className="mt-2 text-[15px] font-medium leading-relaxed text-rh-ink/70">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** What a referral looks like in the doctor's portal (an illustration, not live data). */
function WhatYouSee() {
  return (
    <section className="px-4 pb-20 sm:px-6 lg:pb-28">
      <div className="mx-auto grid max-w-6xl items-center gap-10 rounded-[2rem] bg-white p-7 sm:p-10 lg:grid-cols-2 lg:gap-14 lg:p-14">
        <div>
          <h2 className="max-w-md text-[30px] font-bold leading-[1.1] tracking-tight text-rh-ink sm:text-[40px]">See every patient you refer, to discharge.</h2>
          <ul className="mt-6 space-y-3">
            {[
              "Where each patient is now, with the date of every step",
              "Who is treating them: the physio or the clinic",
              "Progress and discharge reports from the physio",
              "An update in your portal and by email at each step",
            ].map((line) => (
              <li key={line} className="flex gap-3 text-[15px] font-medium text-rh-ink/80">
                <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-rh-ink" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        <div aria-hidden className="rounded-[1.75rem] border border-rh-ink/10 bg-rh-canvas p-5 sm:p-6">
          <div className="rounded-2xl bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[15px] font-semibold text-rh-ink">Ada O.</p>
                <p className="text-[13px] text-rh-ink/60">Post-op ACL repair · with Tunde A.</p>
              </div>
              <span className="rounded-full bg-[#e9f0fe] px-2.5 py-0.5 text-[11px] font-semibold leading-5 text-[#2a55c4]">Seen</span>
            </div>
            <ol className="mt-5 space-y-3">
              {TIMELINE.map((step) => (
                <li key={step.label} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                      step.state === "done" && "bg-rh-lime text-rh-ink",
                      step.state === "current" && "bg-rh-ink",
                      step.state === "upcoming" && "border border-rh-ink/15 bg-white"
                    )}
                  >
                    {step.state === "done" && <Check className="h-2.5 w-2.5" />}
                    {step.state === "current" && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  <span className={cn("flex-1 text-sm font-medium", step.state === "upcoming" ? "text-rh-ink/40" : "text-rh-ink")}>{step.label}</span>
                  {step.date && <span className="text-xs text-rh-ink/50">{step.date}</span>}
                </li>
              ))}
            </ol>
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-rh-ink/10 px-3 py-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e9f0fe] text-[#2a55c4]">
                <FileText className="h-4 w-4" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium text-rh-ink">Progress report</span>
                <span className="block text-xs text-rh-ink/55">Shared by the physio</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Commission() {
  return (
    <section className="px-4 pb-20 sm:px-6 lg:pb-28">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 rounded-[2rem] bg-white p-7 sm:flex-row sm:items-center sm:p-10">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-rh-canvas text-rh-ink">
          <Wallet className="h-6 w-6" />
        </span>
        <div className="max-w-3xl">
          <h2 className="text-[24px] font-bold tracking-tight text-rh-ink sm:text-[28px]">Earn a commission on the care you refer</h2>
          <p className="mt-2 text-[15px] font-medium leading-relaxed text-rh-ink/70 sm:text-base">
            You earn on what patients you referred pay for their sessions, under terms Rehabify agrees with you. Approved commission is paid to your
            Nigerian bank account every month, and your portal shows every naira.
          </p>
        </div>
      </div>
    </section>
  );
}

export default function DoctorsPage() {
  return (
    <PlatformPageLayout
      title="Refer a patient in a minute. Follow them to discharge."
      description="Send patients to verified physiotherapists. We reach them on WhatsApp, and you see every step, with reports back from the physio."
      features={FEATURES}
      featuresTitle="What you get as a referring doctor"
      ctaText="Join as a referring doctor"
      ctaLink="/sign-up?as=doctor"
      image={{
        src: "https://res.cloudinary.com/dubeogufg/image/upload/f_auto,q_auto/v1741105204/IMG_6327_ffervx.png",
        alt: "A doctor reviewing a patient referral",
        unoptimized: true,
      }}
      closingTitle="Start referring today."
      closingText="Sign up in two minutes. We check your licence, then your referral portal opens."
    >
      <HowItWorks />
      <WhatYouSee />
      <Commission />
    </PlatformPageLayout>
  );
}
