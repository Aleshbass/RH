"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, Send, Mail } from 'lucide-react';
import { IconBrandWhatsapp } from '@tabler/icons-react';

const faqData = [
  {
    question: "How quickly can I get an appointment?",
    answer: "Most patients get matched and booked within 24 hours. Urgent cases often same-day."
  },
  {
    question: "Do you work with my doctor?",
    answer: "Yes! If you're referred by a doctor, we send them progress updates with your permission. You can also share your session notes and recovery data."
  },
  {
    question: "What if I need to cancel?",
    answer: "Cancel or reschedule up to 6 hours before your session with no penalty. Less than 6 hours = one-time warning, repeat cancellations may forfeit package discounts."
  },
  {
    question: "How do packages work?",
    answer: "Book 4, 6, or 8 sessions together and save. Pay upfront, and lock in your schedule."
  },
  {
    question: "Can I switch physiotherapists?",
    answer: "Absolutely. If it's not the right fit after your first session, we'll rematch you at no extra cost."
  },
  {
    question: "Do you accept HMO coverage?",
    answer: "Currently, we do not accept HMO coverage. We are actively working on bringing this to you soon."
  }
];

interface FaqItemProps {
  item: { question: string; answer: string };
  isOpen: boolean;
  onClick: () => void;
}

const FaqItem = ({ item, isOpen, onClick }: FaqItemProps) => {
  return (
    <div className="border-b border-[#002e2c]/20 py-6">
      <button
        className="w-full flex justify-between items-center text-left text-lg md:text-xl font-medium text-[#002e2c] cursor-pointer"
        onClick={onClick}
      >
        <span>{item.question}</span>
        {isOpen ? <Minus className="text-[#005b57]" /> : <Plus className="text-[#002e2c]" />}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <p className="pt-4 text-gray-700">
              {item.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const FAQ = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [question, setQuestion] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleClick = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const handleWhatsAppSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = question.trim() || "I have a question about Rehabify physiotherapy";
    const waUrl = `https://wa.me/2348061525811?text=${encodeURIComponent(`Hi Joy! 👋🏾 ${query}`)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    setSubmitted(true);
    setQuestion('');
    setTimeout(() => setSubmitted(false), 5000);
  };

  const handleEmailSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = question.trim() || "I have a question about Rehabify physiotherapy";
    const subject = encodeURIComponent('FAQ Question — PhysioAroundMe / Rehabify');
    const body = encodeURIComponent(query);
    window.location.href = `mailto:support@physioaroundme.com?subject=${subject}&body=${body}`;
    setSubmitted(true);
    setQuestion('');
    setTimeout(() => setSubmitted(false), 5000);
  };

  return (
    <section className="bg-[#FAF6E7] text-[#002e2c] py-20">
      <div className="container mx-auto px-6 lg:px-8 max-w-4xl">
        <div className="text-center mb-12">
          <span className="text-sm font-bold tracking-wider uppercase text-[#005b57]">
            FAQs
          </span>
          <h2 className="text-4xl md:text-5xl font-bold mt-2">
            Frequently Asked Questions
          </h2>
        </div>
        <div>
          {faqData.map((item, index) => (
            <FaqItem
              key={index}
              item={item}
              isOpen={activeIndex === index}
              onClick={() => handleClick(index)}
            />
          ))}
        </div>

        {/* Inline question submission */}
        <div className="mt-14 bg-white rounded-2xl border border-[#005b57]/10 p-6 sm:p-8 shadow-sm">
          <div className="text-center mb-6">
            <h3 className="text-lg font-bold text-[#002e2c]">Still have questions?</h3>
            <p className="text-sm text-gray-500 mt-1">Ask Joy directly on WhatsApp or send an email to our clinical care team.</p>
          </div>
          {submitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-4 bg-emerald-50 rounded-xl border border-emerald-200"
            >
              <p className="text-[#005b57] font-semibold text-sm">✓ Opening your inquiry — our team will reply shortly!</p>
            </motion.div>
          ) : (
            <form onSubmit={handleWhatsAppSubmit} className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  id="faq-question-input"
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. Do you serve home visits in Ikeja or Abuja?"
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#005b57]/20 focus:border-[#005b57] text-sm text-[#002e2c] bg-gray-50"
                  required
                />
                <button
                  id="faq-question-submit"
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 bg-[#008069] hover:bg-[#006653] text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors cursor-pointer shadow-sm"
                >
                  <IconBrandWhatsapp className="w-4 h-4" />
                  Ask on WhatsApp
                </button>
                <button
                  type="button"
                  onClick={handleEmailSubmit}
                  className="inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold px-5 py-3 rounded-xl text-sm border border-gray-300 transition-colors cursor-pointer"
                >
                  <Mail className="w-4 h-4 text-gray-500" />
                  Email Support
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between text-xs text-gray-400 px-1 pt-1">
                <span>Instant response via Joy WhatsApp AI</span>
                <span>or email <a href="mailto:support@physioaroundme.com" className="text-[#005b57] hover:underline font-medium">support@physioaroundme.com</a></span>
              </div>
            </form>
          )}
        </div>

        <div className="text-center mt-8">
          <p className="text-gray-500 text-sm">Or browse our full <a href="/faqs" className="text-[#005b57] hover:underline font-medium">FAQ page</a>.</p>
        </div>
      </div>
    </section>
  );
};

export default FAQ;

