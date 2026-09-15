import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      name: "Rehabify Health Partner & Provider API",
      version: "v1",
      status: "operational",
      environment: process.env.NODE_ENV || "production",
      documentation: "https://docs.physioaroundme.com",
      portal: "https://partners.physioaroundme.com",
      endpoints: {
        referrals: "/api/v1/partners/referrals",
        eligibility: "/api/v1/partners/eligibility",
        providers: "/api/v1/partners/providers",
        reports: "/api/v1/partners/reports/{referralId}",
      },
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
