"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { AdminCheck } from "@/components/admin/AdminCheck";

export default function MarketplaceMigrationPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const runMigration = useMutation(
    api.marketplace.migrations.enableMarketplaceForApprovedPhysios
  );

  const handleRunMigration = async () => {
    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const migrationResult = await runMigration({});
      setResult(migrationResult);
    } catch (err: any) {
      setError(err.message || "Migration failed");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <AdminCheck>
      <div className="max-w-4xl mx-auto p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">
            Marketplace Migration
          </h1>
          <p className="text-gray-600 mt-2">
            Enable marketplace for all approved physiotherapists
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Enable Marketplace for Approved Physiotherapists</CardTitle>
            <CardDescription>
              This will automatically set <code>isAvailableOnMarketplace = true</code> for
              all physiotherapists with approved accounts. This only needs to be run once.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-2">What this does:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Finds all approved physiotherapists</li>
                <li>• Sets <code>isAvailableOnMarketplace = true</code></li>
                <li>• Initializes marketplace fields (views, bookings, earnings)</li>
                <li>• Skips profiles that are already enabled</li>
              </ul>
            </div>

            {!result && !error && (
              <Button
                onClick={handleRunMigration}
                disabled={isRunning}
                className="w-full bg-[#005b57] hover:bg-[#00443e] h-12"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running Migration...
                  </>
                ) : (
                  "Run Migration"
                )}
              </Button>
            )}

            {result && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-green-900 font-semibold mb-3">
                  <CheckCircle className="h-5 w-5" />
                  Migration Complete!
                </div>
                <div className="space-y-2 text-sm text-green-800">
                  <p>
                    <strong>Updated:</strong> {result.updated} profiles
                  </p>
                  <p>
                    <strong>Skipped:</strong> {result.skipped} profiles
                  </p>
                  <p className="mt-3">{result.message}</p>
                </div>
                <Button
                  onClick={() => {
                    setResult(null);
                    window.location.href = "/find-a-physio";
                  }}
                  className="mt-4 w-full"
                  variant="outline"
                >
                  View Marketplace
                </Button>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-900 font-semibold mb-2">
                  <XCircle className="h-5 w-5" />
                  Migration Failed
                </div>
                <p className="text-sm text-red-800">{error}</p>
                <Button
                  onClick={() => {
                    setError(null);
                    setResult(null);
                  }}
                  className="mt-4"
                  variant="outline"
                >
                  Try Again
                </Button>
              </div>
            )}

            <div className="pt-4 border-t">
              <h3 className="font-semibold mb-2">After Migration:</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>✓ Approved physiotherapists will appear in /find-a-physio</li>
                <li>✓ They can toggle marketplace visibility in their dashboard</li>
                <li>✓ Patients can browse and book sessions</li>
                <li>✓ Safe to run multiple times (idempotent)</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminCheck>
  );
}
