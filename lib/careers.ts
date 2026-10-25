import { makeFunctionReference } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";

export type Workplace = "onsite" | "hybrid" | "remote";
export type EmploymentType = "full_time" | "part_time" | "contract" | "internship";
export type JobStatus = "draft" | "open" | "closed";
export type ApplicationStatus = "new" | "reviewing" | "interview" | "accepted" | "rejected";

export const WORKPLACE_LABEL: Record<Workplace, string> = { onsite: "On-site", hybrid: "Hybrid", remote: "Remote" };
export const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
};
export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  interview: "Interview",
  accepted: "Accepted",
  rejected: "Not progressing",
};

export const CV_MAX_BYTES = 5 * 1024 * 1024;

export type OpenJob = {
  _id: Id<"careerJobs">;
  slug: string;
  title: string;
  team: string;
  location: string;
  workplace: Workplace;
  employmentType: EmploymentType;
  summary: string;
  publishedAt: number;
};

export type JobDetail = Omit<OpenJob, "publishedAt"> & {
  description: string;
  responsibilities: string[];
  requirements: string[];
  niceToHave: string[];
  salary: string | null;
  closesAt: number | null;
  isOpen: boolean;
};

export type JobInput = {
  title: string;
  team: string;
  location: string;
  workplace: Workplace;
  employmentType: EmploymentType;
  summary: string;
  description: string;
  responsibilities: string[];
  requirements: string[];
  niceToHave?: string[];
  salary?: string;
  status: JobStatus;
  closesAt?: number;
};

export type AdminJob = JobInput & {
  _id: Id<"careerJobs">;
  slug: string;
  publishedAt?: number;
  createdAt: number;
  updatedAt: number;
  applicationCount: number;
  newCount: number;
};

export type AdminApplication = {
  _id: Id<"careerApplications">;
  jobId: Id<"careerJobs">;
  jobTitle: string;
  fullName: string;
  email: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  coverNote?: string;
  cvFileName?: string;
  cvUrl: string | null;
  status: ApplicationStatus;
  adminNotes?: string;
  decisionEmailSentAt?: number;
  createdAt: number;
};

/** Plain references to convex/careers.ts: the generated `api` type is at TypeScript's depth limit (TS2589). */
export const careersApi = {
  listOpenJobs: makeFunctionReference<"query", Record<string, never>, OpenJob[]>("careers:listOpenJobs"),
  getJobBySlug: makeFunctionReference<"query", { slug: string }, JobDetail | null>("careers:getJobBySlug"),
  adminListJobs: makeFunctionReference<"query", Record<string, never>, AdminJob[]>("careers:adminListJobs"),
  adminListApplications: makeFunctionReference<"query", { jobId?: Id<"careerJobs"> }, AdminApplication[]>(
    "careers:adminListApplications"
  ),
  adminSaveJob: makeFunctionReference<"mutation", JobInput & { id?: Id<"careerJobs"> }, { id: Id<"careerJobs">; slug: string }>(
    "careers:adminSaveJob"
  ),
  adminSetJobStatus: makeFunctionReference<"mutation", { id: Id<"careerJobs">; status: JobStatus }, { success: boolean }>(
    "careers:adminSetJobStatus"
  ),
  adminDeleteJob: makeFunctionReference<"mutation", { id: Id<"careerJobs"> }, { success: boolean }>("careers:adminDeleteJob"),
  adminUpdateApplication: makeFunctionReference<
    "mutation",
    { id: Id<"careerApplications">; status?: ApplicationStatus; adminNotes?: string; notifyApplicant?: boolean },
    { success: boolean; emailed: boolean }
  >("careers:adminUpdateApplication"),
  /** Guests may upload PDFs (convex/files.ts), which is how applicants attach a CV */
  generateUploadUrl: makeFunctionReference<"mutation", { fileType: string; fileName: string }, string>("files:generateUploadUrl"),
};

/** "Clinical · Lagos · Hybrid · Full-time" */
export function jobMeta(job: Pick<OpenJob, "team" | "location" | "workplace" | "employmentType">) {
  return [job.team, job.location, WORKPLACE_LABEL[job.workplace], EMPLOYMENT_LABEL[job.employmentType]].filter(Boolean);
}
