"use client";

import PlatformPageLayout from "@/components/platform/PlatformPageLayout";
import { Heart, PlayCircle, MessageCircle, CalendarCheck, TrendingUp, Shield } from "lucide-react";

export default function PatientsPage() {
  const features = [
    {
      title: "Personalized Care Plans",
      description: "Receive a recovery plan tailored specifically to your injury, goals, and lifestyle by a licensed physiotherapist.",
      icon: <Heart className="h-6 w-6" />,
    },
    {
      title: "Guided Exercise Videos",
      description: "Never guess if you're doing it right. Follow along with clear, high-definition videos for every exercise in your plan.",
      icon: <PlayCircle className="h-6 w-6" />,
    },
    {
      title: "Chat with Your Physio",
      description: "Have questions? Message your physiotherapist directly through the app for guidance and support whenever you need it.",
      icon: <MessageCircle className="h-6 w-6" />,
    },
    {
      title: "Easy Booking",
      description: "Schedule video consultations or in-person visits with just a few taps. Manage your appointments effortlessly.",
      icon: <CalendarCheck className="h-6 w-6" />,
    },
    {
      title: "Track Your Progress",
      description: "See how far you've come with visual progress tracking. Celebrate milestones and stay motivated on your road to recovery.",
      icon: <TrendingUp className="h-6 w-6" />,
    },
    {
      title: "Private & Secure",
      description: "Your health data is yours. We use bank-level encryption to ensure your personal information stays private and secure.",
      icon: <Shield className="h-6 w-6" />,
    },
  ];

  return (
    <PlatformPageLayout
      title="For Patients"
      subtitle="Personalized rehabilitation programs"
      description="Recover faster and better with a dedicated team by your side. Rehabify Health connects you with top physiotherapists and gives you the tools to take control of your health."
      features={features}
      ctaText="Start Your Recovery"
      ctaLink="/start-treatment"
    />
  );
}
