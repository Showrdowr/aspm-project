import http from 'k6/http';
import { check, sleep } from 'k6';

const TARGET_URL = __ENV.TARGET_URL || 'http://localhost:5173';

// Spike test - ทดสอบ traffic spike
export const options = {
  stages: [
    { duration: '10s', target: 5 },    // Warm up
    { duration: '5s', target: 100 },   // SPIKE! เพิ่มทันที
    { duration: '30s', target: 100 },  // Stay at peak
    { duration: '5s', target: 5 },     // ลดลงทันที
    { duration: '10s', target: 0 },    // Cool down
  ],
  
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.3'],
  },
  
  tags: {
    testType: 'spike',
  },
};

export default function () {
  const res = http.get(TARGET_URL);
  
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
  
  sleep(0.05);
}

export function setup() {
  console.log(`⚡ Starting SPIKE test on ${TARGET_URL}`);
}
