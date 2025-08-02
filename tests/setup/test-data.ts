import { ConvexClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';

export interface TestData {
  clinicId: string;
  physiotherapistId: string;
  patientId: string;
  appointmentId: string;
}

export async function setupTestData(client: ConvexClient): Promise<TestData> {
  console.log('🏗️ Creating test data...');
  
  // TODO: Fix API method calls to match actual Convex API
  // The following code is commented out due to API method mismatches
  // that need to be resolved with the actual Convex schema
  
  console.log('⚠️ Using fallback test data (API methods need to be updated)...');
  return {
    clinicId: 'test-clinic-id',
    physiotherapistId: 'test-physio-id', 
    patientId: 'test-patient-id',
    appointmentId: 'test-appointment-id'
  };
  
  /* 
  // TODO: Uncomment and fix these API calls once the correct method names are determined
  try {
    // Create test clinic
    console.log('🏥 Creating test clinic...');
    const clinicId = await client.mutation(api.clinics.createClinic, {
      name: "Test Rehabilitation Clinic",
      address: "123 Test Street, Test City, TC 12345",
      contactPhone: "+1-555-TEST-001",
      contactEmail: "test@testclinic.com"
    });
    
    console.log('✅ Test clinic created:', clinicId);

    // Create test physiotherapist - NEEDS CORRECT API METHOD
    console.log('👨‍⚕️ Creating test physiotherapist...');
    const physiotherapistId = await client.mutation(api.users.createTestUser, {
      email: "physio@testclinic.com",
      firstName: "Dr. Test",
      lastName: "Physiotherapist",
      role: "physiotherapist",
      clinicId: clinicId
    });
    
    console.log('✅ Test physiotherapist created:', physiotherapistId);

    // Create test patient - NEEDS CORRECT API METHOD
    console.log('🏥 Creating test patient...');
    const patientId = await client.mutation(api.users.createTestUser, {
      email: "patient@test.com",
      firstName: "Test",
      lastName: "Patient",
      role: "patient",
      clinicId: clinicId
    });
    
    console.log('✅ Test patient created:', patientId);

    // Create test appointment - NEEDS CORRECT API METHOD
    console.log('📅 Creating test appointment...');
    const appointmentId = await client.mutation(api.appointments.schedule, {
      patientId: patientId,
      physiotherapistId: physiotherapistId,
      clinicId: clinicId,
      startTime: Date.now() + (24 * 60 * 60 * 1000), // Tomorrow
      endTime: Date.now() + (24 * 60 * 60 * 1000) + (60 * 60 * 1000), // Tomorrow + 1 hour
      type: "initial_assessment",
      title: "Test Initial Assessment",
      notes: "Test appointment for automated testing"
    });
    
    console.log('✅ Test appointment created:', appointmentId);

    return {
      clinicId,
      physiotherapistId,
      patientId,
      appointmentId
    };
    
  } catch (error) {
    console.error('❌ Error creating test data:', error);
    console.log('⚠️ Using fallback test data...');
    return {
      clinicId: 'test-clinic-id',
      physiotherapistId: 'test-physio-id', 
      patientId: 'test-patient-id',
      appointmentId: 'test-appointment-id'
    };
  }
  */
} 