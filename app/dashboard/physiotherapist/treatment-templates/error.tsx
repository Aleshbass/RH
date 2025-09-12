"use client";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container mx-auto p-6">
      <div className="max-w-xl mx-auto border rounded-lg p-6 bg-white">
        <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
        <p className="text-sm text-muted-foreground mb-4">
          {error?.message || "An unexpected error occurred while loading treatment templates."}
        </p>
        <div className="flex gap-2">
          <button
            className="px-4 py-2 rounded bg-primary text-white"
            onClick={() => reset()}
          >
            Try again
          </button>
          <Link
            className="px-4 py-2 rounded border"
            href="/dashboard/physiotherapist/treatment-templates"
          >
            Back to Templates
          </Link>
        </div>
      </div>
    </div>
  );
}
