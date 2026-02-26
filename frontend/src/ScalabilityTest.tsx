import React, { useState, useRef } from 'react';
import { 
  Layers, Globe, Users, Clock, Play, CheckCircle, 
  Activity, AlertTriangle, ArrowUpRight, FileText
} from 'lucide-react';
import {
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

interface TestResult {
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

export default function ScalabilityTest() {
  const [formData, setFormData] = useState({
    target_url: '',
    start_users: 0,
    end_users: 0,
    step_size: 0,
    step_duration: 0,
  });
  
  const [loading, setLoading] = useState(false);
  const [currentResult, setCurrentResult] = useState<TestResult | null>(null);
  const resultSectionRef = useRef<HTMLDivElement>(null);

  const [progress, setProgress] = useState({
    percent: 0,
    elapsed: 0,
    total: 0,
    current_users: 0,
    requests_per_sec: 0,
    current_response_time: 0,
    current_error_rate: 0,
    median_response_time: 0,
    p95_response_time: 0,
    p99_response_time: 0,
    throughput: 0,
  });

  const [progressHistory, setProgressHistory] = useState<{
    users: number;
    responseTime: number;
    p95: number;
    errorRate: number;
  }[]>([]);

  const isValidUrl = (urlString: string): boolean => {
    try {
      const url = new URL(urlString);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  };

  // จำนวน steps ทั้งหมด (guard division by zero)
  const getStepCount = () => {
    if (!formData.step_size || formData.step_size <= 0) return 1;
    if (formData.end_users <= formData.start_users) return 1;
    return Math.min(Math.ceil((formData.end_users - formData.start_users) / formData.step_size) + 1, 100);
  };

  // Total duration
  const getTotalDuration = () => {
    return getStepCount() * (formData.step_duration || 0) + 10; // +10 ramp down
  };

  // Scalability Score (0-100): วัดว่า response time เพิ่มขึ้นแบบ linear หรือ exponential
  const getScalabilityScore = () => {
    if (progressHistory.length < 3) return null;
    
    const first = progressHistory[0];
    const last = progressHistory[progressHistory.length - 1];
    
    if (!first || !last || first.responseTime === 0) return null;
    
    // ratio = response time สุดท้าย / response time แรก
    const ratio = last.responseTime / first.responseTime;
    const userRatio = last.users / first.users;
    
    // ถ้า ratio < userRatio = scale ดี (linear)
    // ถ้า ratio > userRatio^2 = scale แย่ (exponential)
    const idealRatio = userRatio; // linear scaling
    const score = Math.max(0, Math.min(100, Math.round(100 - ((ratio / idealRatio - 1) * 50))));
    
    return score;
  };

  // Generate Report — เปิดหน้า Report พร้อมส่งข้อมูลผลลัพธ์
  const handleGenerateReport = () => {
    if (!currentResult) return;
    
    const reportData = {
      test_type: currentResult.test_type || 'scalability',
      target_url: currentResult.target_url || formData.target_url,
      virtual_users: currentResult.virtual_users || formData.end_users,
      duration: currentResult.duration || getTotalDuration(),
      status: currentResult.status,
      avg_response_time: currentResult.avg_response_time,
      min_response_time: currentResult.min_response_time || 0,
      median_response_time: currentResult.median_response_time || 0,
      p95_response_time: currentResult.p95_response_time || 0,
      p99_response_time: currentResult.p99_response_time || 0,
      max_response_time: currentResult.max_response_time || 0,
      throughput: currentResult.throughput || 0,
      total_requests: currentResult.total_requests || 0,
      failed_requests: currentResult.failed_requests || 0,
      error_rate: currentResult.error_rate,
      test_history_id: currentResult.test_history_id || 0,
    };

    localStorage.setItem('pendingReportData', JSON.stringify(reportData));
    window.dispatchEvent(new CustomEvent('navigate', { detail: 'report' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidUrl(formData.target_url)) {
      alert("❌ URL ไม่ถูกต้อง! \nกรุณาใส่ http:// หรือ https:// ให้ครบถ้วน");
      return;
    }
    
    const totalDuration = getTotalDuration();
    setLoading(true);
    setCurrentResult(null);
    setProgress({ percent: 0, elapsed: 0, total: totalDuration, current_users: 0, requests_per_sec: 0, current_response_time: 0, current_error_rate: 0, median_response_time: 0, p95_response_time: 0, p99_response_time: 0, throughput: 0 });
    setProgressHistory([]);

    const token = localStorage.getItem("token");
    
    const params = new URLSearchParams({
      target_url: formData.target_url,
      virtual_users: String(formData.end_users),
      duration: String(totalDuration),
      test_type: "scalability",
      start_users: String(formData.start_users),
      end_users: String(formData.end_users),
      step_size: String(formData.step_size),
      step_duration: String(formData.step_duration),
      token: token || ""
    });
    
    const eventSource = new EventSource(`http://localhost:3002/api/test/stream?${params}`);
    
    eventSource.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'progress') {
        setProgress(data);
        // สำหรับ scalability เก็บเฉพาะจุดที่ users เปลี่ยน
        setProgressHistory(prev => {
          const lastEntry = prev[prev.length - 1];
          // เก็บทุกจุด (ใช้ users เป็น x-axis)
          if (!lastEntry || lastEntry.users !== data.current_users || 
              Math.abs(lastEntry.responseTime - data.current_response_time) > 1) {
            return [...prev, {
              users: data.current_users,
              responseTime: data.current_response_time,
              p95: data.p95_response_time,
              errorRate: data.current_error_rate,
            }];
          }
          return prev;
        });
      }
      
      if (data.type === 'complete') {
        eventSource.close();
        setLoading(false);
        setCurrentResult({
          id: Date.now(),
          test_type: 'scalability',
          target_url: data.target_url,
          status: data.status,
          avg_response_time: Math.round(data.avg_response_time),
          error_rate: Math.round(data.error_rate * 100) / 100,
          median_response_time: Math.round(data.median_response_time || 0),
          p95_response_time: Math.round(data.p95_response_time || 0),
          p99_response_time: Math.round(data.p99_response_time || 0),
          max_response_time: Math.round(data.max_response_time || 0),
          throughput: Math.round((data.throughput || 0) * 100) / 100,
          total_requests: data.total_requests || 0,
          failed_requests: data.failed_requests || 0,
          virtual_users: data.virtual_users || formData.end_users,
          duration: data.duration || getTotalDuration(),
          test_history_id: data.test_history_id
        });
        
        setTimeout(() => {
          resultSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 300);
      }
      
      if (data.type === 'error') {
        eventSource.close();
        setLoading(false);
        alert(`❌ Error: ${data.message}`);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      setLoading(false);
      alert("การเชื่อมต่อขาดหาย กรุณาลองใหม่");
    };
  };

  const scalabilityScore = getScalabilityScore();

  return (
    <div className="w-full max-w-6xl mx-auto p-6 pb-20 animate-fade-in-up">
      
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <Layers className="text-cyan-400" /> Scalability Testing Console
        </h1>
        <p className="text-gray-400">ทดสอบว่าระบบ scale ได้ดีแค่ไหน — เพิ่ม users ทีละขั้นเพื่อหาจุด breaking point</p>
      </div>

      {/* --- INPUT FORM --- */}
      <div className="bg-gray-800 rounded-2xl shadow-xl border border-gray-700 p-8 mb-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* URL */}
            <div className="col-span-1 md:col-span-2 space-y-2">
              <label className="text-sm font-medium text-gray-300 flex items-center">
                <Globe className="w-4 h-4 mr-2 text-blue-400" /> Target URL
              </label>
              <input
                type="url"
                required
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all"
                value={formData.target_url}
                onChange={e => setFormData({...formData, target_url: e.target.value})}
              />
            </div>

            {/* Start Users */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300 flex items-center">
                <Users className="w-4 h-4 mr-2 text-green-400" /> Start Users
              </label>
              <input
                type="number" min="1"
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-green-500 outline-none"
                value={formData.start_users || ''}
                onChange={e => setFormData({...formData, start_users: Number(e.target.value)})}
              />
            </div>

            {/* End Users */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300 flex items-center">
                <Users className="w-4 h-4 mr-2 text-red-400" /> End Users (จุดสูงสุด)
              </label>
              <input
                type="number" min="1"
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-red-500 outline-none"
                value={formData.end_users || ''}
                onChange={e => setFormData({...formData, end_users: Number(e.target.value)})}
              />
            </div>

            {/* Step Size */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300 flex items-center">
                <ArrowUpRight className="w-4 h-4 mr-2 text-cyan-400" /> Step Size (เพิ่มทีละ)
              </label>
              <input
                type="number" min="1"
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                value={formData.step_size || ''}
                onChange={e => setFormData({...formData, step_size: Number(e.target.value)})}
              />
            </div>

            {/* Step Duration */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300 flex items-center">
                <Clock className="w-4 h-4 mr-2 text-yellow-400" /> Duration ต่อขั้น (วินาที)
              </label>
              <input
                type="number" min="5"
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                value={formData.step_duration || ''}
                onChange={e => setFormData({...formData, step_duration: Number(e.target.value)})}
              />
            </div>
          </div>

          {/* Steps Preview */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-600 min-w-0 overflow-hidden">
            <h4 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" /> Scalability Steps Preview
            </h4>
            <div className="overflow-x-auto pb-2">
              <div className="flex items-end gap-1 h-16" style={{ minWidth: getStepCount() > 20 ? `${getStepCount() * 28}px` : 'auto' }}>
                {Array.from({ length: getStepCount() }, (_, i) => {
                  const users = formData.start_users + i * formData.step_size;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center" style={{ minWidth: '20px' }}>
                      <span className="text-[9px] text-gray-500 mb-1 whitespace-nowrap">{users}</span>
                      <div 
                        className="w-full rounded-t transition-all bg-gradient-to-t from-cyan-600 to-cyan-400"
                        style={{ height: `${Math.max(4, (users / formData.end_users) * 50)}px` }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              {getStepCount()} steps × {formData.step_duration}s = ~{getTotalDuration()}s ({Math.round(getTotalDuration() / 60)} นาที)
            </p>
          </div>

          {/* Start Button */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-4 text-lg font-bold rounded-xl shadow-lg transform transition-all flex items-center justify-center gap-3
              ${loading 
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white hover:scale-[1.01] active:scale-95'
              }`}
          >
            {loading ? (
              <>
                <div className="w-6 h-6 border-4 border-gray-400 border-t-cyan-500 rounded-full animate-spin"></div>
                <span>Scalability Testing in progress...</span>
              </>
            ) : (
              <>
                <Play className="fill-current" /> Start Scalability Test
              </>
            )}
          </button>
        </form>
      </div>

      {/* --- PROGRESS SECTION --- */}
      {loading && (
        <div className="bg-gray-800 rounded-2xl shadow-xl border border-gray-700 p-8 mb-8 animate-fade-in-up">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Activity className="text-cyan-400 animate-pulse" />
            Scalability Testing in Progress...
          </h3>
          
          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>{progress.elapsed}s / {progress.total}s</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>

          {/* Real-time Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-900 rounded-xl p-4 text-center">
              <p className="text-gray-400 text-xs mb-1">Current Users</p>
              <p className="text-2xl font-bold text-cyan-400">{progress.current_users}</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 text-center">
              <p className="text-gray-400 text-xs mb-1">Response Time</p>
              <p className="text-2xl font-bold text-blue-400">{progress.current_response_time} ms</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 text-center">
              <p className="text-gray-400 text-xs mb-1">Error Rate</p>
              <p className={`text-2xl font-bold ${progress.current_error_rate > 0 ? 'text-red-400' : 'text-green-400'}`}>
                {progress.current_error_rate}%
              </p>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 text-center">
              <p className="text-gray-400 text-xs mb-1">Step</p>
              <p className="text-2xl font-bold text-gray-300">
                {Math.min(getStepCount(), Math.ceil(progress.elapsed / formData.step_duration))} / {getStepCount()}
              </p>
            </div>
          </div>

          {/* Percentile + Throughput Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div className="bg-gray-900 p-3 rounded-xl text-center border border-gray-700">
              <p className="text-gray-500 text-xs mb-1">Median (p50)</p>
              <p className="text-lg font-bold text-blue-300">{progress.median_response_time} ms</p>
            </div>
            <div className="bg-gray-900 p-3 rounded-xl text-center border border-orange-900/50">
              <p className="text-gray-500 text-xs mb-1">p95</p>
              <p className="text-lg font-bold text-orange-400">{progress.p95_response_time} ms</p>
            </div>
            <div className="bg-gray-900 p-3 rounded-xl text-center border border-red-900/50">
              <p className="text-gray-500 text-xs mb-1">p99</p>
              <p className="text-lg font-bold text-red-400">{progress.p99_response_time} ms</p>
            </div>
            <div className="bg-gray-900 p-3 rounded-xl text-center border border-green-900/50">
              <p className="text-gray-500 text-xs mb-1">Throughput</p>
              <p className="text-lg font-bold text-green-400">{progress.throughput} req/s</p>
            </div>
          </div>

          {/* Real-time Chart: Response Time vs Users */}
          <div className="mt-6 bg-gray-900 p-4 rounded-xl border border-gray-700">
            <h4 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
              <Activity className="text-cyan-400 w-4 h-4" /> Response Time by Users (Finding Breaking Point)
            </h4>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={progressHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false}/>
                  <XAxis dataKey="users" stroke="#9ca3af" tick={{fontSize: 10}} label={{ value: 'Users', position: 'insideBottomRight', offset: -5, fill: '#9ca3af' }}/>
                  <YAxis stroke="#3b82f6" tick={{fontSize: 10}} label={{ value: 'ms', angle: -90, position: 'insideLeft', fill: '#3b82f6' }}/>
                  <Tooltip contentStyle={{backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px'}} labelFormatter={(v) => `${v} Users`}/>
                  <Legend />
                  <Line type="monotone" dataKey="responseTime" name="Avg (ms)" stroke="#06b6d4" strokeWidth={2} dot={{ fill: '#06b6d4', r: 4 }} isAnimationActive={false}/>
                  <Line type="monotone" dataKey="p95" name="p95 (ms)" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316', r: 3 }} strokeDasharray="5 3" isAnimationActive={false}/>
                  <Line type="monotone" dataKey="errorRate" name="Error Rate (%)" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 3 }} isAnimationActive={false}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* --- RESULT SECTION --- */}
      {currentResult && (
        <div ref={resultSectionRef} className="bg-gray-800 rounded-2xl shadow-xl border border-gray-700 p-8 animate-fade-in-up">
          {/* Status Header */}
          <div className="flex items-center gap-3 mb-6">
            {currentResult.error_rate >= 100 ? (
              <>
                <AlertTriangle className="text-red-500 w-8 h-8" />
                <h2 className="text-2xl font-bold text-red-500">Scalability Test Failed</h2>
              </>
            ) : currentResult.error_rate > 0 ? (
              <>
                <AlertTriangle className="text-yellow-500 w-8 h-8" />
                <h2 className="text-2xl font-bold text-yellow-500">Completed with Errors</h2>
              </>
            ) : (
              <>
                <CheckCircle className="text-green-500 w-8 h-8" />
                <h2 className="text-2xl font-bold text-green-500">Scalability Test Passed!</h2>
              </>
            )}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-900 p-5 rounded-xl border border-gray-700 text-center shadow-lg">
              <p className="text-gray-400 text-sm mb-2">Users Range</p>
              <p className="text-2xl font-bold text-cyan-400">{formData.start_users} → {formData.end_users}</p>
            </div>
            <div className="bg-gray-900 p-5 rounded-xl border border-gray-700 text-center shadow-lg">
              <p className="text-gray-400 text-sm mb-2">Avg Response Time</p>
              <p className="text-2xl font-bold text-blue-400">{currentResult.avg_response_time} <span className="text-sm">ms</span></p>
            </div>
            <div className="bg-gray-900 p-5 rounded-xl border border-gray-700 text-center shadow-lg">
              <p className="text-gray-400 text-sm mb-2">Median (p50)</p>
              <p className="text-2xl font-bold text-sky-400">{currentResult.median_response_time || 0} <span className="text-sm">ms</span></p>
            </div>
            <div className="bg-gray-900 p-5 rounded-xl border border-gray-700 text-center shadow-lg">
              <p className="text-gray-400 text-sm mb-2">P95 Response</p>
              <p className="text-2xl font-bold text-indigo-400">{currentResult.p95_response_time || 0} <span className="text-sm">ms</span></p>
            </div>
            <div className="bg-gray-900 p-5 rounded-xl border border-gray-700 text-center shadow-lg">
              <p className="text-gray-400 text-sm mb-2">P99 Response</p>
              <p className="text-2xl font-bold text-purple-400">{currentResult.p99_response_time || 0} <span className="text-sm">ms</span></p>
            </div>
            <div className="bg-gray-900 p-5 rounded-xl border border-gray-700 text-center shadow-lg">
              <p className="text-gray-400 text-sm mb-2">Throughput</p>
              <p className="text-2xl font-bold text-green-400">{currentResult.throughput || 0} <span className="text-sm">req/s</span></p>
            </div>
            <div className="bg-gray-900 p-5 rounded-xl border border-gray-700 text-center shadow-lg">
              <p className="text-gray-400 text-sm mb-2">Error Rate</p>
              <p className={`text-2xl font-bold ${currentResult.error_rate > 0 ? 'text-red-500' : 'text-green-400'}`}>
                {currentResult.error_rate}%
              </p>
            </div>
            <div className="bg-gray-900 p-5 rounded-xl border border-gray-700 text-center shadow-lg">
              <p className="text-gray-400 text-sm mb-2">Scalability Score</p>
              {scalabilityScore !== null ? (
                <p className={`text-2xl font-bold ${
                  scalabilityScore >= 80 ? 'text-green-400' : 
                  scalabilityScore >= 50 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {scalabilityScore}/100
                </p>
              ) : (
                <p className="text-2xl font-bold text-gray-500">N/A</p>
              )}
            </div>
          </div>

          {/* Scalability Score Explanation */}
          {scalabilityScore !== null && (
            <div className={`rounded-xl p-4 mb-6 border ${
              scalabilityScore >= 80 ? 'bg-green-500/10 border-green-500/30' : 
              scalabilityScore >= 50 ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-red-500/10 border-red-500/30'
            }`}>
              <p className={`text-sm font-semibold ${
                scalabilityScore >= 80 ? 'text-green-400' : 
                scalabilityScore >= 50 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {scalabilityScore >= 80 ? '✅ ระบบ Scale ได้ดี — Response time เพิ่มขึ้นแบบ linear' : 
                 scalabilityScore >= 50 ? '⚠️ Scale ได้ปานกลาง — ควรปรับปรุงให้ดีขึ้น' : 
                 '❌ Scale ได้แย่ — Response time เพิ่มแบบ exponential ต้องแก้ไข'}
              </p>
            </div>
          )}

          {/* Final Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-900 p-6 rounded-2xl border border-gray-700">
              <h3 className="text-lg font-bold text-gray-200 mb-4 flex items-center gap-2">
                <Activity className="text-cyan-400 w-5 h-5"/> Response Time vs Users
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={progressHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false}/>
                    <XAxis dataKey="users" stroke="#9ca3af" tick={{fontSize: 10}} label={{ value: 'Users', position: 'insideBottomRight', offset: -5, fill: '#9ca3af' }}/>
                    <YAxis stroke="#06b6d4" tick={{fontSize: 10}} label={{ value: 'ms', angle: -90, position: 'insideLeft', fill: '#06b6d4' }}/>
                    <Tooltip contentStyle={{backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px'}} labelFormatter={(v) => `${v} Users`}/>
                    <Legend />
                    <Line type="monotone" dataKey="responseTime" name="Response Time (ms)" stroke="#06b6d4" strokeWidth={2} dot={{ fill: '#06b6d4', strokeWidth: 2, r: 4 }} isAnimationActive={true}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-gray-900 p-6 rounded-2xl border border-gray-700">
              <h3 className="text-lg font-bold text-gray-200 mb-4 flex items-center gap-2">
                <AlertTriangle className="text-red-400 w-5 h-5"/> Error Rate vs Users
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={progressHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false}/>
                    <XAxis dataKey="users" stroke="#9ca3af" tick={{fontSize: 10}} label={{ value: 'Users', position: 'insideBottomRight', offset: -5, fill: '#9ca3af' }}/>
                    <YAxis stroke="#ef4444" tick={{fontSize: 10}} domain={[0, 100]} label={{ value: '%', angle: -90, position: 'insideLeft', fill: '#ef4444' }}/>
                    <Tooltip contentStyle={{backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px'}} labelFormatter={(v) => `${v} Users`}/>
                    <Legend />
                    <Line type="monotone" dataKey="errorRate" name="Error Rate (%)" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }} isAnimationActive={true}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          {/* Generate Report Button */}
          <button
            onClick={handleGenerateReport}
            className="w-full py-4 text-lg font-bold rounded-xl shadow-lg bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-3 mt-6"
          >
            <FileText /> Generate Report
          </button>
        </div>
      )}
    </div>
  );
}
