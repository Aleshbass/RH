# 🚨 Verification Badge Quick Fix

## Current Status
✅ Payment succeeds and shows success modal  
❌ Badge doesn't activate  
❌ Dashboard doesn't update  
❌ No email sent  

---

## 🎯 Most Likely Issue: Webhook Not Set Up

The webhook is the critical piece that activates the badge AFTER Paystack confirms payment.

### **Quick Check:**

1. Go to **Paystack Dashboard** → **Settings** → **Webhooks**
2. Is there a webhook URL configured?
   - **YES** → Proceed to Step 2
   - **NO** → This is the issue! Set it up now.

---

## 🔧 Solution 1: Set Up Paystack Webhook (Production)

### **In Paystack Dashboard:**

1. **Settings** → **Webhooks**
2. **Add Webhook URL:**
   ```
   https://rehabifyhealth.com/api/payments/webhook
   ```
3. **Select Events:**
   - ✅ `charge.success`
   - ✅ `charge.failed`
4. **Save**

### **Test It:**
1. Make a test payment (use small amount like ₦100)
2. Check **Webhooks** → **Recent Deliveries** tab
3. Should see webhook sent with **200 OK** response

---

## 🔧 Solution 2: Local Testing with ngrok

For testing locally before production:

### **Step 1: Install and Run ngrok**
```bash
# Install ngrok globally
npm install -g ngrok

# In separate terminal, run your app
pnpm dev

# In another terminal, run ngrok
ngrok http 3001
```

### **Step 2: Configure Paystack**
1. Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)
2. Go to Paystack Dashboard → Webhooks
3. Add webhook URL:
   ```
   https://abc123.ngrok.io/api/payments/webhook
   ```

### **Step 3: Test Payment**
- Make a test payment
- Watch the ngrok terminal for incoming webhook
- Check your Next.js terminal for logs

---

## 🔧 Solution 3: Manual Badge Activation (Temporary)

If webhook setup takes time, manually activate badges:

### **Using Convex Dashboard:**

1. Go to https://dashboard.convex.dev
2. Select your project
3. Go to **Functions** tab
4. Find `marketplace/verification:completeVerificationPurchase`
5. Click **Run Mutation**
6. Enter transaction details:
   ```json
   {
     "transactionId": "k17...", // Get from marketplaceTransactions table
     "paymentReference": "T_..." // Get from Paystack
   }
   ```
7. Click **Run**
8. Refresh user's dashboard

---

## 📊 How to Find Transaction ID

### **In Convex Dashboard:**

1. Go to **Data** tab
2. Select `marketplaceTransactions` table
3. Sort by `createdAt` (newest first)
4. Find the transaction with:
   - `type: "verification_badge"`
   - `status: "pending"`
   - Correct `userId`
5. Copy the `_id` - this is your `transactionId`

---

## 🧪 Verification Checklist

After setting up webhook, verify:

### **1. Environment Variables**
```env
# .env.local or Vercel Environment Variables
PAYSTACK_SECRET_KEY=sk_test_xxx... or sk_live_xxx...
RESEND_API_KEY=re_xxx...
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_xxx... or pk_live_xxx...
```

### **2. Webhook Endpoint Working**
Test the endpoint directly:
```bash
curl -X POST https://rehabifyhealth.com/api/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{"event":"charge.success","data":{"reference":"TEST"}}'
```

Should return: `{"received":true}`

### **3. Badge Activation Logic**
Check in Convex Dashboard logs for:
```
✅ "Verification badge activated for user..."
✅ No errors in mutation
```

---

## 🎯 Expected Timeline After Payment

```
0s   - User clicks "Pay" → Paystack popup opens
30s  - User completes payment → Paystack popup closes
3s   - Success toast shows: "Activating your verification badge..."
6s   - Page reloads automatically
6s   - Dashboard shows verified badge ✅
10s  - Email arrives in inbox ✅
```

**If this doesn't happen within 30 seconds, the webhook isn't working.**

---

## 🔍 Debug Commands

### **Check if webhook is receiving requests:**
```bash
# View Next.js server logs
# Should see webhook POST requests when payment completes
```

### **Check Convex logs:**
```bash
# In Convex Dashboard → Logs
# Filter by "verification badge"
```

### **Check Paystack webhook deliveries:**
```
Paystack Dashboard → Settings → Webhooks → Recent Deliveries
```

---

## 📞 Still Not Working?

### **Collect This Info:**

1. **Paystack Reference** (from payment confirmation)
2. **Transaction ID** (from Convex `marketplaceTransactions`)
3. **Webhook Response** (from Paystack Recent Deliveries)
4. **Console Errors** (from browser DevTools)
5. **Convex Logs** (screenshot from dashboard)

With this info, we can pinpoint the exact issue.

---

## ✅ Success Indicators

You'll know it's working when:
- ✅ Badge appears in marketplace settings
- ✅ Profile shows "Verified" status
- ✅ Dashboard stats update
- ✅ Email received
- ✅ Confetti animation on success
- ✅ "Profile now visible" badge card shows

---

## 🚀 Priority Actions (Do These Now)

1. **Set up Paystack webhook URL** (most critical)
2. **Verify environment variables** are set
3. **Test with small payment** (₦100)
4. **Check webhook deliveries** in Paystack
5. **Monitor Convex logs** during test

**The webhook is the missing piece - set it up and everything will work!** 🎯
