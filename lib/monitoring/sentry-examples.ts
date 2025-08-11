/**
 * Sentry Usage Examples for RehabifyHealth
 * 
 * This file demonstrates how to use Sentry monitoring throughout your application
 * following the patterns provided in the Sentry wizard setup.
 */

import * as Sentry from '@sentry/nextjs'
import { captureException, trackUIAction, trackAPICall, sentryLogger } from './sentry'

// Get Sentry logger instance
const { logger } = Sentry

// Example 1: Exception Catching in try-catch blocks
export const handlePatientDataFetch = async (patientId: string) => {
  try {
    const response = await fetch(`/api/patients/${patientId}`)
    const data = await response.json()
    return data
  } catch (error) {
    // Use Sentry.captureException for error logging
    Sentry.captureException(error)
    
    // Or use our custom utility with additional context
    captureException(error, {
      tags: { feature: 'patient-data' },
      extra: { patientId },
      level: 'error'
    })
    
    throw error
  }
}

// Example 2: Custom Span Instrumentation in Component Actions
export const handleAppointmentBooking = (appointmentData: any) => {
  // Create a transaction/span to measure performance
  return Sentry.startSpan(
    {
      op: "ui.click",
      name: "Book Appointment Button Click",
    },
    (span) => {
      const patientId = appointmentData.patientId
      const serviceType = appointmentData.serviceType

      // Metrics can be added to the span
      span.setAttribute("patient_id", patientId)
      span.setAttribute("service_type", serviceType)
      span.setAttribute("booking_source", "dashboard")

      // Perform the booking logic
      return bookAppointment(appointmentData)
    }
  )
}

// Example 3: Custom Span Instrumentation in API Calls
export const fetchUserData = async (userId: string) => {
  return Sentry.startSpan(
    {
      op: "http.client",
      name: `GET /api/users/${userId}`,
    },
    async (span) => {
      span.setAttribute("user_id", userId)
      span.setAttribute("request_type", "user_profile")
      
      const response = await fetch(`/api/users/${userId}`)
      const data = await response.json()
      
      span.setAttribute("response_size", JSON.stringify(data).length)
      return data
    }
  )
}

// Example 4: Using our custom trackUIAction utility
export const handleHealthDataSubmission = (vitalSigns: any) => {
  return trackUIAction(
    "Submit Vital Signs",
    "ui.form.submit",
    () => {
      // Submit vital signs logic
      return submitVitalSigns(vitalSigns)
    },
    {
      data_type: "vital_signs",
      patient_role: "self_report",
      form_completion_time: Date.now()
    }
  )
}

// Example 5: Using our custom trackAPICall utility
export const updatePatientProfile = async (patientId: string, profileData: any) => {
  return trackAPICall(
    "PUT",
    `/api/patients/${patientId}/profile`,
    async () => {
      const response = await fetch(`/api/patients/${patientId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData)
      })
      return response.json()
    },
    {
      patient_id: patientId,
      profile_fields: Object.keys(profileData).length,
      update_source: "patient_dashboard"
    }
  )
}

// Example 6: Structured Logging with Sentry Logger
export const logPatientActivity = (activityType: string, patientId: string, details: any) => {
  // Using template literal function for variables
  logger.info(logger.fmt`Patient activity recorded: ${activityType}`, {
    patientId,
    activityType,
    timestamp: new Date().toISOString(),
    details
  })
}

// Example 7: Different Log Levels
export const demonstrateLogging = (userId: string) => {
  // Trace level - detailed debugging
  sentryLogger.trace("Starting user session", { userId })
  
  // Debug level - development debugging
  sentryLogger.debug(logger.fmt`Cache miss for user: ${userId}`)
  
  // Info level - general information
  sentryLogger.info("User profile updated", { userId, timestamp: Date.now() })
  
  // Warning level - potential issues
  sentryLogger.warn("Rate limit approaching for user", {
    userId,
    requestCount: 95,
    limit: 100
  })
  
  // Error level - errors that need attention
  sentryLogger.error("Failed to sync health data", {
    userId,
    syncAttempt: 3,
    lastError: "Connection timeout"
  })
  
  // Fatal level - critical system errors
  sentryLogger.fatal("Database connection lost", {
    userId,
    connectionPool: "users",
    activeConnections: 0
  })
}

// Example 8: UI Action Tracking with Sentry
export const trackButtonClick = (buttonName: string, componentName: string) => {
  // Create a transaction/span to measure performance
  Sentry.startSpan(
    {
      op: "ui.click",
      name: `Button Click: ${buttonName}`,
    },
    (span) => {
      const config = "production"
      const metric = "button_clicks"

      // Metrics can be added to the span
      span.setAttribute("config", config)
      span.setAttribute("metric", metric)
      span.setAttribute("component", componentName)
      span.setAttribute("button_name", buttonName)

      // Simulate some work
      console.log(`Sentry button clicked: ${buttonName}`)
      
      // Log the action
      sentryLogger.info("Button clicked", {
        component: componentName,
        buttonName,
        timestamp: Date.now()
      })
    }
  )
}

// Example usage:
// trackButtonClick("Test Sentry Integration", "ExampleComponent")

// Mock functions for examples
const bookAppointment = (data: any) => Promise.resolve({ success: true, id: '123' })
const submitVitalSigns = (data: any) => Promise.resolve({ success: true })
