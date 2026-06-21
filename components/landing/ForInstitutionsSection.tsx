"use client";

import React, { useState } from 'react';
import { Brain, Smartphone, Building2, ClipboardPlus, Mail, ArrowDown, CheckCircle2, Loader2 } from 'lucide-react';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

export function ForInstitutionsSection() {
  const submitInquiry = useMutation(api.public.submitPartnershipInquiry);
  
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    organization: '',
    message: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      await submitInquiry(formData);
      setIsSuccess(true);
      setTimeout(() => {
        setIsOpen(false);
        setIsSuccess(false);
        setFormData({ name: '', email: '', organization: '', message: '' });
      }, 3000);
    } catch (error) {
      console.error("Failed to submit inquiry:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const cards = [
    {
      icon: <Brain className="w-6 h-6 text-[#008069]" strokeWidth={2.5} />,
      title: "Rehabify Predict",
      description: "Joy-powered AI triage via WhatsApp. Local dialects. Voice note reading."
    },
    {
      icon: <Smartphone className="w-6 h-6 text-[#008069]" strokeWidth={2.5} />,
      title: "Rehabify Companion",
      description: "Computer vision form correction, exercise prescription, VR rehab."
    },
    {
      icon: <Building2 className="w-6 h-6 text-[#008069]" strokeWidth={2.5} />,
      title: "Hospital Referral Network",
      description: "No physio department? We are your physio department. Same-day matching."
    },
    {
      icon: <ClipboardPlus className="w-6 h-6 text-[#008069]" strokeWidth={2.5} />,
      title: "HMO Integration",
      description: "HMO-compatible documentation, pre-auth workflows, and outcomes data."
    }
  ];

  return (
    <section className="w-full py-24 bg-[#FAFAFA] relative">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center mb-16">
          <p className="text-sm font-bold tracking-widest text-[#008069] uppercase mb-4">
            FOR INSTITUTIONS
          </p>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#1a1a2e] mb-6 font-cal leading-[1.1]">
            Rehabify for hospitals,<br className="hidden sm:block" /> HMOs, and corporates.
          </h2>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {cards.map((card, index) => (
            <div 
              key={index} 
              className={`bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300 ${
                index === 3 ? "lg:col-start-1 lg:row-start-2" : ""
              }`}
            >
              <div className="w-12 h-12 bg-[#E8F5E9] rounded-xl flex items-center justify-center mb-6">
                {card.icon}
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{card.title}</h3>
              <p className="text-gray-500 leading-relaxed text-[15px]">
                {card.description}
              </p>
            </div>
          ))}
        </div>

        {/* CTA Button */}
        <div className="flex flex-col items-center justify-center relative pb-8">
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <button className="flex items-center gap-2 px-8 py-4 bg-white border border-[#008069] rounded-full text-[#008069] font-semibold text-[15px] hover:bg-[#F2FBF7] transition-colors shadow-sm relative z-10 group">
                <Mail className="w-5 h-5 text-[#008069]" />
                Talk to our partnerships team
              </button>
            </DialogTrigger>
            
            <DialogContent className="sm:max-w-md bg-white">
              <DialogHeader>
                <DialogTitle className="text-2xl font-cal text-[#008069]">Partner with us</DialogTitle>
                <DialogDescription className="text-gray-600">
                  Fill out this form and our partnership team will reach out to you within 24 hours.
                </DialogDescription>
              </DialogHeader>
              
              {isSuccess ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Message Sent!</h3>
                  <p className="text-gray-500">We've received your inquiry and will be in touch shortly.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Full Name</label>
                    <Input 
                      required 
                      placeholder="Dr. Sarah Johnson" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Work Email</label>
                    <Input 
                      required 
                      type="email" 
                      placeholder="sarah@hospital.com" 
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Organization</label>
                    <Input 
                      required 
                      placeholder="Lagos University Teaching Hospital" 
                      value={formData.organization}
                      onChange={(e) => setFormData({...formData, organization: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">How can we help?</label>
                    <Textarea 
                      required 
                      placeholder="We are interested in integrating Rehabify Predict into our triage workflow..." 
                      className="min-h-[100px]"
                      value={formData.message}
                      onChange={(e) => setFormData({...formData, message: e.target.value})}
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-[#008069] hover:bg-[#006653] text-white py-6 text-lg font-medium"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Sending Inquiry...
                      </>
                    ) : (
                      "Submit Inquiry"
                    )}
                  </Button>
                </form>
              )}
            </DialogContent>
          </Dialog>

          {/* Floating Down Arrow Badge */}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center border border-gray-100 z-0">
            <ArrowDown className="w-4 h-4 text-[#008069]" />
          </div>
        </div>

      </div>
    </section>
  );
}
