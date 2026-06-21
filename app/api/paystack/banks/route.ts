import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch('https://api.paystack.co/bank?country=nigeria', {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch banks');
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error fetching banks:', error);
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}
