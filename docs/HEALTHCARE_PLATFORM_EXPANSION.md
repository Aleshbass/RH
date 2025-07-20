# Rehabify Health - Comprehensive Healthcare Platform Expansion

## 🏥 **Platform Vision**

Transform Rehabify Health from a physiotherapy platform into a **comprehensive digital health ecosystem** with EHR, telehealth, e-prescriptions, billing integration, and advanced analytics.

## 🎯 **New Features Overview**

### 1. **Appointment Scheduling & Telehealth** 📅

- Self-service online booking for patients
- Automated appointment reminders (SMS/email via Resend)
- Integrated video consultations with WebRTC
- Doctor availability calendar with conflict detection
- Recurring appointment support

### 2. **Electronic Health Records (EHR)** 📋

- Centralized patient history (visits, treatments, prescriptions)
- Lab results, vitals tracking, medical imaging support
- Customizable templates for different specialties
- Download/print functionality with secure PDFs
- HIPAA-compliant data storage

### 3. **E-Prescription & Medication Tracking** 💊

- Generate/send prescriptions digitally
- Track medication history and adherence
- Flag drug interactions and allergies
- Integration with pharmacy networks
- Prescription refill management

### 4. **Billing & Insurance Integration** 💳

- Automated invoicing and receipts
- Insurance verification and claims submission
- **Paystack integration** for Nigerian market
- Payment gateway integration (multiple providers)
- Wallet/credit support for patients

### 5. **Data Analytics & Reporting** 📊

- Health trends (blood pressure, glucose levels over time)
- Reports for appointments, patient satisfaction, performance
- Admin dashboard for hospital performance tracking
- Predictive analytics for patient outcomes
- Export capabilities for regulatory compliance

### 6. **Patient Engagement Tools** 💬

- In-app chat/messaging with doctors
- Educational health content & resources
- Feedback & review system with moderation
- Patient portal with health goals and follow-ups
- Mobile-responsive patient experience

## 🗄 **Database Schema Extensions**

### **Enhanced Patient Records**

