import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  FileText, ClipboardCheck, Target, Server,
  Clock, CheckCircle, XCircle,
  TrendingUp, Zap, Save, ChevronDown, ChevronUp, Trash2, Download
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { sarabunBase64 } from './fonts/sarabun-base64';

interface ReportData {
  // จาก complete event ของ SSE
  test_type: string;
  target_url: string;
  virtual_users: number;
  duration: number;
  status: string;
  avg_response_time: number;
  median_response_time: number;
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
  report_name: string;
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
  
  parts.push(`Average response time: ${data.avg_response_time}ms, Median: ${data.median_response_time}ms, P95: ${data.p95_response_time}ms`);
  
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
  const [description, setDescription] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [reportName, setReportName] = useState('');

  useEffect(() => {
    fetchSavedReports();

    // ตรวจสอบว่ามีข้อมูล report ที่ส่งมาจากหน้า test หรือไม่
    const pendingData = localStorage.getItem('pendingReportData');
    if (pendingData) {
      try {
        const data = JSON.parse(pendingData) as ReportData;
        setReportData(data);
        setShowForm(true);
        setSaveSuccess(false);
        setTestObjective(`Test ${data.test_type} for ${data.target_url}`);
        setDescription(generateConclusion(data));
        setRecommendations(generateRecommendations(data));
        setReportName(`${data.test_type?.toUpperCase()} Test Report`);
      } catch (err) {
        console.error('Failed to parse pending report data', err);
      }
      localStorage.removeItem('pendingReportData');
    }
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
        report_name: reportName,
        test_type: reportData.test_type || '',
        tester_name: testerName,
        target_url: reportData.target_url || '',
        virtual_users: reportData.virtual_users || 0,
        duration: reportData.duration || 0,
        avg_response_time: reportData.avg_response_time || 0,
        error_rate: reportData.error_rate || 0,
        test_objective: testObjective,
        environment,
        median_response_time: reportData.median_response_time,
        p95_response_time: reportData.p95_response_time,
        p99_response_time: reportData.p99_response_time,
        max_response_time: reportData.max_response_time,
        throughput: reportData.throughput,
        total_requests: reportData.total_requests,
        failed_requests: reportData.failed_requests,
        sla_response_time: slaResponseTime,
        sla_error_rate: slaErrorRate,
        sla_pass: slaPass,
        conclusion: description,
        recommendations: recommendations,
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

  // ลบ Report
  const handleDelete = async (id: number) => {
    if (!confirm('ต้องการลบ report นี้หรือไม่?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`http://localhost:3002/api/test/report?id=${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchSavedReports();
    } catch (err) {
      console.error('Failed to delete report', err);
    }
  };

  // Export PDF
  const handleExportPDF = (report: SavedReport) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Register Thai font
    doc.addFileToVFS('Sarabun-Regular.ttf', sarabunBase64);
    doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
    doc.setFont('Sarabun');

    // Helper: round to 2 decimal places
    const r = (n: number | undefined) => Number((n || 0).toFixed(2));

    // Title
    doc.setFontSize(20);
    doc.setTextColor(40, 40, 40);
    doc.text('Performance Test Report', pageWidth / 2, 20, { align: 'center' });

    // Report Name
    if (report.report_name) {
      doc.setFontSize(14);
      doc.setTextColor(60, 60, 60);
      doc.text(report.report_name, pageWidth / 2, 28, { align: 'center' });
    }

    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text(`Generated: ${new Date(report.created_at).toISOString().slice(0, 19).replace('T', ' ')}`, pageWidth / 2, report.report_name ? 35 : 28, { align: 'center' });

    // SLA Badge
    doc.setFontSize(14);
    doc.setTextColor(report.sla_pass ? 34 : 239, report.sla_pass ? 197 : 68, report.sla_pass ? 94 : 68);
    doc.text(`SLA: ${report.sla_pass ? 'PASS' : 'FAIL'}`, pageWidth / 2, report.report_name ? 43 : 36, { align: 'center' });

    // Test Configuration
    autoTable(doc, {
      startY: report.report_name ? 49 : 42,
      head: [['Test Configuration', '']],
      body: [
        ['Test Type', report.test_type?.toUpperCase() || 'N/A'],
        ['Target URL', report.target_url || 'N/A'],
        ['Virtual Users', String(report.virtual_users || 'N/A')],
        ['Duration', `${report.duration || 'N/A'}s`],
        ['Tester', report.tester_name || 'N/A'],
        ['Environment', report.environment || 'N/A'],
      ],
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246], fontSize: 11, font: 'Sarabun' },
      styles: { fontSize: 9, font: 'Sarabun' },
    });

    // Performance Metrics
    const metricsY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    autoTable(doc, {
      startY: metricsY,
      head: [['Metric', 'Value']],
      body: [
        ['Avg Response Time', `${r(report.avg_response_time)} ms`],
        ['Median (p50)', `${r(report.median_response_time)} ms`],
        ['P95 Response Time', `${r(report.p95_response_time)} ms`],
        ['P99 Response Time', `${r(report.p99_response_time)} ms`],
        ['Max Response Time', `${r(report.max_response_time)} ms`],
        ['Throughput', `${r(report.throughput)} req/s`],
        ['Total Requests', String(report.total_requests || 0)],
        ['Failed Requests', String(report.failed_requests || 0)],
        ['Error Rate', `${r(report.error_rate)}%`],
      ],
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129], fontSize: 11, font: 'Sarabun' },
      styles: { fontSize: 9, font: 'Sarabun' },
    });

    // SLA Criteria
    const slaY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    autoTable(doc, {
      startY: slaY,
      head: [['SLA Criteria', 'Threshold', 'Actual', 'Status']],
      body: [
        [
          'Response Time',
          `<= ${report.sla_response_time} ms`,
          `${r(report.avg_response_time)} ms`,
          report.avg_response_time <= report.sla_response_time ? 'PASS' : 'FAIL',
        ],
        [
          'Error Rate',
          `<= ${report.sla_error_rate}%`,
          `${r(report.error_rate)}%`,
          report.error_rate <= report.sla_error_rate ? 'PASS' : 'FAIL',
        ],
      ],
      theme: 'grid',
      headStyles: { fillColor: [139, 92, 246], fontSize: 10, font: 'Sarabun' },
      styles: { fontSize: 9, font: 'Sarabun' },
    });

    // Conclusion & Recommendations
    let textY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

    if (report.test_objective) {
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);
      doc.text('Objective:', 14, textY);
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      const objLines = doc.splitTextToSize(report.test_objective, pageWidth - 28);
      doc.text(objLines, 14, textY + 5);
      textY += 5 + objLines.length * 4 + 4;
    }

    if (report.conclusion) {
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);
      doc.text('Description:', 14, textY);
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      const conLines = doc.splitTextToSize(report.conclusion, pageWidth - 28);
      doc.text(conLines, 14, textY + 5);
      textY += 5 + conLines.length * 4 + 4;
    }

    if (report.recommendations) {
      if (textY > 260) { doc.addPage(); textY = 20; }
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);
      doc.text('Recommendations:', 14, textY);
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      const recLines = doc.splitTextToSize(report.recommendations, pageWidth - 28);
      doc.text(recLines, 14, textY + 5);
    }

    const safeName = report.report_name
      ? report.report_name.replace(/[^a-zA-Z0-9ก-๙\s_-]/g, '').replace(/\s+/g, '_')
      : `report_${report.test_type}_${new Date(report.created_at).toISOString().slice(0, 10)}`;
    doc.save(`${safeName}.pdf`);
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
            <MetricCard label="Median (p50)" value={`${reportData.median_response_time}ms`} color="text-sky-400" />
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
            <div className="col-span-1 md:col-span-2 space-y-2">
              <label className="text-sm text-gray-300 font-medium">Report Name</label>
              <input
                type="text"
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                value={reportName}
                onChange={e => setReportName(e.target.value)}
                placeholder="e.g. Load Test Report - Sprint 5"
              />
            </div>
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

          {/* Description & Recommendations */}
          <div className="space-y-4 mb-6">
            <div className="space-y-2">
              <label className="text-sm text-gray-300 font-medium">📝 Description / Conclusion</label>
              <textarea
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                rows={4}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe the test results and conclusions..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-gray-300 font-medium">💡 Recommendations</label>
              <textarea
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                rows={4}
                value={recommendations}
                onChange={e => setRecommendations(e.target.value)}
                placeholder="Enter recommendations for improvement..."
              />
            </div>
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
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      report.test_type === 'load' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                      report.test_type === 'stress' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                      'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                    }`}>
                      {report.test_type?.toUpperCase()}
                    </span>
                    <span className="text-white font-medium truncate max-w-[200px]">{report.report_name || report.target_url}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-xs font-bold ${report.sla_pass ? 'text-green-400' : 'text-red-400'}`}>
                      {report.sla_pass ? '✅ PASS' : '❌ FAIL'}
                    </span>
                    <span className="text-xs text-gray-500">{report.tester_name}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(report.id); }}
                      className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                      title="ลบ Report"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleExportPDF(report); }}
                      className="p-1 text-gray-500 hover:text-blue-400 transition-colors"
                      title="Export PDF"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    {expandedId === report.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedId === report.id && (
                  <div className="border-t border-gray-700 p-4 space-y-4 animate-fade-in-up">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <MiniMetric label="Avg Response" value={`${report.avg_response_time}ms`} />
                      <MiniMetric label="Median (p50)" value={`${report.median_response_time || 0}ms`} />
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
