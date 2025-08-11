'use client'

import { Suspense, ReactNode } from 'react'
import LoadingSpinner from './loading-spinner'
import ErrorBoundary from './error-boundary'
import { log } from '@/lib/monitoring/logger'

interface LazyWrapperProps {
  children: ReactNode
  fallback?: ReactNode
  loadingMessage?: string
  errorFallback?: ReactNode
  componentName?: string
}

const LazyWrapper = ({ 
  children, 
  fallback, 
  loadingMessage = 'Loading component...', 
  errorFallback,
  componentName = 'Unknown'
}: LazyWrapperProps) => {
  const defaultFallback = fallback || (
    <div className="flex min-h-[200px] items-center justify-center">
      <LoadingSpinner message={loadingMessage} />
    </div>
  )

  return (
    <ErrorBoundary 
      fallback={errorFallback}
      onError={(error) => {
        log.error(`Lazy component error: ${componentName}`, {
          error: error.message,
          metadata: { componentName, lazyLoading: true }
        })
      }}
    >
      <Suspense fallback={defaultFallback}>
        {children}
      </Suspense>
    </ErrorBoundary>
  )
}

export default LazyWrapper
