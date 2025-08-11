'use client'

import React from 'react'
import * as Sentry from '@sentry/nextjs'
import { captureException, trackUIAction, sentryLogger } from '@/lib/monitoring/sentry'
import { runAllSentryTests } from '@/lib/monitoring/sentry-test'

export default function SentryTestComponent() {
  const handleTestException = () => {
    trackUIAction(
      "Test Exception Button Click",
      "ui.click",
      () => {
        try {
          throw new Error('Test exception from RehabifyHealth dashboard')
        } catch (error) {
          captureException(error, {
            tags: { feature: 'sentry-test', source: 'dashboard' },
            extra: { testType: 'manual-exception' }
          })
        }
      },
      { component: 'SentryTestComponent', action: 'test-exception' }
    )
  }

  const handleTestLogging = () => {
    Sentry.startSpan(
      {
        op: "ui.click",
        name: "Test Logging Button Click",
      },
      (span) => {
        span.setAttribute("test_type", "logging")
        span.setAttribute("component", "SentryTestComponent")

        sentryLogger.info("Test log message from RehabifyHealth", {
          feature: 'sentry-integration',
          timestamp: new Date().toISOString(),
          userAction: 'test-logging'
        })

        sentryLogger.warn("Test warning message", {
          warningType: 'test-warning',
          severity: 'low'
        })
      }
    )
  }

  const handleRunAllTests = async () => {
    try {
      const result = await runAllSentryTests()
      if (result.success) {
        sentryLogger.info('All Sentry tests completed successfully', {
          testsRun: result.testsRun,
          timestamp: new Date().toISOString()
        })
      }
    } catch (error) {
      captureException(error, {
        tags: { feature: 'sentry-test-suite' },
        extra: { testSuite: 'runAllSentryTests' }
      })
    }
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-md max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4 text-gray-800">
        Sentry Integration Test
      </h2>
      <p className="text-sm text-gray-600 mb-4">
        Test Sentry monitoring integration for RehabifyHealth
      </p>
      
      <div className="space-y-3">
        <button
          onClick={handleTestException}
          className="w-full px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
        >
          Test Exception Capture
        </button>
        
        <button
          onClick={handleTestLogging}
          className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Test Logging
        </button>
        
        <button
          onClick={handleRunAllTests}
          className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
        >
          Run All Tests
        </button>
      </div>
      
      <div className="mt-4 p-3 bg-gray-100 rounded text-xs text-gray-600">
        <p><strong>Check your Sentry dashboard:</strong></p>
        <p>https://rehabifyhealth.sentry.io/</p>
        <p className="mt-1">Events should appear within a few seconds</p>
      </div>
    </div>
  )
}
