import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    await db.execute('SELECT 1');
    return NextResponse.json({ database: 'Connected' });
  } catch (error) {
    console.error('DB health check failed:', error);
    return NextResponse.json({ database: 'Disconnected' }, { status: 500 });
  }
}
