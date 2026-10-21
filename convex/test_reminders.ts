// @ts-nocheck
import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { ensureUserRole } from "./auth";

// These actions send real reminders to every matching user, so only admins may run them.
export const assertAdmin = internalQuery({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);
    return null;
  },
});

/**
 * Test suite for reminder systems
 * Run this manually to verify all reminder systems are wired correctly
 */

export const testAllReminders = action({
  handler: async (ctx) => {
    await ctx.runQuery(internal.test_reminders.assertAdmin, {});
    const results = {
      timestamp: new Date().toISOString(),
      tests: [] as any[],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
      },
    };


    // Test 1: Exercise Reminders
    try {
      const exerciseResult = await ctx.runAction(
        internal.reminders.sendDailyExerciseReminders
      );
      
      results.tests.push({
        name: "Exercise Reminders",
        status: "✅ PASSED",
        details: exerciseResult || "No active plans found (expected if no data)",
      });
      results.summary.passed++;
    } catch (e) {
      results.tests.push({
        name: "Exercise Reminders",
        status: "❌ FAILED",
        error: (e as Error).message,
      });
      results.summary.failed++;
      console.error("❌ Exercise reminders test failed:", e);
    }

    // Test 2: Invoice Payment Reminders
    try {
      const invoiceResult = await ctx.runAction(
        internal.reminderSystem.sendInvoicePaymentReminders
      );
      
      results.tests.push({
        name: "Invoice Payment Reminders",
        status: "✅ PASSED",
        details: invoiceResult,
      });
      results.summary.passed++;
    } catch (e) {
      results.tests.push({
        name: "Invoice Payment Reminders",
        status: "❌ FAILED",
        error: (e as Error).message,
      });
      results.summary.failed++;
      console.error("❌ Invoice reminders test failed:", e);
    }

    // Test 3: Appointment Reminders
    try {
      const appointmentResult = await ctx.runAction(
        internal.reminderSystem.sendAppointmentReminders
      );
      
      results.tests.push({
        name: "Appointment Reminders",
        status: "✅ PASSED",
        details: appointmentResult,
      });
      results.summary.passed++;
    } catch (e) {
      results.tests.push({
        name: "Appointment Reminders",
        status: "❌ FAILED",
        error: (e as Error).message,
      });
      results.summary.failed++;
      console.error("❌ Appointment reminders test failed:", e);
    }

    // Test 4: Query Functions
    try {
      
      const activePlans = await ctx.runQuery(internal.reminders.getAllActivePlans);
      const unpaidInvoices = await ctx.runQuery(internal.reminderSystem.getUnpaidInvoices);
      const upcomingAppointments = await ctx.runQuery(
        internal.reminderSystem.getUpcomingAppointments
      );

      results.tests.push({
        name: "Query Functions",
        status: "✅ PASSED",
        details: {
          activePlans: activePlans.length,
          unpaidInvoices: unpaidInvoices.length,
          upcomingAppointments: upcomingAppointments.length,
        },
      });
      results.summary.passed++;
    } catch (e) {
      results.tests.push({
        name: "Query Functions",
        status: "❌ FAILED",
        error: (e as Error).message,
      });
      results.summary.failed++;
      console.error("❌ Query functions test failed:", e);
    }

    results.summary.total = results.tests.length;


    if (results.summary.failed === 0) {
    } else {
    }

    return results;
  },
});

/**
 * Test individual reminder system
 */
export const testExerciseReminders = action({
  handler: async (ctx) => {
    await ctx.runQuery(internal.test_reminders.assertAdmin, {});
    
    try {
      const result = await ctx.runAction(internal.reminders.sendDailyExerciseReminders);
      return { success: true, result };
    } catch (e) {
      console.error("❌ Test failed:", e);
      return { success: false, error: (e as Error).message };
    }
  },
});

export const testInvoiceReminders = action({
  handler: async (ctx) => {
    await ctx.runQuery(internal.test_reminders.assertAdmin, {});
    
    try {
      const result = await ctx.runAction(
        internal.reminderSystem.sendInvoicePaymentReminders
      );
      return { success: true, result };
    } catch (e) {
      console.error("❌ Test failed:", e);
      return { success: false, error: (e as Error).message };
    }
  },
});

export const testAppointmentReminders = action({
  handler: async (ctx) => {
    await ctx.runQuery(internal.test_reminders.assertAdmin, {});
    
    try {
      const result = await ctx.runAction(
        internal.reminderSystem.sendAppointmentReminders
      );
      return { success: true, result };
    } catch (e) {
      console.error("❌ Test failed:", e);
      return { success: false, error: (e as Error).message };
    }
  },
});

/**
 * Check data availability for testing
 */
export const checkTestData = action({
  handler: async (ctx) => {
    await ctx.runQuery(internal.test_reminders.assertAdmin, {});

    const data = {
      activePlans: 0,
      unpaidInvoices: 0,
      upcomingAppointments: 0,
      recommendations: [] as string[],
    };

    try {
      const activePlans = await ctx.runQuery(internal.reminders.getAllActivePlans);
      data.activePlans = activePlans.length;
      
      if (activePlans.length === 0) {
        data.recommendations.push(
          "Create an active treatment plan with daily exercises to test exercise reminders"
        );
      }
    } catch (e) {
      console.error("❌ Error checking active plans:", e);
    }

    try {
      const unpaidInvoices = await ctx.runQuery(
        internal.reminderSystem.getUnpaidInvoices
      );
      data.unpaidInvoices = unpaidInvoices.length;
      
      if (unpaidInvoices.length === 0) {
        data.recommendations.push(
          "Create an unpaid invoice (status='sent') with past due date to test invoice reminders"
        );
      }
    } catch (e) {
      console.error("❌ Error checking unpaid invoices:", e);
    }

    try {
      const upcomingAppointments = await ctx.runQuery(
        internal.reminderSystem.getUpcomingAppointments
      );
      data.upcomingAppointments = upcomingAppointments.length;
      
      if (upcomingAppointments.length === 0) {
        data.recommendations.push(
          "Create an appointment 24 hours from now (status='scheduled') to test appointment reminders"
        );
      }
    } catch (e) {
      console.error("❌ Error checking upcoming appointments:", e);
    }

    if (data.recommendations.length > 0) {
      data.recommendations.forEach((rec, i) => {
      });
    } else {
    }

    return data;
  },
});
