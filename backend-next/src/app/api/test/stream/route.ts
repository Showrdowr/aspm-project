import { NextRequest } from 'next/server';
import { runK6Test } from '@/lib/k6';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  const targetUrl = searchParams.get('target_url') || 'http://localhost:3000';
  const virtualUsers = parseInt(searchParams.get('virtual_users') || '10');
  const duration = parseInt(searchParams.get('duration') || '30');
  const testType = (searchParams.get('test_type') || 'load') as 'load' | 'stress' | 'spike' | 'scalability';
  
  // Stress test params
  const maxUsers = parseInt(searchParams.get('max_users') || String(virtualUsers));
  const rampUpDuration = parseInt(searchParams.get('ramp_up_duration') || '30');
  const holdDuration = parseInt(searchParams.get('hold_duration') || '60');
  
  // Scalability test params
  const startUsers = parseInt(searchParams.get('start_users') || '10');
  const endUsers = parseInt(searchParams.get('end_users') || '100');
  const stepSize = parseInt(searchParams.get('step_size') || '10');
  const stepDuration = parseInt(searchParams.get('step_duration') || '30');
  
  const encoder = new TextEncoder();
  
  // Track ว่า client ยกเลิกหรือยัง + k6 process reference (ต้องอยู่นอก start)
  let cancelled = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let k6ProcessRef: any = null;

  const stream = new ReadableStream({
    start(controller) {
      let output = '';
      let startTime: number | null = null;
      
      // คำนวณ totalDuration ตาม test type
      let totalDuration = duration;
      if (testType === 'stress') {
        // 5 stages + k6 overhead ~5s per stage transition
        totalDuration = (rampUpDuration * 4) + holdDuration + 15;
      } else if (testType === 'scalability') {
        const steps = Math.ceil((endUsers - startUsers) / stepSize) + 1;
        // steps * duration + cool down + k6 overhead ~3s per step transition
        totalDuration = (steps * stepDuration) + 10 + (steps * 2);
      }
      
      // ตัวแปรสำหรับเก็บ metrics แบบ real-time
      let totalResponseTime = 0;
      let minResponseTime = Infinity;
      let maxResponseTime = 0;
      const responseTimes: number[] = []; // เก็บทุกค่าสำหรับ percentile (sorted)
      let totalRequests = 0;
      let failedRequests = 0;
      let currentVuActive = testType === 'load' ? virtualUsers : 0;
      // ตัวแปรสำหรับ per-second tracking
      let lastSecondRequests = 0;
      let currentRps = 0;
      
      // ฟังก์ชันคำนวณ percentile จาก sorted array
      function getPercentile(sortedArr: number[], p: number): number {
        if (sortedArr.length === 0) return 0;
        const index = Math.ceil((p / 100) * sortedArr.length) - 1;
        return parseFloat(sortedArr[Math.max(0, index)].toFixed(2));
      }
      
      // ส่ง event เริ่มต้น
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: 'started',
        target_url: targetUrl,
        virtual_users: virtualUsers,
        duration: totalDuration,
        test_type: testType,
      })}\n\n`));
      
      const k6Process = runK6Test({
        targetUrl,
        virtualUsers,
        duration,
        testType,
        maxUsers,
        rampUpDuration,
        holdDuration,
        startUsers,
        endUsers,
        stepSize,
        stepDuration,
      });
      k6ProcessRef = k6Process;
      
      // Parse k6 stderr — k6 sends console.log output to stderr
      let stderrBuffer = '';
      k6Process.stderr?.on('data', (data) => {
        const text = data.toString();
        output += text;
        stderrBuffer += text;
        
        // Process complete JSON lines from console.log
        const lines = stderrBuffer.split('\n');
        stderrBuffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          
          // k6 console.log output format: time="..." level=info msg="JSON_STRING" source=console
          // The JSON inside msg="..." may have escaped quotes
          const msgMatch = trimmed.match(/msg="(\{.*\})"\s*source=console/);
          let jsonStr = '';
          
          if (msgMatch) {
            // Unescape the JSON string from k6 format
            jsonStr = msgMatch[1].replace(/\\"/g, '"');
          } else if (trimmed.startsWith('{')) {
            // Fallback: raw JSON line
            jsonStr = trimmed;
          }
          
          if (jsonStr) {
            try {
              const metric = JSON.parse(jsonStr);
              if (metric.type === 'metric') {
                if (!startTime) startTime = Date.now();
                totalRequests++;
                totalResponseTime += metric.response_time;
                
                // Insert sorted สำหรับ percentile calculation
                const rt = metric.response_time;
                const insertIdx = responseTimes.findIndex(v => v >= rt);
                if (insertIdx === -1) responseTimes.push(rt);
                else responseTimes.splice(insertIdx, 0, rt);
                
                if (metric.response_time < minResponseTime) {
                  minResponseTime = metric.response_time;
                }
                if (metric.response_time > maxResponseTime) {
                  maxResponseTime = metric.response_time;
                }
                if (metric.error) {
                  failedRequests++;
                }
                if (metric.vu_active !== undefined) {
                  currentVuActive = metric.vu_active;
                }
              }
            } catch {
              // Not valid JSON, skip
            }
          }
        }
      });
      
      // Also capture stdout
      k6Process.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      // Progress updates ทุกวินาที — ส่ง real-time metrics
      const progressInterval = setInterval(() => {
        const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
        const percent = startTime ? Math.min(Math.floor((elapsed / totalDuration) * 100), 99) : 0;
        
        console.log(`[Stream] Progress: elapsed=${elapsed}s, totalRequests=${totalRequests}, rps=${totalRequests - lastSecondRequests}, vus=${currentVuActive}`);
        
        // คำนวณ RPS จากจำนวน requests ใหม่ในวินาทีนี้
        currentRps = totalRequests - lastSecondRequests;
        lastSecondRequests = totalRequests;
        
        const avgResponseTime = totalRequests > 0 
          ? parseFloat((totalResponseTime / totalRequests).toFixed(2)) 
          : 0;
        const errorRate = totalRequests > 0 
          ? parseFloat(((failedRequests / totalRequests) * 100).toFixed(2)) 
          : 0;
        
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'progress',
          percent,
          elapsed,
          total: totalDuration,
          current_users: currentVuActive,
          requests_per_sec: currentRps,
          current_response_time: avgResponseTime,
          current_min_response_time: minResponseTime === Infinity ? 0 : parseFloat(minResponseTime.toFixed(2)),
          current_max_response_time: parseFloat(maxResponseTime.toFixed(2)),
          current_error_rate: errorRate,
          median_response_time: getPercentile(responseTimes, 50),
          p95_response_time: getPercentile(responseTimes, 95),
          p99_response_time: getPercentile(responseTimes, 99),
          throughput: elapsed > 0 ? parseFloat((totalRequests / elapsed).toFixed(2)) : 0,
          total_requests: totalRequests,
        })}\n\n`));
      }, 1000);
      
      k6Process.on('close', async (code) => {
        clearInterval(progressInterval);

        // If client disconnected, don't save results
        if (cancelled) {
          console.log('[Stream] Test cancelled by client disconnect, not saving results.');
          controller.close();
          return;
        }
        
        // Use real-time tracked metrics (primary) with k6 summary regex as fallback
        const finalAvgResponseTime = totalRequests > 0 
          ? parseFloat((totalResponseTime / totalRequests).toFixed(2))
          : parseFloat(output.match(/http_req_duration.*avg=([\d.]+)/)?.[1] || '0');
        const finalErrorRate = totalRequests > 0
          ? parseFloat(((failedRequests / totalRequests) * 100).toFixed(2))
          : parseFloat(output.match(/http_req_failed.*:\s*([\d.]+)%/)?.[1] || '0');
        
        // Parse extended metrics - prefer real-time tracked data, fallback to k6 summary regex
        const finalMinResponseTime = minResponseTime !== Infinity ? parseFloat(minResponseTime.toFixed(2)) : parseFloat(output.match(/http_req_duration.*min=([\d.]+)/)?.[1] || '0');
        const finalMedianResponseTime = responseTimes.length > 0 ? getPercentile(responseTimes, 50) : parseFloat(output.match(/http_req_duration.*med=([\d.]+)/)?.[1] || '0');
        const p95ResponseTime = responseTimes.length > 0 ? getPercentile(responseTimes, 95) : parseFloat(output.match(/http_req_duration.*p\(95\)=([\d.]+)/)?.[1] || '0');
        const p99ResponseTime = responseTimes.length > 0 ? getPercentile(responseTimes, 99) : parseFloat(output.match(/http_req_duration.*p\(99\)=([\d.]+)/)?.[1] || '0');
        const finalMaxResponseTime = maxResponseTime > 0 ? parseFloat(maxResponseTime.toFixed(2)) : parseFloat(output.match(/http_req_duration.*max=([\d.]+)/)?.[1] || '0');
        const totalReqs = totalRequests > 0 ? totalRequests : parseInt(output.match(/http_reqs[.\s]*:\s*(\d+)/)?.[1] || '0');
        const failedReqs = failedRequests;
        const elapsed = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;
        const throughput = elapsed > 0 ? parseFloat((totalReqs / elapsed).toFixed(2)) : 0;
        
        // กำหนด status — ใช้ error rate จริงแทน exit code
        // (k6 exit code ≠ 0 เมื่อ threshold ไม่ผ่าน ซึ่งไม่ใช่ test failure จริงๆ)
        let status = 'Completed';
        if (totalReqs === 0 && code !== 0) status = 'Failed';
        else if (finalErrorRate >= 100) status = 'Failed: Connection Error';
        else if (finalErrorRate >= 50) status = 'Failed';
        else if (finalErrorRate > 0) status = 'Completed with Errors';
        
        // บันทึกผลลัพธ์
        let insertedId = 0;
        try {
          console.log('[DB] Saving test result:', { testType, targetUrl, virtualUsers, duration, finalAvgResponseTime, finalErrorRate, status });
          const [result] = await db.execute(
            `INSERT INTO test_histories 
              (test_type, target_url, virtual_users, duration, avg_response_time, error_rate, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [testType, targetUrl, virtualUsers, duration, Math.round(finalAvgResponseTime), Math.round(finalErrorRate), status]
          );
          insertedId = (result as { insertId: number }).insertId;
          console.log('[DB] Saved successfully, id:', insertedId);
        } catch (e) {
          console.error('[DB] Failed to save history:', e);
          // Optionally, update status to reflect DB save failure
          status = 'Completed (DB Save Failed)';
        }
        
        // ส่ง complete event (รวม extended metrics)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'complete',
          test_type: testType,
          status,
          avg_response_time: finalAvgResponseTime,
          min_response_time: finalMinResponseTime,
          median_response_time: finalMedianResponseTime,
          p95_response_time: p95ResponseTime,
          p99_response_time: p99ResponseTime,
          max_response_time: finalMaxResponseTime,
          throughput,
          total_requests: totalReqs,
          failed_requests: failedReqs,
          error_rate: finalErrorRate,
          target_url: targetUrl,
          virtual_users: virtualUsers,
          duration: totalDuration,
          test_history_id: insertedId,
        })}\n\n`));
        
        controller.close();
      });
      
      k6Process.on('error', (error) => {
        clearInterval(progressInterval);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'error',
          message: error.message,
        })}\n\n`));
        controller.close();
      });
    },
    cancel() {
      // Client disconnect — kill k6 process เพื่อไม่ให้ค้าง
      cancelled = true;
      try {
        if (k6ProcessRef) {
          k6ProcessRef.kill('SIGTERM');
          console.log('[Stream] Client disconnected, k6 process killed');
        }
      } catch (e) {
        console.error('[Stream] Error killing k6 process on disconnect:', e);
      }
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
