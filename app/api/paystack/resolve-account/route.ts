import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

/**
 * Resolves a Nigerian bank account name with Paystack, for payout-account forms.
 * Signed-in users only: it spends the platform's Paystack key and reveals account holder
 * names, so it must not be an open lookup service.
 */
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ status: false, message: 'Please sign in to verify an account' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const accountNumber = searchParams.get('account_number')?.trim() ?? '';
  const bankCode = searchParams.get('bank_code')?.trim() ?? '';

  if (!/^\d{10}$/.test(accountNumber) || !/^[A-Za-z0-9]{2,10}$/.test(bankCode)) {
    return NextResponse.json({ status: false, message: 'Enter a 10-digit account number and choose a bank' }, { status: 400 });
  }

  try {
    const query = new URLSearchParams({ account_number: accountNumber, bank_code: bankCode });
    const response = await fetch(`https://api.paystack.co/bank/resolve?${query}`, {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
      signal: AbortSignal.timeout(15_000),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to resolve account');
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Error resolving account:', error);
    const message = error instanceof Error ? error.message : 'Failed to resolve account';
    return NextResponse.json({ status: false, message }, { status: 500 });
  }
}
