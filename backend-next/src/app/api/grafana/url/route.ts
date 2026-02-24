import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    dashboard_url: 'http://localhost:3001/d/k6-dashboard',
    iframe_url: 'http://localhost:3001/d/k6-dashboard?kiosk&theme=dark',
  });
}
