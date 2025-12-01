"use client";

import PlatformPageLayout from "@/components/platform/PlatformPageLayout";
import { Activity, Video, MessageSquare, FileText, Award, Smartphone } from "lucide-react";

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
    <PlatformPageLayout
      title="For Physiotherapists"
      subtitle="Tools to streamline patient care"
      description="Focus on what you do best—treating patients. We handle the administrative burden and provide you with cutting-edge tools to deliver better outcomes."
      features={features}
      ctaText="Join as a Physio"
      ctaLink="/sign-up?role=physiotherapist"
    />
  );
}
