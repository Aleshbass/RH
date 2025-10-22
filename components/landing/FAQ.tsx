"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus } from 'lucide-react';

const faqData = [
  {
    question: "What is Rehabify and who is it for?",
    answer: "Rehabify is a comprehensive platform designed for physiotherapy clinics and individual therapists. It provides tools for patient management, personalized exercise prescription, telehealth consultations, and progress tracking to enhance patient care and streamline clinic operations."
  },
  {
    question: "How does the AI-powered exercise monitoring work?",
    answer: "Our platform uses advanced computer vision to monitor patients performing their prescribed exercises through their device's camera. The AI provides real-time feedback on form and adherence, ensuring patients perform exercises correctly and safely, while providing valuable data to therapists."
  },
  {
    question: "Is Rehabify compliant with health data regulations like HIPAA?",
    answer: "Yes, we take data privacy and security very seriously. Rehabify is designed to be HIPAA compliant, with all patient data encrypted in transit and at rest. We follow industry best practices to ensure the confidentiality and integrity of all sensitive information."
  },
  {
    question: "Can I integrate Rehabify with my existing clinic management software?",
    answer: "We are continuously working on expanding our integration capabilities. Currently, we offer API access for custom integrations and are developing direct integrations with popular clinic management systems. Please contact our support team to discuss your specific needs."
  },
  {
    question: "What kind of support do you offer?",
    answer: "We offer comprehensive support to all our users. This includes a detailed help center, email support, and live chat. For enterprise clients, we also provide dedicated account managers and personalized onboarding sessions to ensure a smooth transition."
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
            We&apos;ve got the answers
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
            <p className="text-gray-600">Still have more questions? <a href="/sign-up" className="text-[#005b57] hover:underline">Contact our help center</a>.</p>
        </div>
      </div>
    </section>
  );
};

export default FAQ;
