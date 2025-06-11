"use server";

import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import InnerComponent from "./inner";

export default async function ServerPage() {
  // Preload the current user data
  const preloaded = await preloadQuery(api.queries.getCurrentUser, {});

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-[#002e2c] mb-6 text-center">
        Server-Side Rendered Content
      </h1>
      <div className="bg-[#faf6e7] p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold text-[#005b57] mb-4">
          Current User Data (Server-Side)
        </h2>
        <div className="bg-white p-4 rounded-md overflow-auto max-h-96">
          <pre className="text-sm text-[#002e2c] whitespace-pre-wrap">
            {JSON.stringify(preloaded, null, 2)}
          </pre>
        </div>
      </div>
      
      <div className="mt-8">
        <InnerComponent />
      </div>
    </main>
  );
}
