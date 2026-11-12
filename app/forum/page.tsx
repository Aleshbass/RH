"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { RehabifyLoader } from "@/components/brand/RehabifyLoader";

export default function ForumPage() {
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
      <RehabifyLoader size={64} />
    </div>
  );
}
