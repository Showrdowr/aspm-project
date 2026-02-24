import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractToken } from '@/lib/auth';
import { query } from '@/lib/db';

interface TestReport {
  id: number;
  test_history_id: number;
  tester_name: string;
  test_objective: string;
  environment: string;
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
      tester_name,
      test_objective,
      environment,
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
        (test_history_id, tester_name, test_objective, environment,
         p95_response_time, p99_response_time, max_response_time, throughput,
         total_requests, failed_requests,
         sla_response_time, sla_error_rate, sla_pass,
         conclusion, recommendations)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        test_history_id, tester_name, test_objective, environment,
        p95_response_time, p99_response_time, max_response_time, throughput,
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
      SELECT r.*, h.test_type, h.target_url, h.virtual_users, h.duration, 
             h.avg_response_time, h.error_rate, h.status as test_status
      FROM test_reports r
      JOIN test_histories h ON r.test_history_id = h.id
      ORDER BY r.created_at DESC
    `;
    const params: string[] = [];

    if (historyId) {
      sql = `
        SELECT r.*, h.test_type, h.target_url, h.virtual_users, h.duration,
               h.avg_response_time, h.error_rate, h.status as test_status
        FROM test_reports r
        JOIN test_histories h ON r.test_history_id = h.id
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