```typescript
// Extend existing patientProfiles table
patientProfiles: defineTable({
  // ... existing fields
  bloodType: v.optional(v.union(v.literal("A+"), v.literal("A-"), v.literal("B+"), v.literal("B-"), v.literal("AB+"), v.literal("AB-"), v.literal("O+"), v.literal("O-"))),
  weight: v.optional(v.number()),
  height: v.optional(v.number()),
  chronicConditions: v.optional(v.array(v.string())),
  allergies: v.optional(v.array(v.string())),
  currentMedications: v.optional(v.array(v.string())),
  insuranceProvider: v.optional(v.string()),
  insuranceNumber: v.optional(v.string()),
  nextOfKin: v.optional(v.object({
    name: v.string(),
    relationship: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
  })),
}),

// Enhanced Appointments with Telehealth
appointments: defineTable({
  // ... existing fields
  type: v.union(v.literal("in-person"), v.literal("telehealth"), v.literal("follow-up"), v.literal("consultation")),
  meetingLink: v.optional(v.string()),
  meetingId: v.optional(v.string()),
  recordingUrl: v.optional(v.string()),
  remindersSent: v.optional(v.array(v.object({
    type: v.union(v.literal("email"), v.literal("sms")),
    sentAt: v.number(),
    status: v.union(v.literal("delivered"), v.literal("failed")),
  }))),
  isRecurring: v.optional(v.boolean()),
  recurringPattern: v.optional(v.object({
    frequency: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
    interval: v.number(),
    endDate: v.optional(v.number()),
    daysOfWeek: v.optional(v.array(v.number())),
  })),
}),

// Medical Records & Lab Results
medicalRecords: defineTable({
  patientId: v.id("users"),
  providerId: v.id("users"),
  recordType: v.union(v.literal("visit_note"), v.literal("lab_result"), v.literal("imaging"), v.literal("prescription"), v.literal("referral")),
  title: v.string(),
  content: v.string(),
  attachments: v.optional(v.array(v.id("_storage"))),
  labValues: v.optional(v.array(v.object({
    testName: v.string(),
    value: v.string(),
    unit: v.string(),
    referenceRange: v.string(),
    status: v.union(v.literal("normal"), v.literal("high"), v.literal("low"), v.literal("critical")),
  }))),
  isPrivate: v.boolean(),
  shareableWith: v.optional(v.array(v.id("users"))),
  tags: v.optional(v.array(v.string())),
}),

// E-Prescriptions
prescriptions: defineTable({
  patientId: v.id("users"),
  providerId: v.id("users"),
  appointmentId: v.optional(v.id("appointments")),
  medications: v.array(v.object({
    name: v.string(),
    genericName: v.optional(v.string()),
    dosage: v.string(),
    frequency: v.string(),
    duration: v.string(),
    instructions: v.string(),
    quantity: v.number(),
    refills: v.number(),
    ndc: v.optional(v.string()), // National Drug Code
  })),
  status: v.union(v.literal("draft"), v.literal("sent"), v.literal("filled"), v.literal("cancelled")),
  pharmacyInfo: v.optional(v.object({
    name: v.string(),
    address: v.string(),
    phone: v.string(),
    faxNumber: v.optional(v.string()),
  })),
  interactions: v.optional(v.array(v.object({
    type: v.union(v.literal("drug_drug"), v.literal("drug_allergy"), v.literal("drug_condition")),
    severity: v.union(v.literal("mild"), v.literal("moderate"), v.literal("severe")),
    description: v.string(),
  }))),
  sentAt: v.optional(v.number()),
  filledAt: v.optional(v.number()),
}),

// Vital Signs Tracking
vitals: defineTable({
  patientId: v.id("users"),
  recordedBy: v.id("users"),
  appointmentId: v.optional(v.id("appointments")),
  recordedAt: v.number(),
  bloodPressure: v.optional(v.object({
    systolic: v.number(),
    diastolic: v.number(),
  })),
  heartRate: v.optional(v.number()),
  temperature: v.optional(v.number()),
  weight: v.optional(v.number()),
  height: v.optional(v.number()),
  bmi: v.optional(v.number()),
  oxygenSaturation: v.optional(v.number()),
  bloodGlucose: v.optional(v.number()),
  notes: v.optional(v.string()),
}),

// Insurance & Billing
insurance: defineTable({
  patientId: v.id("users"),
  provider: v.string(),
  policyNumber: v.string(),
  groupNumber: v.optional(v.string()),
  subscriberName: v.string(),
  subscriberDob: v.string(),
  relationship: v.union(v.literal("self"), v.literal("spouse"), v.literal("child"), v.literal("other")),
  isActive: v.boolean(),
  coverageDetails: v.optional(v.object({
    deductible: v.number(),
    copay: v.number(),
    outOfPocketMax: v.number(),
    coveragePercentage: v.number(),
  })),
  verificationStatus: v.union(v.literal("pending"), v.literal("verified"), v.literal("expired"), v.literal("invalid")),
  verifiedAt: v.optional(v.number()),
}),

// Enhanced Invoices with Insurance
invoices: defineTable({
  // ... existing fields
  insuranceClaimId: v.optional(v.string()),
  insuranceCoverage: v.optional(v.object({
    covered: v.number(),
    patientResponsibility: v.number(),
    copay: v.number(),
    deductible: v.number(),
  })),
  paymentMethod: v.optional(v.union(v.literal("cash"), v.literal("card"), v.literal("insurance"), v.literal("paystack"), v.literal("wallet"))),
  paystackReference: v.optional(v.string()),
  walletTransactionId: v.optional(v.string()),
}),

// Patient Wallet System
wallets: defineTable({
  userId: v.id("users"),
  balance: v.number(),
  currency: v.string(),
  isActive: v.boolean(),
  transactions: v.optional(v.array(v.object({
    id: v.string(),
    type: v.union(v.literal("credit"), v.literal("debit")),
    amount: v.number(),
    description: v.string(),
    reference: v.optional(v.string()),
    timestamp: v.number(),
  }))),
}),

// Telehealth Sessions
telehealthSessions: defineTable({
  appointmentId: v.id("appointments"),
  providerId: v.id("users"),
  patientId: v.id("users"),
  sessionToken: v.string(),
  roomId: v.string(),
  status: v.union(v.literal("scheduled"), v.literal("active"), v.literal("ended"), v.literal("cancelled")),
  startedAt: v.optional(v.number()),
  endedAt: v.optional(v.number()),
  duration: v.optional(v.number()),
  recordingUrl: v.optional(v.string()),
  participants: v.array(v.object({
    userId: v.id("users"),
    joinedAt: v.number(),
    leftAt: v.optional(v.number()),
  })),
  sessionNotes: v.optional(v.string()),
  recordingEnabled: v.boolean(),
  chatHistory: v.optional(v.array(v.object({
    userId: v.id("users"),
    message: v.string(),
    timestamp: v.number(),
  }))),
}),

// Health Goals & Care Plans
carePlans: defineTable({
  patientId: v.id("users"),
  providerId: v.id("users"),
  title: v.string(),
  description: v.string(),
  goals: v.array(v.object({
    id: v.string(),
    description: v.string(),
    targetValue: v.optional(v.string()),
    currentValue: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("completed"), v.literal("paused")),
    progress: v.number(), // 0-100
  })),
  status: v.union(v.literal("active"), v.literal("completed"), v.literal("discontinued")),
  startDate: v.number(),
  endDate: v.optional(v.number()),
  reviewDate: v.optional(v.number()),
}),
```

