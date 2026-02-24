import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  FileText, ClipboardCheck, Target, Server,
  Clock, CheckCircle, XCircle,
  TrendingUp, Zap, Save, ChevronDown, ChevronUp
} from 'lucide-react';

interface ReportData {
  // จาก complete event ของ SSE
  test_type: string;
  target_url: string;
  virtual_users: number;
  duration: number;
  status: string;
  avg_response_time: number;
  p95_response_time: number;
  p99_response_time: number;
  max_response_time: number;
  throughput: number;
  total_requests: number;
  failed_requests: number;
  error_rate: number;
  test_history_id?: number;
}

interface SavedReport {
  id: number;
  test_history_id: number;
  tester_name: string;
  test_objective: string;
  environment: string;
  test_type: string;
  target_url: string;
  virtual_users: number;
  duration: number;
  avg_response_time: number;
  error_rate: number;
  test_status: string;
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

// Generate ข้อสรุปอัตโนมัติ
function generateConclusion(data: ReportData): string {
  const parts = [];
  
  if (data.error_rate === 0) {
    parts.push(`ระบบผ่านการทดสอบ ${data.test_type} โดยไม่มี error`);
  } else if (data.error_rate < 5) {
    parts.push(`ระบบมี error rate ${data.error_rate}% ซึ่งอยู่ในเกณฑ์ที่ยอมรับได้`);
  } else {
    parts.push(`ระบบมี error rate ${data.error_rate}% ซึ่งสูงเกินเกณฑ์`);
  }
  
  parts.push(`Average response time: ${data.avg_response_time}ms, P95: ${data.p95_response_time}ms`);
  
  if (data.avg_response_time < 200) {
    parts.push(`Response time อยู่ในเกณฑ์ดีมาก (< 200ms)`);
  } else if (data.avg_response_time < 500) {
    parts.push(`Response time อยู่ในเกณฑ์ดี (< 500ms)`);
  } else if (data.avg_response_time < 1000) {
    parts.push(`Response time ปานกลาง ควรปรับปรุง`);
  } else {
    parts.push(`Response time ช้า ต้องปรับปรุง`);
  }

  return parts.join('. ') + '.';
}

// Generate คำแนะนำอัตโนมัติ
function generateRecommendations(data: ReportData): string {
  const recs = [];
  
  if (data.avg_response_time > 500) recs.push('- เพิ่ม caching layer (Redis/Memcached) เพื่อลด response time');
  if (data.p99_response_time > 2000) recs.push('- ตรวจสอบ slow queries และ optimize database indexes');
  if (data.error_rate > 1) recs.push('- วิเคราะห์ error logs และแก้ไข root cause ของ errors');
  if (data.throughput < 10) recs.push('- พิจารณา horizontal scaling หรือ load balancer');
  if (data.max_response_time > 5000) recs.push('- ตั้ง timeout limit และ circuit breaker pattern');
  
  if (recs.length === 0) recs.push('- ระบบทำงานได้ดี ไม่มีข้อแนะนำเพิ่มเติม');
  
  return recs.join('\n');
}

export default function TestReport() {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Form fields
  const [testerName, setTesterName] = useState('');
  const [testObjective, setTestObjective] = useState('');
  const [environment, setEnvironment] = useState('Development');
  const [slaResponseTime, setSlaResponseTime] = useState(500);
  const [slaErrorRate, setSlaErrorRate] = useState(1);

  useEffect(() => {
    fetchSavedReports();
  }, []);

  const fetchSavedReports = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('http://localhost:3002/api/test/report', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSavedReports(res.data);
    } catch (err) {
      console.error('Failed to fetch reports', err);
    } finally {
      setLoading(false);
    }
  };

  // เรียกจาก LoadTest/StressTest/ScalabilityTest หลัง test เสร็จ
  const handleGenerateReport = (data: ReportData) => {
    setReportData(data);
    setShowForm(true);
    setSaveSuccess(false);
    setTestObjective(`ทดสอบ ${data.test_type} สำหรับ ${data.target_url}`);
  };

  // Expose function สำหรับ parent component
  (window as unknown as { generateReport: (data: ReportData) => void }).generateReport = handleGenerateReport;

  const slaPass = reportData
    ? reportData.avg_response_time <= slaResponseTime && reportData.error_rate <= slaErrorRate
    : false;

