"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";

export default function SupportPage() {
  const router = useRouter();
  const { isSignedIn } = useAuth();

  useEffect(() => {
    // Redirect based on auth status
    if (isSignedIn) {
      router.push("/");
    } else {
      router.push("/sign-up");
    }
  }, [isSignedIn, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#005b57]" />
    </div>
  );
}
