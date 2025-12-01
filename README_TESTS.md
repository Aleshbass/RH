# 🧪 Quick Test Commands

## Automated Tests (Playwright)
```bash
# Run all tests
npm run test:onboarding

# Run with UI (watch tests)
npm run test:onboarding:ui

# Debug mode
npm run test:onboarding:debug

# Specific tests
npm run test:email           # Email notifications only
npm run test:meeting         # Meeting link only
npm run test:redirect        # Auto-redirect only
npm run test:integration     # Full workflow
```

## Manual Interactive Tests
```bash
# Guided manual testing
npm run test:manual
```

## Full Test Suite
```bash
# Run complete test suite with report
npm run test:suite

# View last test report
npm run test:report
```

## First Time Setup
```bash
# Install test dependencies
npm install -D @playwright/test tsx

# Install browsers
npx playwright install
```

## Environment Setup
Create `.env.test`:
```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
TEST_ADMIN_EMAIL=admin@test.com
TEST_ADMIN_PASSWORD=Test123!@#
TEST_PHYSIO_EMAIL=physio@test.com
TEST_PHYSIO_PASSWORD=Test123!@#
RESEND_API_KEY=re_xxxxx
```

---

📚 **Full Documentation:** `TEST_AUTOMATION_GUIDE.md`
