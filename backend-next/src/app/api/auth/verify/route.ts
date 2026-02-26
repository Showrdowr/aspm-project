import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractToken } from '@/lib/auth';

// GET /api/auth/verify — ตรวจสอบ token ว่ายัง valid อยู่หรือไม่
export async function GET(request: NextRequest) {
  try {
    const token = extractToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ valid: false, error: 'No token provided' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ valid: false, error: 'Invalid or expired token' }, { status: 401 });
    }

    return NextResponse.json({ valid: true, username: decoded.username });

  } catch (error) {
    console.error('Token verify error:', error);
    return NextResponse.json({ valid: false, error: 'Verification failed' }, { status: 500 });
  }
}
