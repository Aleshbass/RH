// Extended logging and error tracking interfaces for billing system
// This file provides proper TypeScript interfaces to resolve logging errors

export interface ExtendedLogContext {
  userId?: string
  action?: string
  extra?: Record<string, string | number | boolean | null | undefined>
}

export interface ExtendedErrorContext {
  userId?: string
  action?: string
  extra?: Record<string, string | number | boolean | null | undefined>
}

// Helper functions to ensure proper typing
export const createLogContext = (data: {
  userId?: string
  action: string
  metadata?: Record<string, string | number | boolean | null | undefined>
}): ExtendedLogContext => ({
  userId: data.userId,
  action: data.action,
  extra: data.metadata
})

export const createErrorContext = (data: {
  userId?: string
  action: string
  metadata?: Record<string, string | number | boolean | null | undefined>
}): ExtendedErrorContext => ({
  userId: data.userId,
  action: data.action,
  extra: data.metadata
})

// Safe error casting
export const safeErrorCast = (error: unknown): Error => {
  if (error instanceof Error) {
    return error
  }
  return new Error(String(error))
}
