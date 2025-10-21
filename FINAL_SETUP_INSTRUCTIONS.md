# 🎯 FINAL SETUP - 3 Simple Steps

## ✅ What We Fixed
Moved Paystack webhook from Next.js to **Convex HTTP endpoint** to eliminate all cache and worker errors.

---

## 🚀 Step 1: Update Paystack Webhook URL

Go to: **https://dashboard.paystack.com/#/settings/developer**

Click on **Webhooks** tab

**Change the webhook URL from:**
```
https://rehabifyhealth.com/api/payments/webhook
```

**To:**
```
https://kindly-elk-471.convex.cloud/api/webhooks/paystack
```

**Events to enable:**
- ✅ charge.success
- ✅ charge.failed

Click **Save**

---

## ✅ Step 2: Environment Variable (Already Done!)

```
✔ Successfully set PAYSTACK_SECRET_KEY
```

---

## 🧪 Step 3: Test the Webhook

### Option A: Use Simulator (Recommended)

```powershell
node .\scripts\simulate-paystack-webhook.js `
  --url https://kindly-elk-471.convex.cloud/api/webhooks/paystack `
  --event charge.success `
  --transactionId wh7XXXXXXXXXXXXXXXXXXXXXXXXXXXXX `
  --amount 300000 `
  --email you@example.com `
  --name "Your Name"
```

**Replace `wh7XXX...` with a real transaction ID from:**
- Convex Dashboard → Data → marketplaceTransactions → Copy `_id`

### Option B: Make Real Payment

1. Go to marketplace settings
2. Select monthly plan (₦3,000)
3. Pay with test card:
   - Card: `4084 0840 8408 4081`
   - CVV: `408`
   - PIN: `0000`
   - OTP: `123456`
4. Wait 5 seconds
5. Badge should appear ✅

---

## 📊 Check Logs

**Convex Dashboard** → **Logs**

Look for:
```
🔥 CONVEX WEBHOOK VERSION: 1.0
✅ Signature verified
🏆 VERIFICATION BADGE PAYMENT DETECTED
✅ Badge activated on profile
🎉 VERIFICATION BADGE ACTIVATION COMPLETE
```

**Paystack Dashboard** → **Settings** → **Webhooks** → **Recent Deliveries**

Should show:
```
✅ 200 OK
```

---

## ✅ Success Checklist

After payment:
- [ ] Webhook shows 200 OK in Paystack
- [ ] Convex logs show badge activation
- [ ] Badge appears in marketplace settings
- [ ] Dashboard shows verified status
- [ ] Email received (if configured)
- [ ] Profile ranks first in search

---

## 🎉 That's It!

The webhook is now:
- ✅ Running on Convex (no Next.js issues)
- ✅ Properly configured with secret key
- ✅ Ready to receive payments
- ✅ Will activate badges automatically

**Just update the Paystack webhook URL and test!** 🚀
