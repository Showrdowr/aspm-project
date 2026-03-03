import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

export interface K6Options {
  targetUrl: string;
  virtualUsers: number;
  duration: number;
  testType: 'load' | 'stress' | 'spike' | 'scalability';
  // Stress test options
  maxUsers?: number;
  rampUpDuration?: number;
  holdDuration?: number;
  // Scalability test options
  startUsers?: number;
  endUsers?: number;
  stepSize?: number;
  stepDuration?: number;
}

export interface K6Result {
  success: boolean;
  output: string;
  metrics?: {
    requests: number;
    failed: number;
    avgDuration: number;
  };
}

// สร้าง k6 script แบบ dynamic สำหรับทุก test type
function createDynamicScript(options: K6Options): string {
  let config = '';

  if (options.testType === 'stress') {
    const maxUsers = options.maxUsers || options.virtualUsers;
    const rampUp = options.rampUpDuration || 30;
    const hold = options.holdDuration || 60;
    
    const step1 = Math.round(maxUsers * 0.2);
    const step2 = Math.round(maxUsers * 0.5);
    const step3 = maxUsers;
    
    config = `
    stages: [
      { duration: '${rampUp}s', target: ${step1} },
      { duration: '${rampUp}s', target: ${step2} },
      { duration: '${rampUp}s', target: ${step3} },
      { duration: '${hold}s', target: ${step3} },
      { duration: '${rampUp}s', target: 0 },
    ],
    gracefulRampDown: '0s',`;
    
  } else if (options.testType === 'scalability') {
    const start = options.startUsers || 10;
    const end = options.endUsers || 100;
    const step = options.stepSize || 10;
    const stepDur = options.stepDuration || 30;
    
    const stagesList = [];
    for (let users = start; users <= end; users += step) {
      stagesList.push(`      { duration: '${stepDur}s', target: ${users} }`);
    }
    stagesList.push(`      { duration: '10s', target: 0 }`);
    
    config = `
    stages: [
${stagesList.join(',\n')}
    ],
    gracefulRampDown: '0s',`;
  } else {
    // Load test — ใช้ vus + duration ตรงๆ
    config = `
    vus: ${options.virtualUsers},
    duration: '${options.duration}s',`;
  }

  return `
import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';

export const options = {${config}
  thresholds: {
    http_req_duration: ['p(95)<5000'],
    http_req_failed: ['rate<0.5'],
  },
  gracefulStop: '0s',
};

export default function () {
  const res = http.get('${options.targetUrl}');
  const passed = check(res, {
    'status is 200': (r) => r.status === 200,
  });
  
  // Output per-request metrics as JSON for real-time parsing
  console.log(JSON.stringify({
    type: 'metric',
    response_time: res.timings.duration,
    status: res.status,
    error: !passed,
    vu_active: exec.instance.vusActive,
    timestamp: Date.now(),
  }));
  
  sleep(0.1);
}
`;
}

// รัน k6 test — ใช้ dynamic script สำหรับทุก test type
export function runK6Test(options: K6Options): ChildProcess {
  const scriptContent = createDynamicScript(options);
  const tmpFile = path.join(os.tmpdir(), `k6-${options.testType}-${Date.now()}.js`);
  fs.writeFileSync(tmpFile, scriptContent);
  
  console.log('[k6] Script created:', tmpFile);
  console.log('[k6] Config:', { 
    testType: options.testType, 
    targetUrl: options.targetUrl,
    virtualUsers: options.virtualUsers,
    duration: options.duration 
  });
  
  // ใช้ shell: false + ระบุ full command เพื่อหลีกเลี่ยงปัญหา argument escaping
  const k6Path = 'k6';
  const args = ['run', '--no-summary', tmpFile];
  
  const k6Process = spawn(k6Path, args, { 
    shell: false,
    env: { ...process.env },
  });
  
  // ลบ temp file หลังเสร็จ
  k6Process.on('close', () => {
    try { fs.unlinkSync(tmpFile); } catch {}
  });
  
  return k6Process;
}

// Parse k6 output สำหรับดึง metrics
export function parseK6Output(output: string): K6Result['metrics'] | undefined {
  try {
    const requestsMatch = output.match(/http_reqs[.\s]*:\s*(\d+)/);
    const failedMatch = output.match(/http_req_failed[.\s]*:\s*([\d.]+)%/);
    const durationMatch = output.match(/http_req_duration[.\s]*avg=([\d.]+)(\w+)/);
    
    return {
      requests: requestsMatch ? parseInt(requestsMatch[1]) : 0,
      failed: failedMatch ? parseFloat(failedMatch[1]) : 0,
      avgDuration: durationMatch ? parseFloat(durationMatch[1]) : 0,
    };
  } catch {
    return undefined;
  }
}