## 🛠 **Implementation Roadmap**

### **Phase 1: Enhanced Dashboard & Core Infrastructure (Weeks 1-2)**

- ✅ Complete PhysiotherapistDashboard with all healthcare features
- Extend database schema for healthcare data
- Set up Paystack integration
- Implement basic telehealth infrastructure

### **Phase 2: Appointment System & Scheduling (Weeks 3-4)**

- Full calendar with React Big Calendar
- Appointment booking system with conflict detection
- Automated reminders via Resend
- Recurring appointment logic
- Provider availability management

### **Phase 3: Electronic Health Records (Weeks 5-6)**

- Patient medical history interface
- Lab results and vitals tracking
- Medical record templates
- File upload for medical images
- PDF generation for reports

### **Phase 4: E-Prescription System (Weeks 7-8)**

- Digital prescription creation
- Drug interaction checking
- Pharmacy integration
- Prescription history tracking
- Medication adherence monitoring

### **Phase 5: Telehealth Integration (Weeks 9-10)**

- WebRTC video calling
- Session recording
- Screen sharing capabilities
- Chat during video calls
- Session notes and follow-up

### **Phase 6: Billing & Insurance (Weeks 11-12)**

- Insurance verification
- Claims submission
- Paystack payment processing
- Wallet system for patients
- Financial reporting

### **Phase 7: Analytics & Reporting (Weeks 13-14)**

- Health trend analysis
- Provider performance metrics
- Patient outcome tracking
- Regulatory compliance reports
- Data export capabilities

## 💳 **Paystack Integration Architecture**

### **Payment Flow**

```typescript
// Paystack Integration
const paystackConfig = {
  publicKey: process.env.PAYSTACK_PUBLIC_KEY,
  secretKey: process.env.PAYSTACK_SECRET_KEY,
  callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/callback`,
};

// Payment Processing
async function processPayment(invoiceId: string, amount: number) {
  const reference = generatePaystackReference();

  // Initialize payment
  const response = await fetch(
    "https://api.paystack.co/transaction/initialize",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackConfig.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: patient.email,
        amount: amount * 100, // Paystack uses kobo
        reference,
        callback_url: paystackConfig.callbackUrl,
        metadata: {
          invoiceId,
          patientId: patient._id,
          clinicId: clinic._id,
        },
      }),
    },
  );

  return response.json();
}
```

### **Webhook Handling**

```typescript
// API route: /api/payments/webhook
export async function POST(request: Request) {
  const signature = request.headers.get("x-paystack-signature");
  const body = await request.text();

  // Verify webhook signature
  const hash = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!)
    .update(body)
    .digest("hex");

  if (hash !== signature) {
    return new Response("Invalid signature", { status: 401 });
  }

  const event = JSON.parse(body);

  if (event.event === "charge.success") {
    // Update invoice status
    await updateInvoiceStatus(event.data.metadata.invoiceId, "paid");

    // Send payment confirmation
    await sendPaymentConfirmation(event.data.metadata.patientId);
  }

  return new Response("OK");
}
```

## 🎥 **Telehealth Implementation**

### **Video Calling with WebRTC**

```typescript
// Telehealth Service
import { Peer } from "peerjs";

