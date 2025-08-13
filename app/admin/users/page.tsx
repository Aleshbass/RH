"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function AdminUsersRedirect() {
  const router = useRouter();
  const didRedirect = useRef(false);

  useEffect(() => {
    // Redirect to the new admin users page
    if (didRedirect.current) return;
    didRedirect.current = true;
    router.replace("/dashboard/admin/users");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">Redirecting...</h2>
        <p className="text-muted-foreground">Taking you to the admin dashboard</p>
      </div>
    </div>
  );
}