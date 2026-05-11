"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, Send } from 'lucide-react';

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

  const handleQuestionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    const subject = encodeURIComponent('FAQ Question from Rehabify Website');
    const body = encodeURIComponent(question.trim());
    window.open(`mailto:hello@rehabify.ng?subject=${subject}&body=${body}`, '_blank');
    setSubmitted(true);
    setQuestion('');
    setTimeout(() => setSubmitted(false), 4000);
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
            <h3 className="text-lg font-bold text-[#002e2c]">Still have a question?</h3>
            <p className="text-sm text-gray-500 mt-1">Type it below and we&apos;ll get back to you.</p>
          </div>
          {submitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-4"
            >
              <p className="text-[#005b57] font-semibold text-sm">✓ Opening your email — we&apos;ll reply soon!</p>
            </motion.div>
          ) : (
            <form onSubmit={handleQuestionSubmit} className="flex flex-col sm:flex-row gap-3">
              <input
                id="faq-question-input"
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. Do you serve Enugu State?"
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#005b57]/20 focus:border-[#005b57] text-sm text-[#002e2c] bg-gray-50"
                required
              />
              <button
                id="faq-question-submit"
                type="submit"
                className="inline-flex items-center justify-center gap-2 bg-[#005b57] hover:bg-[#00443e] text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4" />
                Ask Us
              </button>
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

