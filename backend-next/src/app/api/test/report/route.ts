import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractToken } from '@/lib/auth';
import { query } from '@/lib/db';

interface TestReport {
  id: number;
  test_history_id: number;
  report_name: string;
  tester_name: string;
  test_objective: string;
  environment: string;
  median_response_time: number;
  p95_response_time: number;
  p99_response_time: number;
  max_response_time: number;
  throughput: number;
  total_requests: number;
  failed_requests: number;
  sla_response_time: number;
  sla_error_rate: number;
  sla_pass: boolean;
  conclusion: string;
  recommendations: string;
  created_at: string;
}

// POST — สร้าง report ใหม่
export async function POST(request: NextRequest) {
  try {
    const token = extractToken(request.headers.get('authorization'));
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      test_history_id,
      report_name,
      test_type,
      tester_name,
      target_url,
      virtual_users,
      duration,
      avg_response_time,
      error_rate,
      test_objective,
      environment,
      median_response_time,
      p95_response_time,
      p99_response_time,
      max_response_time,
      throughput,
      total_requests,
      failed_requests,
      sla_response_time,
      sla_error_rate,
      sla_pass,
      conclusion,
      recommendations,
    } = body;

    const result = await query(
      `INSERT INTO test_reports 
        (test_history_id, report_name, test_type, tester_name, target_url, virtual_users, duration, avg_response_time, error_rate,
         test_objective, environment,
         median_response_time, p95_response_time, p99_response_time, max_response_time, throughput,
         total_requests, failed_requests,
         sla_response_time, sla_error_rate, sla_pass,
         conclusion, recommendations)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        test_history_id, report_name || '', test_type || '', tester_name,
        target_url || '', virtual_users || 0, duration || 0, avg_response_time || 0, error_rate || 0,
        test_objective, environment,
        median_response_time || 0, p95_response_time, p99_response_time, max_response_time, throughput,
        total_requests, failed_requests,
        sla_response_time, sla_error_rate, sla_pass ? 1 : 0,
        conclusion, recommendations
      ]
    );

    return NextResponse.json({ 
      success: true, 
      id: (result as { insertId: number }).insertId,
      message: 'Report saved successfully' 
    });

  } catch (error) {
    console.error('Report save error:', error);
    return NextResponse.json({ error: 'Failed to save report' }, { status: 500 });
  }
}

// GET — ดึง reports ทั้งหมด หรือตาม test_history_id
export async function GET(request: NextRequest) {
  try {
    const token = extractToken(request.headers.get('authorization'));
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const historyId = searchParams.get('test_history_id');

    let sql = `
      SELECT r.*, 
             COALESCE(NULLIF(r.test_type,''), h.test_type) as test_type,
             COALESCE(NULLIF(r.target_url,''), h.target_url) as target_url,
             COALESCE(NULLIF(r.virtual_users,0), h.virtual_users) as virtual_users,
             COALESCE(NULLIF(r.duration,0), h.duration) as duration,
             COALESCE(NULLIF(r.avg_response_time,0), h.avg_response_time) as avg_response_time,
             COALESCE(NULLIF(r.error_rate,0), h.error_rate) as error_rate,
             h.status as test_status
      FROM test_reports r
      LEFT JOIN test_histories h ON r.test_history_id = h.id
      ORDER BY r.created_at DESC
    `;
    const params: string[] = [];

    if (historyId) {
      sql = `
        SELECT r.*, 
               COALESCE(NULLIF(r.test_type,''), h.test_type) as test_type,
               COALESCE(NULLIF(r.target_url,''), h.target_url) as target_url,
               COALESCE(NULLIF(r.virtual_users,0), h.virtual_users) as virtual_users,
               COALESCE(NULLIF(r.duration,0), h.duration) as duration,
               COALESCE(NULLIF(r.avg_response_time,0), h.avg_response_time) as avg_response_time,
               COALESCE(NULLIF(r.error_rate,0), h.error_rate) as error_rate,
               h.status as test_status
        FROM test_reports r
        LEFT JOIN test_histories h ON r.test_history_id = h.id
        WHERE r.test_history_id = ?
        ORDER BY r.created_at DESC
      `;
      params.push(historyId);
    }

    const reports = await query<TestReport[]>(sql, params);
    return NextResponse.json(reports);

  } catch (error) {
    console.error('Report fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }
}

// DELETE — ลบ report ตาม id
export async function DELETE(request: NextRequest) {
  try {
    const token = extractToken(request.headers.get('authorization'));
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing report id' }, { status: 400 });
    }

    await query('DELETE FROM test_reports WHERE id = ?', [id]);
    return NextResponse.json({ success: true, message: 'Report deleted successfully' });

  } catch (error) {
    console.error('Report delete error:', error);
    return NextResponse.json({ error: 'Failed to delete report' }, { status: 500 });
  }
}
