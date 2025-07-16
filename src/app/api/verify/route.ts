import { NextResponse } from 'next/server';
import { verifyKey } from '@/app/actions';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { key } = body;

    if (!key) {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 });
    }

    const result = await verifyKey(key);

    if (!result.valid) {
        return NextResponse.json({ valid: false, message: result.message }, { status: 200 });
    }

    return NextResponse.json({
      valid: true,
      message: result.message,
      expires: result.expires,
    });
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
