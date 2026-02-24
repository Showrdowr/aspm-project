import { NextRequest, NextResponse } from 'next/server';
import { runK6Test } from '@/lib/k6';
import { verifyToken, extractToken } from '@/lib/auth';
import { query } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    // ตรวจสอบ authentication
    const token = extractToken(request.headers.get('authorization'));
    if (!token || !verifyToken(token)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const { target_url, virtual_users, duration, test_type } = await request.json();
    
    // Validate input
    if (!target_url) {
      return NextResponse.json(
        { error: 'target_url is required' },
        { status: 400 }
      );
    }
    
    // รัน k6 test
    const k6Process = runK6Test({
      targetUrl: target_url,
      virtualUsers: virtual_users || 10,
      duration: duration || 30,
      testType: test_type || 'load',
    });
    
    // รอให้ k6 ทำงานเสร็จ
    let output = '';
    
    await new Promise<void>((resolve, reject) => {
      k6Process.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      k6Process.stderr?.on('data', (data) => {
        output += data.toString();
      });
      
      k6Process.on('close', (code) => {
        if (code === 0 || code === 1) {
          resolve();
        } else {
          reject(new Error(`k6 exited with code ${code}`));
        }
      });
      
      k6Process.on('error', reject);
    });
    
    // Parse results และบันทึกลง database
    const avgResponseTime = parseFloat(output.match(/http_req_duration.*avg=([\d.]+)/)?.[1] || '0');
    const errorRate = parseFloat(output.match(/http_req_failed.*:\s*([\d.]+)%/)?.[1] || '0');
    
    // บันทึกผลลัพธ์
    await query(
      `INSERT INTO test_histories 
        (test_type, target_url, virtual_users, duration, avg_response_time, error_rate) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [test_type || 'load', target_url, virtual_users || 10, duration || 30, avgResponseTime, errorRate]
    );
    
    return NextResponse.json({
      status: 'completed',
      target_url,
      virtual_users: virtual_users || 10,
      duration: duration || 30,
      avg_response_time: avgResponseTime,
      error_rate: errorRate,
    });
    
  } catch (error) {
    console.error('Test start error:', error);
    return NextResponse.json(
      { error: 'Test failed to start' },
      { status: 500 }
    );
  }
}
