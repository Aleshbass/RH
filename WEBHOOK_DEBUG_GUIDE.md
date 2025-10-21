# Verification Badge Webhook Debugging Guide

## Issue
Payment succeeds but badge doesn't activate, no email sent, dashboard doesn't update.

## Root Cause Analysis

### Possible Issues:
1. **Webhook not receiving events** - Paystack not sending webhooks to your server
2. **Webhook signature verification failing** - Security check blocking requests
3. **Metadata not being passed correctly** - Transaction ID or type missing
4. **Convex mutation failing silently** - Error in activation logic

---

## Step 1: Check Paystack Webhook Setup

### In Paystack Dashboard:

1. Go to **Settings** → **Webhooks**
2. Verify webhook URL is set to:
   ```
   https://rehabifyhealth.com/api/payments/webhook
   ```
   OR for local testing:
   ```
   https://your-ngrok-url.ngrok.io/api/payments/webhook
   ```

3. Check **Event Types** - Must include:
   - `charge.success`
   - `charge.failed`

4. Check **Recent Deliveries** tab:
   - Are webhooks being sent?
   - What's the HTTP response code?
   - View request/response payloads

---

## Step 2: Test Webhook Locally

### Using ngrok for local testing:

1. **Install ngrok:**
   ```bash
   npm install -g ngrok
   ```

2. **Start your Next.js app:**
   ```bash
   pnpm dev
   ```

3. **Start ngrok:**
   ```bash
   ngrok http 3001
   ```

4. **Update Paystack webhook URL** to the ngrok URL:
   ```
   https://your-ngrok-id.ngrok.io/api/payments/webhook
   ```

5. **Make a test payment** and watch the ngrok console for incoming requests

---

## Step 3: Add Console Logging

### Update webhook to log everything:

**File: `app/api/payments/webhook/route.ts`**

Add these logs:

```typescript
export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('x-paystack-signature');
    const rawBody = await request.text();
    
    // LOG 1: Webhook received
    console.log('🔔 WEBHOOK RECEIVED');
    console.log('Signature:', signature);
    console.log('Raw Body:', rawBody);
    
    // Verify webhook signature
    if (signature && !verifyWebhookSignature(rawBody, signature)) {
      console.log('❌ SIGNATURE VERIFICATION FAILED');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }
    
    console.log('✅ SIGNATURE VERIFIED');

    const event = JSON.parse(rawBody);
    
    // LOG 2: Event details
    console.log('Event Type:', event.event);
    console.log('Event Data:', JSON.stringify(event.data, null, 2));
    
    // Handle different event types
    switch (event.event) {
      case 'charge.success':
        console.log('💳 Processing charge.success...');
        await handleSuccessfulPayment(event.data);
        break;
      // ...
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('💥 WEBHOOK ERROR:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
```

---

## Step 4: Check Metadata Format

### The metadata MUST match this structure:

```typescript
metadata: {
  custom_fields: [
    {
      display_name: "Transaction ID",
      variable_name: "transaction_id",
      value: "k17abc123...", // Your Convex transaction ID
    },
    {
      display_name: "Transaction Type",
      variable_name: "transaction_type",
      value: "verification_badge",
    },
  ],
}
```

### Add logging in handleSuccessfulPayment:

```typescript
async function handleSuccessfulPayment(data: PaystackPaymentData) {
  const { reference, amount, metadata, status } = data;
  
  console.log('💰 Payment Data:', { reference, amount, status });
  console.log('📦 Metadata:', JSON.stringify(metadata, null, 2));
  
  if (status !== 'success') return;

  try {
    const transactionType = metadata?.custom_fields?.find(
      (field: any) => field.variable_name === 'transaction_type'
    )?.value;

    const transactionId = metadata?.custom_fields?.find(
      (field: any) => field.variable_name === 'transaction_id'
    )?.value;
    
    console.log('🎫 Transaction Type:', transactionType);
    console.log('🆔 Transaction ID:', transactionId);

    if (transactionType === 'verification_badge' && transactionId) {
      console.log('🏆 VERIFICATION BADGE PAYMENT DETECTED');
      
      const result = await convex.mutation(/* ... */);
      
      console.log('✅ Badge Activation Result:', result);
      
      // Send email...
      console.log('📧 Sending confirmation email...');
      
      return;
    }
    
    console.log('⚠️ Not a verification badge payment');
  } catch (error) {
    console.error('❌ Error in handleSuccessfulPayment:', error);
    throw error;
  }
}
```

---

## Step 5: Verify Convex Mutation

### Check the mutation is working:

1. Open Convex Dashboard: https://dashboard.convex.dev
2. Go to your project
3. Click **Logs** tab
4. Look for:
   - `Verification badge activated for user...`
   - Any error messages

### Test mutation directly:

In Convex Dashboard > Functions:

1. Find `marketplace/verification:completeVerificationPurchase`
2. Click **Test**
3. Use a real transaction ID
4. Check if it activates the badge

---

## Step 6: Check Email Sending

### Verify Resend API Key:

1. Check `.env.local` or environment variables:
   ```
   RESEND_API_KEY=re_xxx...
   ```

2. Test email action in Convex Dashboard

3. Check Resend Dashboard for delivery logs

---

## Quick Fix: Manual Activation

If webhook isn't working, manually activate via Convex Dashboard:

```typescript
// In Convex Dashboard > Functions > Run mutation
// Function: marketplace/verification:completeVerificationPurchase

{
  "transactionId": "your_transaction_id_here",
  "paymentReference": "your_paystack_reference"
}
```

---

## Expected Flow

```
1. User pays via Paystack popup
   ↓
2. Paystack sends webhook to your server
   ↓
3. Webhook verifies signature
   ↓
4. Webhook extracts metadata
   ↓
5. Webhook calls completeVerificationPurchase mutation
   ↓
6. Mutation updates physiotherapistProfile with badge
   ↓
7. Mutation returns success + user data
   ↓
8. Webhook sends confirmation email via Resend
   ↓
9. User's page reloads after 3 seconds
   ↓
10. Badge appears on dashboard ✅
```

---

## Common Issues & Solutions

### Issue: "Webhook not received"
**Solution**: Use ngrok for local testing or check Paystack webhook logs

### Issue: "Signature verification failed"
**Solution**: Ensure `PAYSTACK_SECRET_KEY` env variable is correct

### Issue: "Transaction ID not found in metadata"
**Solution**: Check Paystack popup initialization - metadata must be set correctly

### Issue: "Mutation fails silently"
**Solution**: Check Convex logs, add try-catch, verify transaction exists

### Issue: "Email not sent"
**Solution**: Verify `RESEND_API_KEY`, check Resend dashboard

---

## Testing Checklist

- [ ] Paystack webhook URL configured correctly
- [ ] Webhook signature verification working
- [ ] Metadata being passed with correct format
- [ ] Transaction ID exists in database
- [ ] Convex mutation completes successfully
- [ ] Badge appears on profile after mutation
- [ ] Email sent via Resend
- [ ] Dashboard updates after page reload
- [ ] Confetti shows on success

---

## Need More Help?

Check logs in this order:
1. **Paystack Dashboard** → Webhooks → Recent Deliveries
2. **Next.js Console** → API route logs
3. **Convex Dashboard** → Logs
4. **Resend Dashboard** → Emails

All three must show success for the flow to work correctly.
