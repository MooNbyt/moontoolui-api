import { NextResponse } from 'next/server';
import { activateKey } from '@/app/actions';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { key } = body;

    if (!key) {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 });
    }

    const result = await activateKey(key);

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      expires: result.expires,
    });
  } catch (error) {
    console.error('Activation error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
