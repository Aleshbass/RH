import { Suspense } from "react";
import CustomSignUp from "@/components/auth/CustomSignUp";

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#FAF6E7]">
          <div className="w-8 h-8 border-4 border-[#005b57] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CustomSignUp />
    </Suspense>
  );
}

