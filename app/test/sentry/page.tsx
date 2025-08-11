import SentryTestComponent from '@/components/test/SentryTestComponent'

export default function SentryTestPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            RehabifyHealth Sentry Integration Test
          </h1>
          <p className="text-gray-600">
            Test monitoring, logging, and error tracking functionality
          </p>
        </div>
        
        <SentryTestComponent />
        
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>This page is for testing Sentry integration only</p>
          <p>Remove in production</p>
        </div>
      </div>
    </div>
  )
}
