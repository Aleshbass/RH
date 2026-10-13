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

    console.log("🧪 Starting Reminder System Tests...\n");

    // Test 1: Exercise Reminders
    try {
      console.log("📝 Test 1: Exercise Reminders");
      const exerciseResult = await ctx.runAction(
        internal.reminders.sendDailyExerciseReminders
      );
      
      results.tests.push({
        name: "Exercise Reminders",
        status: "✅ PASSED",
        details: exerciseResult || "No active plans found (expected if no data)",
      });
      results.summary.passed++;
      console.log("✅ Exercise reminders test passed");
      console.log("   Result:", JSON.stringify(exerciseResult, null, 2));
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
      console.log("\n📝 Test 2: Invoice Payment Reminders");
      const invoiceResult = await ctx.runAction(
        internal.reminderSystem.sendInvoicePaymentReminders
      );
      
      results.tests.push({
        name: "Invoice Payment Reminders",
        status: "✅ PASSED",
        details: invoiceResult,
      });
      results.summary.passed++;
      console.log("✅ Invoice reminders test passed");
      console.log("   Result:", JSON.stringify(invoiceResult, null, 2));
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
      console.log("\n📝 Test 3: Appointment Reminders");
      const appointmentResult = await ctx.runAction(
        internal.reminderSystem.sendAppointmentReminders
      );
      
      results.tests.push({
        name: "Appointment Reminders",
        status: "✅ PASSED",
        details: appointmentResult,
      });
      results.summary.passed++;
      console.log("✅ Appointment reminders test passed");
      console.log("   Result:", JSON.stringify(appointmentResult, null, 2));
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
      console.log("\n📝 Test 4: Query Functions");
      
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
      console.log("✅ Query functions test passed");
      console.log(`   Active Plans: ${activePlans.length}`);
      console.log(`   Unpaid Invoices: ${unpaidInvoices.length}`);
      console.log(`   Upcoming Appointments: ${upcomingAppointments.length}`);
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

    console.log("\n" + "=".repeat(60));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total Tests: ${results.summary.total}`);
    console.log(`✅ Passed: ${results.summary.passed}`);
    console.log(`❌ Failed: ${results.summary.failed}`);
    console.log(
      `Success Rate: ${Math.round((results.summary.passed / results.summary.total) * 100)}%`
    );
    console.log("=".repeat(60));

    if (results.summary.failed === 0) {
      console.log("\n🎉 ALL TESTS PASSED! Reminder system is wired correctly.");
    } else {
      console.log("\n⚠️  Some tests failed. Check errors above.");
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
    console.log("🧪 Testing Exercise Reminders Only...\n");
    
    try {
      const result = await ctx.runAction(internal.reminders.sendDailyExerciseReminders);
      console.log("✅ Test passed!");
      console.log("Result:", JSON.stringify(result, null, 2));
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
    console.log("🧪 Testing Invoice Payment Reminders Only...\n");
    
    try {
      const result = await ctx.runAction(
        internal.reminderSystem.sendInvoicePaymentReminders
      );
      console.log("✅ Test passed!");
      console.log("Result:", JSON.stringify(result, null, 2));
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
    console.log("🧪 Testing Appointment Reminders Only...\n");
    
    try {
      const result = await ctx.runAction(
        internal.reminderSystem.sendAppointmentReminders
      );
      console.log("✅ Test passed!");
      console.log("Result:", JSON.stringify(result, null, 2));
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
    console.log("🔍 Checking Test Data Availability...\n");

    const data = {
      activePlans: 0,
      unpaidInvoices: 0,
      upcomingAppointments: 0,
      recommendations: [] as string[],
    };

    try {
      const activePlans = await ctx.runQuery(internal.reminders.getAllActivePlans);
      data.activePlans = activePlans.length;
      console.log(`✅ Active Treatment Plans: ${activePlans.length}`);
      
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
      console.log(`✅ Unpaid Invoices: ${unpaidInvoices.length}`);
      
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
      console.log(`✅ Upcoming Appointments: ${upcomingAppointments.length}`);
      
      if (upcomingAppointments.length === 0) {
        data.recommendations.push(
          "Create an appointment 24 hours from now (status='scheduled') to test appointment reminders"
        );
      }
    } catch (e) {
      console.error("❌ Error checking upcoming appointments:", e);
    }

    console.log("\n" + "=".repeat(60));
    if (data.recommendations.length > 0) {
      console.log("💡 RECOMMENDATIONS:");
      data.recommendations.forEach((rec, i) => {
        console.log(`${i + 1}. ${rec}`);
      });
    } else {
      console.log("✅ All test data is available!");
    }
    console.log("=".repeat(60));

    return data;
  },
});
