export interface TestResult {
  id: number;
  test_type: string;
  target_url: string;
  status: string;
  avg_response_time: number;
  error_rate: number;
  p95_response_time?: number;
  p99_response_time?: number;
  min_response_time?: number;
  max_response_time?: number;
  throughput?: number;
  total_requests?: number;
  failed_requests?: number;
  virtual_users?: number;
  duration?: number;
  test_history_id?: number;
  median_response_time?: number;
}