  const handleSave = async () => {
    if (!reportData) return;
    setSaving(true);
    
    try {
      const token = localStorage.getItem('token');
      await axios.post('http://localhost:3002/api/test/report', {
        test_history_id: reportData.test_history_id || 0,
        tester_name: testerName,
        test_objective: testObjective,
        environment,
        p95_response_time: reportData.p95_response_time,
        p99_response_time: reportData.p99_response_time,
        max_response_time: reportData.max_response_time,
        throughput: reportData.throughput,
        total_requests: reportData.total_requests,
        failed_requests: reportData.failed_requests,
        sla_response_time: slaResponseTime,
        sla_error_rate: slaErrorRate,
        sla_pass: slaPass,
        conclusion: generateConclusion(reportData),
        recommendations: generateRecommendations(reportData),
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setSaveSuccess(true);
      fetchSavedReports();
    } catch (err) {
      console.error('Failed to save report', err);
      alert('ไม่สามารถบันทึก report ได้');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-6 pb-20 animate-fade-in-up">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <FileText className="text-emerald-400" /> Test Report Center
        </h1>
        <p className="text-gray-400">สร้าง Report มาตรฐาน สรุปผลการทดสอบพร้อมข้อแนะนำ</p>
      </div>

      {/* Generate Report Form */}
      {showForm && reportData && (
        <div className="bg-gray-800 rounded-2xl shadow-xl border border-gray-700 p-8 mb-8 animate-fade-in-up">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <ClipboardCheck className="text-emerald-400" /> Generate Report
          </h2>

          {/* Test Config Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-900 p-4 rounded-xl border border-gray-700 text-center">
              <Target className="w-5 h-5 text-blue-400 mx-auto mb-1" />
              <p className="text-xs text-gray-400">Test Type</p>
              <p className="text-sm font-bold text-white uppercase">{reportData.test_type}</p>
            </div>
            <div className="bg-gray-900 p-4 rounded-xl border border-gray-700 text-center">
              <Server className="w-5 h-5 text-purple-400 mx-auto mb-1" />
              <p className="text-xs text-gray-400">Target</p>
              <p className="text-sm font-bold text-white truncate" title={reportData.target_url}>{reportData.target_url}</p>
            </div>
            <div className="bg-gray-900 p-4 rounded-xl border border-gray-700 text-center">
              <TrendingUp className="w-5 h-5 text-orange-400 mx-auto mb-1" />
              <p className="text-xs text-gray-400">Users</p>
              <p className="text-sm font-bold text-white">{reportData.virtual_users}</p>
            </div>
            <div className="bg-gray-900 p-4 rounded-xl border border-gray-700 text-center">
              <Clock className="w-5 h-5 text-green-400 mx-auto mb-1" />
              <p className="text-xs text-gray-400">Duration</p>
              <p className="text-sm font-bold text-white">{reportData.duration}s</p>
            </div>
          </div>

          {/* Performance Metrics */}
          <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">Performance Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <MetricCard label="Avg Response" value={`${reportData.avg_response_time}ms`} color="text-blue-400" />
            <MetricCard label="P95 Response" value={`${reportData.p95_response_time}ms`} color="text-cyan-400" />
            <MetricCard label="P99 Response" value={`${reportData.p99_response_time}ms`} color="text-indigo-400" />
            <MetricCard label="Max Response" value={`${reportData.max_response_time}ms`} color="text-purple-400" />
            <MetricCard label="Throughput" value={`${reportData.throughput} req/s`} color="text-green-400" />
            <MetricCard label="Total Requests" value={`${reportData.total_requests}`} color="text-white" />
            <MetricCard label="Failed Requests" value={`${reportData.failed_requests}`} color={reportData.failed_requests > 0 ? 'text-red-400' : 'text-green-400'} />
            <MetricCard label="Error Rate" value={`${reportData.error_rate}%`} color={reportData.error_rate > 0 ? 'text-red-400' : 'text-green-400'} />
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-2">
              <label className="text-sm text-gray-300 font-medium">ชื่อผู้ทดสอบ</label>
              <input
                type="text"
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                value={testerName}
                onChange={e => setTesterName(e.target.value)}
                placeholder="ชื่อ-นามสกุล"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-gray-300 font-medium">Environment</label>
              <select
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                value={environment}
                onChange={e => setEnvironment(e.target.value)}
              >
                <option value="Development">Development</option>
                <option value="Staging">Staging</option>
                <option value="Production">Production</option>
                <option value="Local">Local</option>
              </select>
            </div>
            <div className="col-span-1 md:col-span-2 space-y-2">
              <label className="text-sm text-gray-300 font-medium">วัตถุประสงค์การทดสอบ</label>
              <textarea
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                rows={2}
                value={testObjective}
                onChange={e => setTestObjective(e.target.value)}
              />
            </div>
          </div>

          {/* SLA Criteria */}
          <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">SLA Criteria</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-2">
              <label className="text-sm text-gray-300 font-medium">Max Response Time (ms)</label>
              <input
                type="number"
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                value={slaResponseTime}
                onChange={e => setSlaResponseTime(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-gray-300 font-medium">Max Error Rate (%)</label>
              <input
                type="number"
                step="0.1"
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                value={slaErrorRate}
                onChange={e => setSlaErrorRate(Number(e.target.value))}
              />
            </div>
          </div>

          {/* SLA Result */}
          <div className={`rounded-xl p-4 mb-6 border ${slaPass ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
            <div className="flex items-center gap-3">
              {slaPass ? (
                <>
                  <CheckCircle className="text-green-400 w-6 h-6" />
                  <p className="text-green-400 font-bold">✅ SLA PASS — ระบบผ่านเกณฑ์ที่กำหนด</p>
                </>
              ) : (
                <>
                  <XCircle className="text-red-400 w-6 h-6" />
                  <p className="text-red-400 font-bold">❌ SLA FAIL — ระบบไม่ผ่านเกณฑ์ที่กำหนด</p>
                </>
              )}
            </div>
          </div>

          {/* Auto-generated Content */}
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-700 mb-6">
            <h4 className="text-sm font-semibold text-gray-400 mb-2">📝 สรุปผล (Auto-generated)</h4>
            <p className="text-sm text-gray-300">{generateConclusion(reportData)}</p>
            <h4 className="text-sm font-semibold text-gray-400 mt-4 mb-2">💡 ข้อแนะนำ</h4>
            <pre className="text-sm text-gray-300 whitespace-pre-wrap">{generateRecommendations(reportData)}</pre>
          </div>

          {/* Save Button */}
          {saveSuccess ? (
            <div className="w-full py-4 bg-emerald-500/20 text-emerald-400 font-bold rounded-xl flex items-center justify-center gap-2 border border-emerald-500/30">
              <CheckCircle /> Report Saved Successfully!
            </div>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving || !testerName}
              className={`w-full py-4 text-lg font-bold rounded-xl shadow-lg flex items-center justify-center gap-3 transition-all
                ${saving || !testerName
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white hover:scale-[1.01] active:scale-95'
                }`}
            >
              {saving ? (
                <>
                  <div className="w-6 h-6 border-4 border-gray-400 border-t-emerald-500 rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save /> Save Report
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Quick Generate — เลือกจาก History */}
      {!showForm && (
        <div className="bg-gray-800 rounded-2xl shadow-xl border border-gray-700 p-8 mb-8">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Zap className="text-yellow-400" /> Quick Generate
          </h3>
          <p className="text-gray-400 text-sm mb-4">
            Report จะถูกสร้างอัตโนมัติหลังจากรัน Load/Stress/Scalability Test — กดปุ่ม "Generate Report" ในผลลัพธ์ของแต่ละ test
          </p>
          <div className="bg-gray-900 p-6 rounded-xl border border-dashed border-gray-600 text-center">
            <FileText className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500">ไปที่ Load Test, Stress Test, หรือ Scalability Test แล้วรัน test เพื่อสร้าง report</p>
          </div>
        </div>
      )}

      {/* Saved Reports */}
      <div className="bg-gray-800 rounded-2xl shadow-xl border border-gray-700 p-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText className="text-emerald-400" /> Saved Reports ({savedReports.length})
          </h3>
          <button onClick={fetchSavedReports} className="text-sm text-emerald-400 hover:text-emerald-300 underline">
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-4">Loading reports...</p>
        ) : savedReports.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500">ยังไม่มี report — รัน test แล้วสร้าง report ได้เลย</p>
          </div>
        ) : (
          <div className="space-y-3">
            {savedReports.map((report) => (
              <div key={report.id} className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
                {/* Summary Row */}
                <div 
                  onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-mono text-gray-500">#{report.id}</span>
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      report.test_type === 'load' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                      report.test_type === 'stress' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                      'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                    }`}>
                      {report.test_type?.toUpperCase()}
                    </span>
                    <span className="text-white font-medium truncate max-w-[200px]">{report.target_url}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-xs font-bold ${report.sla_pass ? 'text-green-400' : 'text-red-400'}`}>
                      {report.sla_pass ? '✅ PASS' : '❌ FAIL'}
                    </span>
                    <span className="text-xs text-gray-500">{report.tester_name}</span>
                    {expandedId === report.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedId === report.id && (
                  <div className="border-t border-gray-700 p-4 space-y-4 animate-fade-in-up">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <MiniMetric label="Avg Response" value={`${report.avg_response_time}ms`} />
                      <MiniMetric label="P95" value={`${report.p95_response_time}ms`} />
                      <MiniMetric label="P99" value={`${report.p99_response_time}ms`} />
                      <MiniMetric label="Throughput" value={`${report.throughput} req/s`} />
                      <MiniMetric label="Total Requests" value={`${report.total_requests}`} />
                      <MiniMetric label="Failed" value={`${report.failed_requests}`} />
                      <MiniMetric label="Error Rate" value={`${report.error_rate}%`} />
                      <MiniMetric label="Environment" value={report.environment} />
                    </div>
                    
                    {report.test_objective && (
                      <div>
                        <p className="text-xs text-gray-400 font-semibold mb-1">วัตถุประสงค์</p>
                        <p className="text-sm text-gray-300">{report.test_objective}</p>
                      </div>
                    )}
                    {report.conclusion && (
                      <div>
                        <p className="text-xs text-gray-400 font-semibold mb-1">สรุปผล</p>
                        <p className="text-sm text-gray-300">{report.conclusion}</p>
                      </div>
                    )}
                    {report.recommendations && (
                      <div>
                        <p className="text-xs text-gray-400 font-semibold mb-1">ข้อแนะนำ</p>
                        <pre className="text-sm text-gray-300 whitespace-pre-wrap">{report.recommendations}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper: Metric Card
function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-gray-900 p-4 rounded-xl border border-gray-700 text-center">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

// Helper: Mini Metric for saved reports
function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-[10px] text-gray-500">{label}</p>
      <p className="text-sm font-bold text-gray-300">{value}</p>
    </div>
  );
}
