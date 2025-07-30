// Helper wrappers around Convex hooks that bypass deep generic instantiation issues
// using double casting (unknown as any). Use these when TypeScript reports
// "Type instantiation is excessively deep and possibly infinite".

import { useQuery, useAction, useMutation } from "convex/react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useQueryUntyped(fn: any, args?: any) {
  // Double-cast the function reference so TS doesn't try to expand its types
   
  return useQuery(fn as unknown as any, args);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useMutationUntyped(fn: any) {
   
  return useMutation(fn as unknown as any);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useActionUntyped(fn: any) {
   
  return useAction(fn as unknown as any);
} 