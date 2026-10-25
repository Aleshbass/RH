import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import { checkRateLimit, createRateLimitResponse, getClientIp } from "@/lib/rate-limiter";

type ApplyArgs = {
  jobId: Id<"careerJobs">;
  fullName: string;
  email: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  coverNote?: string;
  cvStorageId: Id<"_storage">;
  cvFileName?: string;
};

// A plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const submitApplicationRef = makeFunctionReference<"mutation", ApplyArgs, { success: boolean }>("careers:submitApplication");

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const maybe = (value: unknown) => text(value) || undefined;

/**
 * Job applications from /careers/[slug]. The browser uploads the CV to Convex storage first;
 * this route rate-limits by IP and hands the rest to careers.submitApplication, which checks the
 * role is open, the CV is a small PDF, and that this email hasn't applied already.
 */
export async function POST(request: Request) {
  const rate = await checkRateLimit(`careers-apply:${getClientIp(request)}`, "public_form");
  if (!rate.success) {
    return createRateLimitResponse({
      rateLimitResult: rate,
      customMessage: "Too many applications from this connection. Please wait a little and try again.",
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const args: ApplyArgs = {
    jobId: text(body.jobId) as Id<"careerJobs">,
    fullName: text(body.fullName),
    email: text(body.email),
    phone: maybe(body.phone),
    location: maybe(body.location),
    linkedinUrl: maybe(body.linkedinUrl),
    portfolioUrl: maybe(body.portfolioUrl),
    coverNote: maybe(body.coverNote),
    cvStorageId: text(body.cvStorageId) as Id<"_storage">,
    cvFileName: maybe(body.cvFileName),
  };
  if (!args.jobId || !args.fullName || !args.email || !args.cvStorageId) {
    return NextResponse.json({ error: "Please fill in your name and email and attach your CV." }, { status: 400 });
  }

  try {
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    await convex.mutation(submitApplicationRef, args);
    return NextResponse.json({ success: true });
  } catch (error) {
    // Validation messages from the mutation are written for the applicant
    if (error instanceof ConvexError && typeof error.data === "string") {
      return NextResponse.json({ error: error.data }, { status: 400 });
    }
    console.error("Job application failed:", error);
    return NextResponse.json({ error: "We couldn't send your application. Please try again." }, { status: 500 });
  }
}
