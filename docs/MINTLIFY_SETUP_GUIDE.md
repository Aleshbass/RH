# Mintlify Free Plan Setup Guide for Rehabify Health

Rehabify's documentation is 100% compatible with [Mintlify](https://mintlify.com). We have already generated the complete `mint.json` configuration for all endpoints, webhooks, guides, and SDKs.

---

## 3-Step Setup (Free Tier)

### Step 1: Sign In to Mintlify
1. Visit **[mintlify.com/start](https://mintlify.com/start)**.
2. Sign in with your GitHub account.

### Step 2: Connect the Repository
1. Click **New Project** &rarr; select **GitHub**.
2. Select repository: `Aleshbass/RH`.
3. Choose the branch: `main`.
4. **Docs Directory**:
   - Leave as `/` (default, since `mint.json` is at repository root).
   - Alternatively, you can specify `content/docs` (we also provided `content/docs/mint.json`).

### Step 3: Deploy & Launch
1. Click **Deploy Documentation**.
2. Mintlify will build your docs in under 60 seconds with:
   - Full left sidebar navigation
   - API Playground (test requests directly in the browser)
   - Dark/Light mode switcher
   - Responsive mobile navigation
   - Custom subdomain (e.g., `rehabify.mintlify.app`) or custom domain (e.g., `docs.rehabifyhealth.com`) on the Free plan.

---

## What Is Configured

| Section | Content |
| :--- | :--- |
| **Getting Started** | Quickstart, Authentication (`sk_live_...`), Error Reference |
| **API Reference** | Referrals (`POST /v1/partners/referrals`), Eligibility, Providers, Sessions, Reports |
| **Webhooks** | Event Catalog (`session.completed`), HMAC SHA-256 Signature Verification, Retries |
| **SDKs & Widgets** | WhatsApp Deep-Link token builder, Embed Widget, React component |
| **Partner Guides** | HMO Pre-Auth, Clinic Referrals, Corporate Wellness, Gym Recovery |
| **Sandbox** | Mock keys and test mode instructions |
