"use client";

import PlatformPageLayout from "@/components/platform/PlatformPageLayout";
import { Users2, BellRing, HeartHandshake, FileHeart, Phone, Clock } from "@/components/icons";

export default function FamilyPage() {
  const features = [
    {
      title: "Stay Informed",
      description: "Receive regular updates on your loved one's progress, adherence to their plan, and upcoming appointments.",
      icon: <BellRing className="h-6 w-6" />,
    },
    {
      title: "Care Coordination",
      description: "Easily communicate with the care team to ensure everyone is aligned on the recovery goals and treatment plan.",
      icon: <Users2 className="h-6 w-6" />,
    },
    {
      title: "Support Resources",
      description: "Access a library of resources designed to help family members provide the best possible support at home.",
      icon: <HeartHandshake className="h-6 w-6" />,
    },

    {
      title: "Emergency Contact",
      description: "Quick access to the care team in case of urgent questions or concerns regarding your loved one's condition.",
      icon: <Phone className="h-6 w-6" />,
    },
    {
      title: "Appointment Reminders",
      description: "Help your loved one stay on track by receiving notifications for upcoming sessions and exercises.",
      icon: <Clock className="h-6 w-6" />,
    },
  ];

  return (
    <PlatformPageLayout
      title="For Family Members"
      subtitle="Support your loved one's recovery"
      description="Recovery is a team effort. We provide family members with the visibility and tools they need to be an active, supportive part of the rehabilitation journey."
      features={features}
      ctaText="Get Started"
      ctaLink="/sign-up?as=family"
    />
  );
}
