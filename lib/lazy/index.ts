
import { ComponentType, lazy, LazyExoticComponent } from 'react'
import { log } from '@/lib/monitoring/logger'

// Simple loading component interface to avoid deep type instantiation
interface LoadingProps {
  message?: string
}

// Simple component props interface


// Lazy loading wrapper with error boundary and loading states
export const createLazyComponent = <T extends Record<string, unknown> = Record<string, unknown>>(
  importFn: () => Promise<{ default: ComponentType<T> }>,
  componentName: string
): LazyExoticComponent<ComponentType<T>> => {
  const LazyComponent = lazy(async () => {
    const startTime = Date.now()
    
    try {
      log.debug(`Loading component: ${componentName}`)
      const componentModule = await importFn()
      const loadTime = Date.now() - startTime
      
      log.performanceMetric(`component-load-${componentName.toLowerCase()}`, loadTime)
      
      return componentModule
    } catch (error) {
      log.error(`Failed to load component: ${componentName}`, { error: error as Error })
      throw error
    }
  })

  ;(LazyComponent as unknown as { displayName: string }).displayName = `Lazy(${componentName})`
  return LazyComponent
}

// Pre-built lazy components for common UI elements
export const LazyLoadingSpinner = createLazyComponent(
  () => import('@/components/ui/loading-spinner'),
  'LoadingSpinner'
)

export const LazyErrorBoundary = createLazyComponent(
  () => import('@/components/ui/error-boundary'),
  'ErrorBoundary'
)

// Dashboard lazy components
export const LazyDashboardStats = createLazyComponent(
  () => Promise.resolve({ default: () => null }), // Placeholder for missing DashboardStats
  'DashboardStats'
)

export const LazyAdvancedAnalytics = createLazyComponent(
  () => Promise.resolve({ default: () => null }), // Placeholder for missing AdvancedAnalyticsDashboard
  'AdvancedAnalytics'
)

// Chart components (heavy libraries)
export const LazyRechartsComponents = {
  LineChart: createLazyComponent(
    () => Promise.resolve({ default: () => null }), // Placeholder for recharts LineChart
    'LineChart'
  ),
  BarChart: createLazyComponent(
    () => Promise.resolve({ default: () => null }), // Placeholder for recharts BarChart
    'BarChart'
  ),
  PieChart: createLazyComponent(
    () => Promise.resolve({ default: () => null }), // Placeholder for recharts PieChart
    'PieChart'
  )
}

// Form components
export const LazyFormComponents = {
  DatePicker: createLazyComponent(
    () => Promise.resolve({ default: () => null }), // Placeholder for missing date-picker
    'DatePicker'
  ),
  RichTextEditor: createLazyComponent(
    () => Promise.resolve({ default: () => null }), // Placeholder for missing rich-text-editor
    'RichTextEditor'
  ),
  FileUpload: createLazyComponent(
    () => Promise.resolve({ default: () => null }), // Placeholder for missing file-upload
    'FileUpload'
  )
}

// Video call components (Daily.co integration)
export const LazyVideoCall = createLazyComponent(
  () => Promise.resolve({ default: () => null }), // Placeholder for missing VideoCallInterface
  'VideoCallInterface'
)

// Preload function for critical components
export const preloadComponent = async (
  importFn: () => Promise<unknown>,
  componentName: string
): Promise<void> => {
  try {
    log.debug(`Preloading component: ${componentName}`)
    await importFn()
    log.debug(`Preloaded component: ${componentName}`)
  } catch (error) {
    log.error(`Failed to preload component: ${componentName}`, { error: error as Error })
  }
}

// Preload critical components on idle
export const preloadCriticalComponents = () => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => {
      // Preload dashboard components
      preloadComponent(
        () => import('@/components/dashboard/shared/CachedDashboardStats').then(mod => ({ default: mod.CachedDashboardStats })),
        'DashboardStats'
      )
      
      // Preload form components
      preloadComponent(
        () => Promise.resolve({ default: () => null }), // Placeholder for missing date-picker
        'DatePicker'
      )
    })
  }
}

// Route-based code splitting helpers
export const createLazyPage = <T extends Record<string, unknown> = Record<string, unknown>>(
  importFn: () => Promise<{ default: ComponentType<T> }>,
  pageName: string
) => {
  return createLazyComponent(importFn, `Page-${pageName}`)
}

// Export types for use in other modules (simplified to avoid deep instantiation)
export type LazyComponentType<T = Record<string, unknown>> = LazyExoticComponent<ComponentType<T>>
export type { LoadingProps }
