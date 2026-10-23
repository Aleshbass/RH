"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "@/components/icons";

export default function BackBreadcrumb({
  fallbackHref = "/",
  label = "Back",
  className = "",
}: {
  fallbackHref?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  const onBack = () => {
    try {
      const ref = document.referrer;
      const sameOrigin = ref && new URL(ref).origin === window.location.origin;
      if (sameOrigin && window.history.length > 1) {
        router.back();
        return;
      }
    } catch {
      // ignore and use fallback
    }
    router.push(fallbackHref);
  };

  return (
    <button
      type="button"
      onClick={onBack}
      className={`inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors ${className}`}
      aria-label={label}
    >
      <ChevronLeft className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}
