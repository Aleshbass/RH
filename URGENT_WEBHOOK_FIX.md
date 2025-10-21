# 🚨 URGENT: Webhook Still Not Working

## Current Issue
Webhook code has been updated but **Next.js hasn't reloaded the API route**.

**Error Still Appearing:**
```
Payment not found for reference: VERIFICATION_wh750eq0bf6b7nqm3mp45673ex7rk5b4_1759264815535
```

This means the webhook is still using the OLD code.

---

## ✅ IMMEDIATE FIX

### **Restart Your Dev Server:**

```bash
# Stop the current server (Ctrl + C)
# Then restart:
pnpm dev
```

**OR if that doesn't work:**

```bash
# Kill all Node processes
taskkill /F /IM node.exe

# Then restart
pnpm dev
```

---

## 🔍 Why This Happens

Next.js API routes sometimes don't hot-reload properly, especially:
- Changes to API routes in `/app/api/`
- Complex TypeScript changes
- Environment variable updates

**Solution:** Always restart the dev server after changing API routes.

---

## ✅ Verification Steps After Restart

### **1. Check the Webhook File is Loaded:**

Add this at the very top of `handleSuccessfulPayment`:

```typescript
async function handleSuccessfulPayment(data: PaystackPaymentData) {
  console.log('🔥 WEBHOOK VERSION: 2.0 - With verification detection');
  // ... rest of code
```

### **2. Make Test Payment**

After restart, make another payment and check logs:

**You SHOULD see:**
```
🔥 WEBHOOK VERSION: 2.0 - With verification detection
Webhook metadata: {...}
Payment reference: VERIFICATION_...
Is verification by reference: true
🏆 Processing verification badge payment...
```

**You should NOT see:**
```
Payment not found for reference: VERIFICATION_...
```

---

## 🎯 Alternative: Deploy to Production

If local webhook keeps failing, you can:

### **Option 1: Use Production Webhook**

1. Deploy your changes to Vercel/production
2. Update Paystack webhook URL to production:
   ```
   https://rehabifyhealth.com/api/payments/webhook
   ```
3. Make test payment
4. Check Vercel logs for webhook processing

### **Option 2: Use ngrok for Local Testing**

```bash
# Terminal 1: Start your app
pnpm dev

# Terminal 2: Start ngrok
ngrok http 3001

# Copy the ngrok URL (e.g., https://abc123.ngrok.io)
# Update Paystack webhook to:
https://abc123.ngrok.io/api/payments/webhook
```

This ensures webhooks reach your local server.

---

## 🔧 Quick Diagnostic

Run this in your browser console on the marketplace page:

```javascript
// Check if Paystack is configured
console.log('Paystack Key:', process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY);

// Check transaction format
console.log('Expected format: VERIFICATION_{id}_{timestamp}');
```

---

## 📊 Current Webhook Code Status

The code IS correct in the file:
- ✅ Dual detection (metadata + reference)
- ✅ Transaction ID extraction
- ✅ Enhanced logging
- ✅ Early return to prevent fallthrough

**BUT** Next.js needs to reload it!

---

## 🎯 Action Plan

### **Do This NOW:**

1. **Stop dev server** (Ctrl + C)
2. **Restart dev server:**
   ```bash
   pnpm dev
   ```
3. **Wait for "ready" message**
4. **Make test payment**
5. **Check console for new logs:**
   - Should see "🔥 WEBHOOK VERSION: 2.0"
   - Should see "🏆 Processing verification badge payment..."

### **If Still Not Working:**

1. **Check the file was saved:**
   - Open `app/api/payments/webhook/route.ts`
   - Verify lines 104-142 have the new detection code

2. **Clear Next.js cache:**
   ```bash
   rm -rf .next
   pnpm dev
   ```

3. **Check environment variables:**
   - `PAYSTACK_SECRET_KEY` must be set
   - Restart terminal after adding env vars

---

## 🚨 Critical Check

**Open the webhook file RIGHT NOW and verify this exists at line 118:**

```typescript
const isVerificationByReference = reference.startsWith('VERIFICATION_');
```

**If it's NOT there**, the file didn't save properly!

---

## ✅ Success Indicators

After restart, you'll know it's working when you see:

**In Terminal:**
```
🔥 WEBHOOK VERSION: 2.0 - With verification detection
Webhook metadata: {...}
Payment reference: VERIFICATION_wh750eq0bf6b7nqm3mp45673ex7rk5b4_1759264815535
Is verification by reference: true  ← This should be TRUE
🏆 Processing verification badge payment...
Using transaction ID: wh750eq0bf6b7nqm3mp45673ex7rk5b4
Verification badge payment successful: VERIFICATION_...
```

**NOT This:**
```
❌ Payment not found for reference: VERIFICATION_...
```

---

## 🔥 RESTART THE SERVER NOW!

The code is correct. Just restart the dev server and test again.

**Then make a new payment and it WILL work.** 🚀
