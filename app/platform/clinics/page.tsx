"use client";

import PlatformPageLayout from "@/components/platform/PlatformPageLayout";
import { Building2, Users, Calendar, BarChart3, ShieldCheck, Stethoscope } from "@/components/icons";

export default function ClinicsPage() {
  const features = [
    {
      title: "Practice Management",
      description: "Streamline your clinic's operations with our all-in-one management suite. Handle bookings, billing, and patient records effortlessly.",
      icon: <Building2 className="h-6 w-6" />,
    },
    {
      title: "Staff Coordination",
      description: "Manage your team of physiotherapists, assign patients, and track performance metrics all from a single dashboard.",
      icon: <Users className="h-6 w-6" />,
    },
    {
      title: "Smart Scheduling",
      description: "Automated appointment scheduling that syncs with your team's calendars, reducing no-shows and optimizing availability.",
      icon: <Calendar className="h-6 w-6" />,
    },
    {
      title: "Advanced Analytics",
      description: "Gain deep insights into your clinic's performance with detailed reports on revenue, patient retention, and treatment outcomes.",
      icon: <BarChart3 className="h-6 w-6" />,
    },
    {
      title: "Compliance & Security",
      description: "Enterprise-grade security ensuring all patient data is encrypted and compliant with healthcare regulations.",
      icon: <ShieldCheck className="h-6 w-6" />,
    },
    {
      title: "Telehealth Integration",
      description: "Expand your reach with built-in high-quality video consultations, allowing you to treat patients remotely.",
      icon: <Stethoscope className="h-6 w-6" />,
    },
  ];

  return (
    <PlatformPageLayout
      title="For Clinics"
      subtitle="Complete practice management solution"
      description="Empower your clinic with the tools you need to scale. From solo practitioners to multi-location networks, Rehabify Health provides the infrastructure for modern physiotherapy practices."
      features={features}
      ctaText="Register Your Clinic"
      ctaLink="/sign-up?as=clinic_owner"
    />
  );
}
