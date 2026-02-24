import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractToken } from '@/lib/auth';
import { query } from '@/lib/db';

interface TestHistory {
  id: number;
  test_type: string;
  target_url: string;
  virtual_users: number;
  duration: number;
  avg_response_time: number;
  error_rate: number;
  status: string;
  created_at: string;
}

export async function GET(request: NextRequest) {
  try {
    // ตรวจสอบ authentication
    const token = extractToken(request.headers.get('authorization'));
    if (!token || !verifyToken(token)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // ดึง query parameter สำหรับ filter
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('target_url');
    
    let sql = 'SELECT * FROM test_histories ORDER BY id DESC';
    const params: string[] = [];
    
    if (targetUrl) {
      sql = 'SELECT * FROM test_histories WHERE target_url = ? ORDER BY id DESC';
      params.push(targetUrl);
    }
    
    const history = await query<TestHistory[]>(sql, params);
    
    // แปลงข้อมูลให้ตรงกับ format ที่ frontend ต้องการ
    const results = history.map((h) => ({
      id: h.id,
      test_type: h.test_type,
      target_url: h.target_url,
      virtual_users: h.virtual_users,
      duration: h.duration,
      avg_response_time: h.avg_response_time,
      error_rate: h.error_rate,
      status: h.status || 'Completed',
      created_at: h.created_at,
    }));
    
    return NextResponse.json(results);
    
  } catch (error) {
    console.error('History fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}
