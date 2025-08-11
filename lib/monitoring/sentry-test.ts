/**
 * Sentry Integration Test
 * 
 * This file contains test functions to verify Sentry is working correctly
 * Run these tests to ensure events, logs, and traces are being captured
 */

import * as Sentry from '@sentry/nextjs'
import { captureException, trackUIAction, trackAPICall, sentryLogger } from './sentry'

// Test 1: Exception Capturing
export const testExceptionCapture = () => {
  console.log('🧪 Testing Sentry Exception Capture...')
  
  try {
    // Intentionally throw an error
    throw new Error('Test error for Sentry integration')
  } catch (error) {
    // Test direct Sentry capture
    Sentry.captureException(error)
    
    // Test our custom capture utility
    captureException(error, {
      tags: { test: 'sentry-integration' },
      extra: { testType: 'exception-capture' },
      level: 'error'
    })
    
    console.log('✅ Exception capture test completed')
  }
}

// Test 2: Custom Span Instrumentation
export const testSpanInstrumentation = () => {
  console.log('🧪 Testing Sentry Span Instrumentation...')
  
  return Sentry.startSpan(
    {
      op: "test.operation",
      name: "Sentry Integration Test Span",
    },
    (span) => {
      span.setAttribute("test_type", "span_instrumentation")
      span.setAttribute("environment", "development")
      span.setAttribute("timestamp", Date.now())
      
      // Simulate some work
      const result = { success: true, testId: 'span-test-123' }
      
      console.log('✅ Span instrumentation test completed')
      return result
    }
  )
}

// Test 3: UI Action Tracking
export const testUIActionTracking = () => {
  console.log('🧪 Testing UI Action Tracking...')
  
  return trackUIAction(
    "Test UI Action",
    "ui.test",
    () => {
      // Simulate UI action
      const actionResult = { clicked: true, timestamp: Date.now() }
      console.log('✅ UI action tracking test completed')
      return actionResult
    },
    {
      component: "sentry-test",
      action_type: "test_click",
      user_role: "developer"
    }
  )
}

// Test 4: API Call Tracking
export const testAPICallTracking = async () => {
  console.log('🧪 Testing API Call Tracking...')
  
  return trackAPICall(
    "GET",
    "/api/test/sentry",
    async () => {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 100))
      const apiResult = { status: 'success', data: 'test-data' }
      console.log('✅ API call tracking test completed')
      return apiResult
    },
    {
      test_endpoint: true,
      response_time: "100ms",
      environment: "development"
    }
  )
}

// Test 5: Structured Logging
export const testStructuredLogging = () => {
  console.log('🧪 Testing Structured Logging...')
  
  const { logger } = Sentry
  
  // Test different log levels
  sentryLogger.trace("Trace level test message", { level: "trace" })
  sentryLogger.debug("Debug level test message", { level: "debug" })
  sentryLogger.info("Info level test message", { level: "info" })
  sentryLogger.warn("Warning level test message", { level: "warn" })
  sentryLogger.error("Error level test message", { level: "error" })
  
  // Test template literal logging
  const userId = "test-user-123"
  logger.info(logger.fmt`User logged in: ${userId}`, {
    userId,
    loginTime: new Date().toISOString(),
    source: "sentry-test"
  })
  
  console.log('✅ Structured logging test completed')
}

// Test 6: Console Integration Test
export const testConsoleIntegration = () => {
  console.log('🧪 Testing Console Integration...')
  
  // These should be captured by Sentry's console integration
  console.log('Test console.log message for Sentry')
  console.warn('Test console.warn message for Sentry')
  console.error('Test console.error message for Sentry')
  
  console.log('✅ Console integration test completed')
}

// Run all tests
export const runAllSentryTests = async () => {
  console.log('🚀 Starting Sentry Integration Tests...')
  console.log('Check your Sentry dashboard at: https://rehabifyhealth.sentry.io/')
  
  try {
    // Run tests sequentially
    testExceptionCapture()
    testSpanInstrumentation()
    testUIActionTracking()
    await testAPICallTracking()
    testStructuredLogging()
    testConsoleIntegration()
    
    console.log('🎉 All Sentry tests completed successfully!')
    console.log('📊 Check your Sentry dashboard to verify events were captured')
    
    return { success: true, testsRun: 6 }
  } catch (error) {
    console.error('❌ Sentry test failed:', error)
    captureException(error, {
      tags: { test: 'sentry-integration-failure' },
      extra: { testSuite: 'runAllSentryTests' }
    })
    return { success: false, error: error }
  }
}
