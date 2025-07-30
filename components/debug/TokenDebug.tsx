"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

interface TokenDebugProps {
  callId: Id<"videoCalls">;
}

export default function TokenDebug({ callId }: TokenDebugProps) {
  const callTokens = useQuery(api.debugTokens.debugCallTokens, { callId });
  const userParticipation = useQuery(api.debugTokens.debugUserParticipation, { callId });

  return (
    <div className="p-4 bg-gray-100 rounded-lg mt-4">
      <h3 className="text-lg font-bold mb-4">🔍 Token Debug Information</h3>
      
      <div className="mb-6">
        <h4 className="font-semibold mb-2">Call & Participants:</h4>
        {callTokens ? (
          <div className="bg-white p-3 rounded border">
            <pre className="text-sm overflow-auto">
              {JSON.stringify(callTokens, null, 2)}
            </pre>
          </div>
        ) : (
          <div>Loading call tokens...</div>
        )}
      </div>

      <div className="mb-6">
        <h4 className="font-semibold mb-2">Current User Participation:</h4>
        {userParticipation ? (
          <div className="bg-white p-3 rounded border">
            <pre className="text-sm overflow-auto">
              {JSON.stringify(userParticipation, null, 2)}
            </pre>
          </div>
        ) : (
          <div>Loading user participation...</div>
        )}
      </div>
    </div>
  );
}
