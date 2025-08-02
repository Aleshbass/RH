/* eslint-disable @typescript-eslint/no-explicit-any */
// Helper wrappers around Convex hooks that bypass deep generic instantiation issues
// using double casting (unknown as any). Use these when TypeScript reports
// "Type instantiation is excessively deep and possibly infinite".

import { useQuery, useAction, useMutation } from "convex/react";

export function useQueryUntyped(fn: unknown, args?: unknown): any {
  // Double-cast the function reference so TS doesn't try to expand its types
   
  // Cast the hook itself to any to fully sidestep its complex generics
  return (useQuery as any)(fn as any, args) as any;
}

export function useMutationUntyped(fn: unknown): any {
   
  return (useMutation as any)(fn as any) as any;
}

export function useActionUntyped(fn: unknown): any {
   
  return (useAction as any)(fn as any) as any;
}