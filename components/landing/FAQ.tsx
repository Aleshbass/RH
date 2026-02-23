"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus } from 'lucide-react';

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

  const handleClick = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
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
        <div className="text-center mt-12">
          <p className="text-gray-600">Visit our full <a href="/faqs" className="text-[#005b57] hover:underline font-medium">FAQ page</a> if you have more questions.</p>
        </div>
      </div>
    </section>
  );
};

export default FAQ;
