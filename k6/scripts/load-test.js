import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Custom metrics
const errorCounter = new Counter('errors');
const responseTimeTrend = new Trend('response_time_custom');

// รับค่าจาก environment variables
const TARGET_URL = __ENV.TARGET_URL || 'http://localhost:5173';
const VUS = parseInt(__ENV.VUS) || 10;
const DURATION = __ENV.DURATION || '30s';

export const options = {
  vus: VUS,
  duration: DURATION,
  
  // Thresholds สำหรับตรวจสอบผลลัพธ์
  thresholds: {
    http_req_duration: ['p(95)<5000'],  // 95% ของ requests ต้องต่ำกว่า 5000ms
    http_req_failed: ['rate<0.5'],      // Error rate ต้องต่ำกว่า 50%
  },
  
  // Tags สำหรับ Grafana
  tags: {
    testType: 'load',
    environment: 'development',
  },
};

export default function () {
  const startTime = Date.now();
  
  const res = http.get(TARGET_URL, {
    tags: { name: 'homepage' },
  });
  
  const duration = Date.now() - startTime;
  responseTimeTrend.add(duration);
  
  // ตรวจสอบ response
  const checkResult = check(res, {
    'status is 200': (r) => r.status === 200,
    'status is not 5xx': (r) => r.status < 500,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  if (!checkResult) {
    errorCounter.add(1);
  }
  
  // รอเล็กน้อยระหว่าง requests
  sleep(0.1);
}

// Lifecycle hooks
export function setup() {
  console.log(`🚀 Starting load test on ${TARGET_URL}`);
  console.log(`👥 Virtual Users: ${VUS}`);
  console.log(`⏱️ Duration: ${DURATION}`);
}

export function teardown(data) {
  console.log('✅ Load test completed!');
}