export class TelehealthService {
  private peer: Peer;
  private localStream: MediaStream | null = null;

  async startSession(sessionId: string) {
    // Initialize peer connection
    this.peer = new Peer(sessionId, {
      host: process.env.NEXT_PUBLIC_PEER_SERVER,
      port: 9000,
      path: "/peerjs",
    });

    // Get user media
    this.localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    return this.localStream;
  }

  async joinSession(sessionId: string) {
    const call = this.peer.call(sessionId, this.localStream!);

    call.on("stream", (remoteStream) => {
      // Display remote stream
      const videoElement = document.getElementById(
        "remote-video",
      ) as HTMLVideoElement;
      videoElement.srcObject = remoteStream;
    });

    return call;
  }
}
```

## 📊 **Advanced Analytics**

### **Health Trend Analysis**

```typescript
// Analytics Queries
export const getPatientHealthTrends = query({
  args: {
    patientId: v.id("users"),
    metric: v.union(
      v.literal("bloodPressure"),
      v.literal("weight"),
      v.literal("bloodGlucose"),
    ),
    timeRange: v.union(
      v.literal("7d"),
      v.literal("30d"),
      v.literal("90d"),
      v.literal("1y"),
    ),
  },
  handler: async (ctx, args) => {
    const endDate = Date.now();
    const startDate = getStartDate(args.timeRange, endDate);

    const vitals = await ctx.db
      .query("vitals")
      .withIndex("by_patient_and_date", (q) =>
        q
          .eq("patientId", args.patientId)
          .gte("recordedAt", startDate)
          .lte("recordedAt", endDate),
      )
      .collect();

    return processHealthTrends(vitals, args.metric);
  },
});
```

## 🚀 **Getting Started**

### **1. Install Additional Dependencies**

```bash
pnpm add @paystack/inline-js react-webcam socket.io-client peerjs recharts html2canvas jspdf
pnpm add -D @types/peerjs
```

### **2. Environment Variables**

```bash
# Paystack Configuration
PAYSTACK_PUBLIC_KEY=pk_test_xxxxx
PAYSTACK_SECRET_KEY=sk_test_xxxxx

# Telehealth Configuration
NEXT_PUBLIC_PEER_SERVER=localhost
AGORA_APP_ID=xxxxx
AGORA_APP_CERTIFICATE=xxxxx

# SMS Provider (for reminders)
TWILIO_ACCOUNT_SID=xxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=xxxxx
```

### **3. Next Steps**

1. ✅ **PhysiotherapistDashboard is complete** - Ready to use!
2. Update database schema with healthcare extensions
3. Implement Paystack payment integration
4. Build appointment scheduling system
5. Add telehealth video calling
6. Create EHR interfaces

## 🏆 **Platform Benefits**

### **For Healthcare Providers:**

- Comprehensive patient management
- Efficient appointment scheduling
- Digital prescription system
- Revenue tracking and analytics
- Telehealth capabilities

### **For Patients:**

- Easy appointment booking
- Access to medical records
- Secure messaging with providers
- Health goal tracking
- Multiple payment options

### **For Administrators:**

- System-wide analytics
- User management
- Compliance reporting
- Financial oversight
- Platform health monitoring

---

**This expansion transforms Rehabify Health into a complete digital health ecosystem that rivals international platforms while being specifically designed for the African healthcare market with Paystack integration and local compliance.**
