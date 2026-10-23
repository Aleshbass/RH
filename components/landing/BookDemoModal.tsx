"use client";

import React, { useState } from "react";
import Image from "next/image";
import { X, Loader2, CheckCircle2, Mail, Phone, Building2, MessageSquare } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface BookDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BookDemoModal({ isOpen, onClose }: BookDemoModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    clinicName: "",
    message: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/book-demo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Demo request sent!", {
          description: "We'll contact you within 24 hours to schedule your demo.",
          duration: 5000,
        });
        setFormData({
          name: "",
          email: "",
          phone: "",
          clinicName: "",
          message: "",
        });
        onClose();
      } else {
        throw new Error(data.error || "Failed to send request");
      }
    } catch (error) {
      console.error("Error booking demo:", error);
      toast.error("Failed to send request", {
        description: "Please try again or contact rehabify.app@gmail.com",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-7xl bg-white text-gray-900 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/90 hover:bg-white shadow-lg transition-all hover:scale-110"
          aria-label="Close"
        >
          <X className="h-5 w-5 text-gray-700" />
        </button>

        <div className="flex flex-col md:flex-row">
          {/* Left side - Form */}
          <div className="flex-1 p-8 lg:p-12 pr-6 max-h-[75vh] overflow-y-auto">
            {/* Header */}
            <div className="mb-8">
              <div className="inline-block px-4 py-1 bg-[#005b57]/10 text-[#005b57] rounded-full text-sm font-semibold mb-4">
                Schedule Your Demo
              </div>
              <h2 className="text-3xl lg:text-4xl font-bold text-[#002e2c] mb-3">
                See Rehabify in Action
              </h2>
              <p className="text-gray-600 text-lg">
                Discover how our platform can transform your physiotherapy practice. We'll show you everything you need to know.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <Label htmlFor="name" className="text-sm font-semibold text-gray-700">
                    Full Name *
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="John Doe"
                    className="mt-2 h-11 bg-white text-gray-900 placeholder:text-gray-500"
                  />
                </div>

                <div>
                  <Label htmlFor="email" className="text-sm font-semibold text-gray-700">
                    Email Address *
                  </Label>
                  <div className="relative mt-2">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      placeholder="john@example.com"
                      className="pl-10 h-11 bg-white text-gray-900 placeholder:text-gray-500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <Label htmlFor="phone" className="text-sm font-semibold text-gray-700">
                    Phone Number
                  </Label>
                  <div className="relative mt-2">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                      placeholder="+234 800 000 0000"
                      className="pl-10 h-11 bg-white text-gray-900 placeholder:text-gray-500"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="clinicName" className="text-sm font-semibold text-gray-700">
                    Clinic/Practice Name
                  </Label>
                  <div className="relative mt-2">
                    <Building2 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="clinicName"
                      type="text"
                      value={formData.clinicName}
                      onChange={(e) =>
                        setFormData({ ...formData, clinicName: e.target.value })
                      }
                      placeholder="My Physiotherapy Clinic"
                      className="pl-10 h-11 bg-white text-gray-900 placeholder:text-gray-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="message" className="text-sm font-semibold text-gray-700">
                  Tell us about your practice
                </Label>
                <div className="relative mt-2">
                  <MessageSquare className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) =>
                      setFormData({ ...formData, message: e.target.value })
                    }
                    placeholder="Number of physiotherapists, current challenges, what you're looking for..."
                    rows={4}
                    className="pl-10 resize-none bg-white text-gray-900 placeholder:text-gray-500"
                  />
                </div>
              </div>

              {/* What to Expect */}
              <div className="bg-gradient-to-br from-[#005b57]/5 to-[#005b57]/10 rounded-xl p-5 border border-[#005b57]/20">
                <h4 className="font-semibold text-[#002e2c] mb-3 flex items-center">
                  <CheckCircle2 className="h-5 w-5 text-[#005b57] mr-2" />
                  What to Expect
                </h4>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-start">
                    <span className="text-[#005b57] mr-2">•</span>
                    <span>30-minute personalized walkthrough of Rehabify</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-[#005b57] mr-2">•</span>
                    <span>See features tailored to your practice needs</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-[#005b57] mr-2">•</span>
                    <span>Q&A session with our product experts</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-[#005b57] mr-2">•</span>
                    <span>Custom pricing and implementation discussion</span>
                  </li>
                </ul>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="flex-1 h-12 border-black text-black hover:bg-black hover:text-white"
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 h-12 bg-[#005b57] hover:bg-[#00443e] text-base font-semibold"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Sending Request...
                    </>
                  ) : (
                    <>
                      Schedule My Demo
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>

          {/* Right side - Image */}
          <div className="hidden md:block md:w-[45%] relative bg-gradient-to-br from-[#002e2c] to-[#005b57] max-h-[75vh]">
            <div className="absolute inset-0 bg-black/20" />
            <Image
              src="/logos/images/platform.jpeg"
              alt="Rehabify Platform Dashboard"
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 flex flex-col justify-end p-12 text-white">
              <div className="space-y-4">
                <h3 className="text-3xl font-bold">
                  Join 500+ Clinics
                </h3>
                <p className="text-lg text-gray-200">
                  Transform your practice with intelligent patient management, exercise prescription, and telehealth capabilities.
                </p>
                <div className="grid grid-cols-2 gap-4 pt-6">
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                    <div className="text-3xl font-bold">98%</div>
                    <div className="text-sm text-gray-200">Satisfaction Rate</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                    <div className="text-3xl font-bold">40%</div>
                    <div className="text-sm text-gray-200">Time Saved</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
