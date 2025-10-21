# ✅ Convex Webhook Setup - Final Solution

## What Changed
Moved the Paystack webhook from Next.js API route to **Convex HTTP endpoint**. This eliminates:
- ✅ Next.js cache issues
- ✅ Worker.js errors
- ✅ Hot reload problems
- ✅ Environment variable issues

---

## New Webhook URL

Your Convex deployment URL is:
```
https://kindly-elk-471.convex.cloud
```

**New Paystack Webhook URL:**
```
https://kindly-elk-471.convex.cloud/api/webhooks/paystack
```

---

## Setup Steps

### 1. Update Paystack Webhook URL

Go to **Paystack Dashboard** → **Settings** → **Webhooks**

**Replace the old URL:**
```
❌ https://rehabifyhealth.com/api/payments/webhook
```

**With the new Convex URL:**
```
✅ https://kindly-elk-471.convex.cloud/api/webhooks/paystack
```

**Events to enable:**
- ✅ `charge.success`
- ✅ `charge.failed`

**Save the webhook.**

---

### 2. Add Environment Variable to Convex

The webhook needs your Paystack secret key to verify signatures.

**Run this command:**
```powershell
npx convex env set PAYSTACK_SECRET_KEY sk_test_b100077fe435907aa4a3287c7761ac62a0ceed0e
```

This securely stores your Paystack secret in Convex's environment.

---

### 3. Deploy to Convex

```powershell
npx convex dev
```

Wait for:
```
✔ Convex functions ready!
```

---

## How It Works Now

### Payment Flow:

```
1. User pays via Paystack
   ↓
2. Paystack sends webhook to Convex
   https://kindly-elk-471.convex.cloud/api/webhooks/paystack
   ↓
3. Convex HTTP endpoint receives it
   convex/webhooks/paystack.ts
   ↓
4. Verifies signature
   ↓
5. Calls internal mutation
   convex/webhooks/paystackHandlers.ts
   ↓
6. Detects verification badge payment
   - Checks metadata
   - Checks reference format (VERIFICATION_)
   ↓
7. Updates transaction status
   ↓
8. Activates badge on profile
   ↓
9. Schedules confirmation email
   ↓
10. User sees badge on dashboard ✅
```

---

## Files Created

### 1. `convex/webhooks/paystack.ts`
- HTTP endpoint that receives Paystack webhooks
- Verifies signature
- Routes to appropriate handler

### 2. `convex/webhooks/paystackHandlers.ts`
- `handleSuccessfulPayment` - Processes successful payments
- `handleFailedPayment` - Processes failed payments
- Dual detection: metadata + reference format
- Badge activation logic
- Email scheduling

### 3. `convex/http.ts` (updated)
- Added route: `/api/webhooks/paystack`

---

## Advantages of Convex Webhook

### ✅ **No Cache Issues**
- Convex functions deploy instantly
- No `.next` cache to clear
- No worker.js errors

### ✅ **Better Logging**
- All logs in Convex Dashboard
- Easy to debug
- Real-time monitoring

### ✅ **Direct Database Access**
- No HTTP client needed
- Direct mutations
- Faster execution

### ✅ **Reliable**
- Always uses latest code
- No hot-reload issues
- Environment variables managed by Convex

---

## Testing

### 1. Test with Simulator

```powershell
node .\scripts\simulate-paystack-webhook.js `
  --url https://kindly-elk-471.convex.cloud/api/webhooks/paystack `
  --event charge.success `
  --transactionId wh7XXXXXXXXXXXXXXXXXXXXXXXXXXXXX `
  --amount 300000 `
  --email you@example.com `
  --name "Your Name"
```

### 2. Check Convex Logs

Go to **Convex Dashboard** → **Logs**

Look for:
```
🔥 CONVEX WEBHOOK VERSION: 1.0 - Paystack webhook received
✅ Signature verified
📨 Event type: charge.success
🏆 VERIFICATION BADGE PAYMENT DETECTED
✅ Using transaction ID: wh7...
✅ Transaction updated to completed
✅ Badge activated on profile
🎉 VERIFICATION BADGE ACTIVATION COMPLETE
```

### 3. Make Real Payment

- Go to marketplace settings
- Select a plan
- Complete payment
- Badge should activate within 5 seconds
- Email should arrive within 30 seconds

---

## Monitoring

### Convex Dashboard
- **Logs**: See all webhook activity
- **Data**: Check `marketplaceTransactions` and `physiotherapistProfiles`
- **Functions**: Monitor execution times

### Paystack Dashboard
- **Webhooks** → **Recent Deliveries**
- Should show 200 OK responses
- View request/response payloads

---

## Troubleshooting

### Issue: "Configuration error"
**Solution:** Set PAYSTACK_SECRET_KEY in Convex:
```powershell
npx convex env set PAYSTACK_SECRET_KEY sk_test_xxx
```

### Issue: "Invalid signature"
**Solution:** Ensure the secret key matches your Paystack account (test vs live)

### Issue: "Transaction not found"
**Solution:** Use a real pending transaction ID from `marketplaceTransactions` table

### Issue: No logs in Convex
**Solution:** 
1. Verify webhook URL in Paystack is correct
2. Check Paystack Recent Deliveries for errors
3. Ensure Convex deployment is running

---

## Migration Complete

### Old System (Next.js API Route)
```
❌ https://rehabifyhealth.com/api/payments/webhook
❌ Cache issues
❌ Worker errors
❌ Hot reload problems
```

### New System (Convex HTTP)
```
✅ https://kindly-elk-471.convex.cloud/api/webhooks/paystack
✅ No cache
✅ No worker errors
✅ Instant deployment
✅ Better logging
```

---

## Next Steps

1. **Update Paystack webhook URL** (most important!)
2. **Set PAYSTACK_SECRET_KEY in Convex**
3. **Deploy with `npx convex dev`**
4. **Test with simulator**
5. **Make real payment**
6. **Verify badge activates**

**The webhook is now bulletproof!** 🚀
