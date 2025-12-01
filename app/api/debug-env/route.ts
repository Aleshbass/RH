import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        hasPublicKey: !!process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY,
        publicKeyLength: process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY?.length || 0,
        publicKeyPreview: process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY?.substring(0, 10) + '...',
        allNextPublicKeys: Object.keys(process.env).filter(k => k.startsWith('NEXT_PUBLIC_'))
    });
}
