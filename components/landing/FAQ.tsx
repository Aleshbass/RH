"use client";

import React, { useState } from 'react';
import { Plus, WhatsApp } from '@/components/icons';
import { joyWhatsAppUrl } from '@/lib/joyWhatsApp';

const faqData = [
  {
    question: "How much does care cost?",
    answer: "Talking to Joy is free. Your physiotherapist's fee is confirmed before you pay, so there are no surprises. If you'd rather spread the cost, you can apply for MediLoan to pay later.",
  },
  {
    question: "What is rehabilitation?",
    answer: "Rehabilitation helps you move, work and live with less pain after an injury, surgery, a stroke or a long-term condition. A physiotherapist assesses you, then guides you with exercise, hands-on care and advice.",
  },
  {
    question: "Do I need a referral or a diagnosis?",
    answer: "No. You can start on your own by telling Joy what hurts. If a doctor has referred you, or you have scans or reports, share them with your physiotherapist.",
  },
  {
    question: "How does Rehabify work?",
    answer: "Tell Joy what's bothering you on WhatsApp. We match you with a licensed physiotherapist, usually within 24 hours. You choose a clinic, home or online visit, and Joy keeps you on track between sessions.",
  },
  {
    question: "How does online care work, and does it work?",
    answer: "Your physiotherapist assesses you over video, then guides your exercises and checks your progress. It suits many muscle and joint problems. If you need to be seen in person, your physiotherapist will tell you.",
  },
  {
    question: "Is Joy my clinician?",
    answer: "No. Joy is Rehabify's WhatsApp assistant. Joy helps you get started, book and stay on track. Your care is planned and led by a licensed physiotherapist.",
  },
];

const FAQ = () => {
  const [question, setQuestion] = useState('');

  const askJoy = (e: React.FormEvent) => {
    e.preventDefault();
    const query = question.trim() || "I have a question about Rehabify physiotherapy";
    window.open(joyWhatsAppUrl(`Hi Joy! 👋🏾 ${query}`), '_blank', 'noopener,noreferrer');
    setQuestion('');
  };

  return (
    <section id="faqs" className="bg-rh-canvas px-4 py-20 text-rh-ink scroll-mt-24 sm:px-6 lg:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <h2 className="text-[36px] font-bold leading-[1.05] tracking-tight sm:text-5xl">Questions people ask.</h2>

          {/* Anything else goes straight to Joy */}
          <form onSubmit={askJoy} className="mt-8 max-w-sm">
            <label htmlFor="faq-question-input" className="text-sm font-semibold">Ask a question</label>
            <input
              id="faq-question-input"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Do you do home visits in Abuja?"
              className="mt-2 h-12 w-full rounded-full bg-white px-5 text-sm text-rh-ink ring-1 ring-inset ring-rh-ink/10 placeholder:text-rh-ink/40 focus:outline-none focus:ring-2 focus:ring-rh-ink"
            />
            <button
              id="faq-question-submit"
              type="submit"
              className="mt-3 inline-flex h-12 items-center gap-2 rounded-full bg-rh-lime px-6 text-[15px] font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2"
            >
              <WhatsApp className="h-4 w-4" />
              Ask Joy on WhatsApp
            </button>
            <p className="mt-3 text-sm text-rh-ink/55">
              Or email{' '}
              <a href="mailto:support@physioaroundme.com" className="font-medium text-rh-ink underline-offset-4 hover:underline">
                support@physioaroundme.com
              </a>
            </p>
          </form>
        </div>

        <div className="border-b border-rh-ink/10">
          {faqData.map((item) => (
            <details key={item.question} className="group border-t border-rh-ink/10">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-lg font-semibold leading-snug sm:text-xl [&::-webkit-details-marker]:hidden">
                {item.question}
                <Plus className="h-4 w-4 shrink-0 transition-transform duration-300 group-open:rotate-45 motion-reduce:transition-none" />
              </summary>
              <p className="-mt-2 max-w-2xl pb-6 text-[15px] leading-relaxed text-rh-ink/65 sm:text-base">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;
