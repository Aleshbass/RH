#!/bin/bash

# Automated Test Suite Runner for Onboarding Fixes
# This script runs all automated tests and generates a report

echo "=========================================="
echo "  ONBOARDING FIXES - TEST SUITE RUNNER  "
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if required tools are installed
echo -e "${BLUE}Checking prerequisites...${NC}"

if ! command -v npx &> /dev/null; then
    echo -e "${RED}❌ npx not found. Please install Node.js${NC}"
    exit 1
fi

if ! command -v playwright &> /dev/null; then
    echo -e "${YELLOW}⚠️  Playwright not installed. Installing...${NC}"
    npm install -D @playwright/test
fi

echo -e "${GREEN}✅ Prerequisites OK${NC}"
echo ""

# Check environment variables
echo -e "${BLUE}Checking environment variables...${NC}"

if [ -z "$RESEND_API_KEY" ]; then
    echo -e "${YELLOW}⚠️  RESEND_API_KEY not set (email tests may fail)${NC}"
else
    echo -e "${GREEN}✅ RESEND_API_KEY configured${NC}"
fi

if [ -z "$NEXT_PUBLIC_APP_URL" ]; then
    echo -e "${YELLOW}⚠️  Using default URL: http://localhost:3000${NC}"
    export NEXT_PUBLIC_APP_URL="http://localhost:3000"
else
    echo -e "${GREEN}✅ NEXT_PUBLIC_APP_URL: $NEXT_PUBLIC_APP_URL${NC}"
fi

echo ""

# Create test results directory
mkdir -p test-results
echo -e "${BLUE}Test results will be saved to: test-results/${NC}"
echo ""

# Run tests
echo "=========================================="
echo "  RUNNING AUTOMATED TESTS  "
echo "=========================================="
echo ""

# Option to run specific test or all tests
if [ "$1" == "email" ]; then
    echo -e "${BLUE}Running Email Notification Tests...${NC}"
    npx playwright test tests/onboarding-fixes.spec.ts -g "Admin Email Notifications"
elif [ "$1" == "meeting" ]; then
    echo -e "${BLUE}Running Meeting Link Tests...${NC}"
    npx playwright test tests/onboarding-fixes.spec.ts -g "Manual Video Meeting Link"
elif [ "$1" == "redirect" ]; then
    echo -e "${BLUE}Running Auto-Redirect Tests...${NC}"
    npx playwright test tests/onboarding-fixes.spec.ts -g "Real-time Dashboard Redirect"
elif [ "$1" == "integration" ]; then
    echo -e "${BLUE}Running Integration Tests...${NC}"
    npx playwright test tests/onboarding-fixes.spec.ts -g "Integration Test"
else
    echo -e "${BLUE}Running All Tests...${NC}"
    npx playwright test tests/onboarding-fixes.spec.ts
fi

TEST_EXIT_CODE=$?

echo ""
echo "=========================================="
echo "  TEST RESULTS  "
echo "=========================================="
echo ""

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed!${NC}"
    echo ""
    echo -e "${GREEN}✅ Admin email notifications working${NC}"
    echo -e "${GREEN}✅ Manual video meeting links working${NC}"
    echo -e "${GREEN}✅ Auto-redirect after approval working${NC}"
    echo ""
else
    echo -e "${RED}❌ Some tests failed${NC}"
    echo ""
    echo -e "${YELLOW}Check test-results/ for screenshots and detailed logs${NC}"
    echo ""
fi

# Generate test report
echo "Generating test report..."
npx playwright show-report &> /dev/null &

echo ""
echo "=========================================="
echo "  NEXT STEPS  "
echo "=========================================="
echo ""

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✅ Ready for deployment!${NC}"
    echo ""
    echo "1. Review test screenshots in test-results/"
    echo "2. Deploy to staging environment"
    echo "3. Run tests on staging"
    echo "4. Deploy to production"
else
    echo -e "${YELLOW}⚠️  Fix failing tests before deployment${NC}"
    echo ""
    echo "1. Check test-results/ for error screenshots"
    echo "2. Review browser console logs"
    echo "3. Check Convex function logs"
    echo "4. Fix issues and re-run tests"
fi

echo ""
echo "📚 Documentation:"
echo "  - ONBOARDING_AND_VIDEO_FIXES.md"
echo "  - IMPLEMENTATION_SUMMARY.md"
echo "  - QUICK_START_GUIDE.md"
echo ""

exit $TEST_EXIT_CODE
