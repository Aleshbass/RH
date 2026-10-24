"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useMutation } from "convex/react";
import { ArrowUpRight, CheckCircle2, Loader2, Store, XCircle } from "@/components/icons";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { playSound } from "@/lib/sounds";
import { devToolsEnabled } from "@/components/admin/shell/adminNav";
import {
  AdminPage,
  ConfirmDialog,
  PageHeader,
  Panel,
  StatTile,
  primaryButtonClass,
  softButtonClass,
} from "@/components/admin/ui";

/** The mutation reports `alreadyEnabled`; `skipped` is the older name, kept as a fallback. */
type MigrationResult = { updated: number; alreadyEnabled?: number; skipped?: number; totalProfiles?: number; message?: string };

function MarketplaceMigration() {
  const [isRunning, setIsRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runMigration = useMutation(api.marketplace.migrations.enableMarketplaceForApprovedPhysios);

  const handleRunMigration = async () => {
    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const migrationResult = (await runMigration({})) as MigrationResult;
      setResult(migrationResult);
      playSound("success");
    } catch (err) {
      setError((err as Error)?.message || "Migration failed");
      playSound("error");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <AdminPage className="max-w-4xl">
      <PageHeader eyebrow="Developer" title="Marketplace migration" description="Enable the marketplace for every approved physiotherapist." />

      <Panel
        title="Enable marketplace for approved physiotherapists"
        description="Sets isAvailableOnMarketplace = true for every physiotherapist with an approved account. It only needs to run once."
        bodyClassName="space-y-4 p-5 pt-3"
      >
        <div className="rounded-xl bg-rh-honeydew px-4 py-3 dark:bg-white/[0.06]">
          <h3 className="mb-1.5 text-sm font-semibold text-rh-ink dark:text-rh-lime">What this does</h3>
          <ul className="list-inside list-disc space-y-1 text-sm text-rh-ink/80 dark:text-neutral-300">
            <li>Finds all approved physiotherapists</li>
            <li>
              Sets <code className="rounded bg-white/70 px-1 text-xs dark:bg-white/10">isAvailableOnMarketplace = true</code>
            </li>
            <li>Initialises marketplace fields (views, bookings, earnings)</li>
            <li>Skips profiles that are already enabled</li>
          </ul>
        </div>

        {!result && !error && (
          <Button onClick={() => setConfirmOpen(true)} disabled={isRunning} className={cn(primaryButtonClass, "h-11 w-full")}>
            {isRunning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running migration…
              </>
            ) : (
              <>
                <Store className="mr-2 h-4 w-4" />
                Run migration
              </>
            )}
          </Button>
        )}

        {result && (
          <div className="space-y-3 rounded-xl bg-rh-honeydew/60 p-4 dark:bg-emerald-400/10">
            <p className="flex items-center gap-2 font-semibold text-[#047857] dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
              Migration complete
            </p>
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Updated" value={result.updated} tone="mint" hint="profiles" />
              <StatTile label="Already up to date" value={result.alreadyEnabled ?? result.skipped ?? 0} tone="neutral" hint="skipped" />
            </div>
            {result.message && <p className="text-sm text-[#047857] dark:text-emerald-300">{result.message}</p>}
            <Button asChild className={cn(softButtonClass, "w-full")}>
              <Link href="/find-a-physio">
                View marketplace <ArrowUpRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        )}

        {error && (
          <div className="space-y-3 rounded-xl bg-rh-blush p-4 dark:bg-rose-400/10">
            <p className="flex items-center gap-2 font-semibold text-[#be123c] dark:text-rose-300">
              <XCircle className="h-5 w-5" />
              Migration failed
            </p>
            <p className="text-sm text-[#be123c] dark:text-rose-300">{error}</p>
            <Button
              onClick={() => {
                setError(null);
                setResult(null);
              }}
              className={softButtonClass}
            >
              Try again
            </Button>
          </div>
        )}

        <div className="border-t border-black/[0.05] pt-4 dark:border-white/[0.06]">
          <h3 className="mb-2 text-sm font-semibold text-rh-ink dark:text-white">After the migration</h3>
          <ul className="space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
            <li>Approved physiotherapists appear in /find-a-physio</li>
            <li>They can toggle marketplace visibility in their dashboard</li>
            <li>Patients can browse and book sessions</li>
            <li>Safe to run more than once (idempotent)</li>
          </ul>
        </div>
      </Panel>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Run the marketplace migration?"
        description="Every approved physiotherapist who isn't listed yet will be made visible on the public marketplace."
        confirmLabel="Run migration"
        onConfirm={handleRunMigration}
      />
    </AdminPage>
  );
}

/** Developer tool: hidden in production unless NEXT_PUBLIC_ADMIN_DEV_TOOLS=true. */
export default function MarketplaceMigrationPage() {
  if (!devToolsEnabled()) notFound();
  return <MarketplaceMigration />;
}
