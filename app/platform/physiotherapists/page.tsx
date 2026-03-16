"use client";

import PlatformPageLayout from "@/components/platform/PlatformPageLayout";
import { Activity, Video, MessageSquare, FileText, Award, Smartphone, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PhysiotherapistsPage() {
  const features = [
    {
      title: "Interactive Treatment Plans",
      description: "Create dynamic, personalized exercise programs with our extensive library of HD video demonstrations.",
      icon: <Activity className="h-6 w-6" />,
    },
    {
      title: "Remote Monitoring",
      description: "Track patient adherence and progress in real-time with AI-powered motion analysis and feedback loops.",
      icon: <Video className="h-6 w-6" />,
    },
    {
      title: "Direct Communication",
      description: "Secure messaging and video calls allow you to stay connected with your patients throughout their recovery journey.",
      icon: <MessageSquare className="h-6 w-6" />,
    },
    {
      title: "Automated Documentation",
      description: "Save hours on paperwork with smart templates and voice-to-text charting features designed for physiotherapists.",
      icon: <FileText className="h-6 w-6" />,
    },
    {
      title: "Professional Development",
      description: "Access our integrated CPD platform to earn credits, learn new techniques, and stay updated with the latest research.",
      icon: <Award className="h-6 w-6" />,
    },
    {
      title: "Mobile Companion App",
      description: "Manage your caseload on the go with our dedicated mobile app for practitioners.",
      icon: <Smartphone className="h-6 w-6" />,
    },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      {/* Sticky CTA Banner for Physiotherapist Recruitment */}
      <div className="sticky top-0 z-50 w-full bg-gradient-to-r from-teal-900 to-[#005b57] text-white shadow-md">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
          <div className="flex-1">
            <h3 className="font-semibold text-sm sm:text-base mb-0.5">Are you a physiotherapist? Join Rehabify</h3>
            <p className="text-teal-100 text-xs sm:text-sm">Earn more, manage sessions easily, and reach patients across Nigeria.</p>
          </div>
          <Button
            asChild
            variant="secondary"
            className="w-full sm:w-auto bg-white text-teal-900 hover:bg-gray-100 whitespace-nowrap shadow-sm group"
          >
            <Link href="/sign-up?redirect=/physiotherapist">
              Apply to Join
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
        </div>
      </div>

      <PlatformPageLayout
        title="For Physiotherapists"
        subtitle="Tools to streamline patient care"
        description="Focus on what you do best—treating patients. We handle the administrative burden and provide you with cutting-edge tools to deliver better outcomes."
        features={features}
        ctaText="Join as a Physio"
        ctaLink="/sign-up?redirect=/physiotherapist"
      />
    </div>
  );
}
