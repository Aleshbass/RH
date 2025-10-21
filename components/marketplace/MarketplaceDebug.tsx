"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function MarketplaceDebug() {
  const debugInfo = useQuery(api.marketplace.debug.debugMarketplaceProfiles);
  const [isRunning, setIsRunning] = useState(false);
  const runMigration = useMutation(api.marketplace.quickEnable.enableAllApprovedPhysios);

  const handleRunMigration = async () => {
    setIsRunning(true);
    try {
      const result = await runMigration({});
      toast.success("Migration Complete!", {
        description: `Updated ${result.updated} profiles. Refresh the page to see changes.`,
      });
      setTimeout(() => window.location.reload(), 2000);
    } catch (error: any) {
      toast.error("Migration Failed", {
        description: error.message || "Please try again",
      });
      setIsRunning(false);
    }
  };

  if (!debugInfo) {
    return <div>Loading debug info...</div>;
  }

  return (
    <Card className="mb-6 bg-yellow-50 border-2 border-yellow-300 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg text-yellow-900 flex items-center gap-2">
          🔧 Marketplace Debug Info
          <span className="text-xs font-normal text-yellow-700">
            (Remove this component after migration)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="font-semibold">Total Profiles:</p>
            <p className="text-2xl">{debugInfo.total}</p>
          </div>
          <div>
            <p className="font-semibold">Available on Marketplace:</p>
            <p className="text-2xl">{debugInfo.availableOnMarketplace}</p>
          </div>
          <div>
            <p className="font-semibold">Approved:</p>
            <p className="text-2xl">{debugInfo.approved}</p>
          </div>
          <div>
            <p className="font-semibold">Should Show:</p>
            <p className="text-2xl text-green-600">{debugInfo.shouldShow}</p>
          </div>
        </div>

        {/* Migration Button */}
        {debugInfo.shouldShow === 0 && debugInfo.approved > 0 && (
          <div className="p-4 bg-red-50 border-2 border-red-300 rounded-lg">
            <h3 className="font-bold text-red-900 mb-2 text-lg">
              ⚠️ Migration Required!
            </h3>
            <p className="text-sm text-red-800 mb-3">
              You have {debugInfo.approved} approved physiotherapists but none are enabled on the marketplace.
              Click the button below to enable all approved physiotherapists automatically.
            </p>
            <Button
              onClick={handleRunMigration}
              disabled={isRunning}
              className="w-full bg-red-600 hover:bg-red-700 h-12 text-white font-semibold"
            >
              {isRunning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running Migration...
                </>
              ) : (
                `🚀 Enable ${debugInfo.approved} Approved Physiotherapists on Marketplace`
              )}
            </Button>
          </div>
        )}

        <div className="mt-4">
          <h3 className="font-semibold mb-2">Profile Details:</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {debugInfo.profiles.map((profile: any, idx: number) => (
              <div
                key={idx}
                className={`p-3 rounded border ${
                  profile.shouldShowInMarketplace
                    ? "bg-green-50 border-green-200"
                    : "bg-red-50 border-red-200"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">{profile.fullName}</p>
                    <p className="text-xs text-gray-600">{profile.email}</p>
                  </div>
                  <div className="text-right text-xs">
                    <div className="flex gap-2 mb-1">
                      <span
                        className={`px-2 py-1 rounded ${
                          profile.isAvailableOnMarketplace
                            ? "bg-green-200 text-green-800"
                            : "bg-red-200 text-red-800"
                        }`}
                      >
                        Marketplace: {profile.isAvailableOnMarketplace ? "✓" : "✗"}
                      </span>
                      <span
                        className={`px-2 py-1 rounded ${
                          profile.approvalStatus === "approved"
                            ? "bg-green-200 text-green-800"
                            : "bg-red-200 text-red-800"
                        }`}
                      >
                        {profile.approvalStatus}
                      </span>
                    </div>
                    {profile.shouldShowInMarketplace ? (
                      <span className="text-green-600 font-semibold">✓ Will Show</span>
                    ) : (
                      <span className="text-red-600 font-semibold">✗ Hidden</span>
                    )}
                  </div>
                </div>
                
                {!profile.shouldShowInMarketplace && (
                  <div className="mt-2 text-xs text-red-700">
                    <strong>Why hidden:</strong>
                    {!profile.isAvailableOnMarketplace && " • Not enabled on marketplace"}
                    {profile.approvalStatus !== "approved" && ` • Status: ${profile.approvalStatus}`}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
