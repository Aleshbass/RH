import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountNumber = searchParams.get('account_number');
  const bankCode = searchParams.get('bank_code');

  if (!accountNumber || !bankCode) {
    return NextResponse.json({ status: false, message: 'Account number and bank code are required' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`, {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to resolve account');
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error resolving account:', error);
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}
