import React, { useState, useRef } from 'react';
import { 
  Zap, Globe, Users, Clock, Play, CheckCircle, 
  Activity, AlertTriangle, FileText 
} from 'lucide-react';
import {
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

// กำหนด Type ของข้อมูล
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
}



export default function LoadTest() {
  // --- State Management ---
  const [formData, setFormData] = useState({
    target_url: 'http://localhost:5173', // ค่า Default
    virtual_users: 10,
    duration: 5,
    test_type: "load",
    // Stress test params
    max_users: 50,
    ramp_up_duration: 10,
    hold_duration: 30,
    // Scalability test params
    start_users: 10,
    end_users: 50,
    step_size: 10,
    step_duration: 10,
  });
  
  const [loading, setLoading] = useState(false);
  const [currentResult, setCurrentResult] = useState<TestResult | null>(null); // ผลลัพธ์ล่าสุด

  const resultSectionRef = useRef<HTMLDivElement>(null); // ใช้สำหรับ Auto Scroll

  // State สำหรับ Real-time Progress
  const [progress, setProgress] = useState({
    percent: 0,
    elapsed: 0,
    total: 0,
    current_users: 0,
    requests_per_sec: 0,
    current_response_time: 0,
    current_error_rate: 0,
    total_requests: 0
  });

  // State สำหรับเก็บประวัติ progress ทุกวินาที (สำหรับกราฟ real-time)
  const [progressHistory, setProgressHistory] = useState<{
    time: number;
    responseTime: number;
    errorRate: number;
    rps: number;
    users: number;
  }[]>([]);

  // ฟังก์ชันตรวจสอบ URL ว่าถูกต้องหรือไม่
  const isValidUrl = (urlString: string): boolean => {
    try {
      const url = new URL(urlString);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  };

  // ฟังก์ชันกดปุ่ม Start (ใช้ SSE สำหรับ Real-time Progress)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidUrl(formData.target_url)) {
        alert("❌ URL ไม่ถูกต้อง! \nกรุณาใส่ http:// หรือ https:// ให้ครบถ้วน");
        return;
    }
    
    setLoading(true);
    setCurrentResult(null);
    setProgress({ percent: 0, elapsed: 0, total: formData.duration, current_users: 0, requests_per_sec: 0, current_response_time: 0, current_error_rate: 0, total_requests: 0 });
    setProgressHistory([]);

    const token = localStorage.getItem("token");
    
    const params = new URLSearchParams({
      target_url: formData.target_url,
      virtual_users: String(formData.virtual_users),
      duration: String(formData.duration),
      test_type: formData.test_type,
      token: token || "",
      // Stress test params
      max_users: String(formData.max_users),
      ramp_up_duration: String(formData.ramp_up_duration),
      hold_duration: String(formData.hold_duration),
      // Scalability test params
      start_users: String(formData.start_users),
      end_users: String(formData.end_users),
      step_size: String(formData.step_size),
      step_duration: String(formData.step_duration),
    });
    
    const eventSource = new EventSource(`http://localhost:3002/api/test/stream?${params}`);
    
    eventSource.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === "progress") {
        setProgress({
          percent: data.percent,
          elapsed: data.elapsed,
          total: data.total,
          current_users: data.current_users,
          requests_per_sec: data.requests_per_sec,
          current_response_time: data.current_response_time,
          current_error_rate: data.current_error_rate,
          total_requests: data.total_requests || 0
        });
        
        // เก็บประวัติสำหรับกราฟ real-time
        setProgressHistory(prev => [...prev, {
          time: data.elapsed,
          responseTime: data.current_response_time,
          errorRate: data.current_error_rate,
          rps: data.requests_per_sec,
          users: data.current_users
        }]);
      } 
      else if (data.type === "complete") {
        eventSource.close();
        setCurrentResult(data);
        setLoading(false);
        setProgress(prev => ({ ...prev, percent: 100 }));
        
        if (resultSectionRef.current) {
          resultSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      else if (data.type === "error") {
        eventSource.close();
        setLoading(false);
        alert(`เกิดข้อผิดพลาด: ${data.message}`);
      }
    };
    
    eventSource.onerror = () => {
      eventSource.close();
      setLoading(false);
      alert("การเชื่อมต่อขาดหาย กรุณาลองใหม่");
    };
  };

  // Generate Report — เปิดหน้า Report พร้อมส่งข้อมูลผลลัพธ์
  const handleGenerateReport = () => {
    if (!currentResult) return;
    
    const genReport = (window as unknown as { generateReport?: (data: unknown) => void }).generateReport;
    if (genReport) {
      genReport({
        test_type: currentResult.test_type || formData.test_type,
        target_url: currentResult.target_url || formData.target_url,
        virtual_users: currentResult.virtual_users || formData.virtual_users,
        duration: currentResult.duration || formData.duration,
        status: currentResult.status,
        avg_response_time: currentResult.avg_response_time,
        min_response_time: currentResult.min_response_time || 0,
        p95_response_time: currentResult.p95_response_time || 0,
        p99_response_time: currentResult.p99_response_time || 0,
        max_response_time: currentResult.max_response_time || 0,
        throughput: currentResult.throughput || 0,
        total_requests: currentResult.total_requests || 0,
        failed_requests: currentResult.failed_requests || 0,
        error_rate: currentResult.error_rate,
        test_history_id: currentResult.test_history_id || 0,
      });
    }

    // Navigate ไปหน้า Report
    window.dispatchEvent(new CustomEvent('navigate', { detail: 'report' }));
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-6 pb-20 animate-fade-in-up">
      
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <Zap className="text-purple-400 fill-current" /> Load Testing Console
        </h1>
        <p className="text-gray-400">กำหนดค่าและเริ่มการทดสอบประสิทธิภาพได้ทันที</p>
      </div>

      {/* --- SECTION 1: INPUT FORM --- */}
      <div className="bg-gray-800 rounded-2xl shadow-xl border border-gray-700 p-8 mb-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Target URL */}
            <div className="col-span-1 md:col-span-2 space-y-2">
              <label className="text-sm font-medium text-gray-300 flex items-center">
                <Globe className="w-4 h-4 mr-2 text-blue-400" /> Target URL
              </label>
              <input
                type="url"
                required
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                value={formData.target_url}
                onChange={e => setFormData({...formData, target_url: e.target.value})}
              />
            </div>

            {/* Test Type Selector */}
            <div className="col-span-1 md:col-span-2 space-y-2">
              <label className="text-sm font-medium text-gray-300 flex items-center">
                <Zap className="w-4 h-4 mr-2 text-yellow-400" /> Test Type
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({...formData, test_type: 'load'})}
                  className={`py-3 px-4 rounded-xl text-sm font-semibold transition-all border ${
                    formData.test_type === 'load'
                      ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-500/20'
                      : 'bg-gray-900 border-gray-600 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  ⚡ Load Test
                  <p className="text-xs mt-1 font-normal opacity-70">Constant users</p>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({...formData, test_type: 'stress'})}
                  className={`py-3 px-4 rounded-xl text-sm font-semibold transition-all border ${
                    formData.test_type === 'stress'
                      ? 'bg-red-600 border-red-500 text-white shadow-lg shadow-red-500/20'
                      : 'bg-gray-900 border-gray-600 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  🔥 Stress Test
                  <p className="text-xs mt-1 font-normal opacity-70">Ramp up users</p>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({...formData, test_type: 'scalability'})}
                  className={`py-3 px-4 rounded-xl text-sm font-semibold transition-all border ${
                    formData.test_type === 'scalability'
                      ? 'bg-cyan-600 border-cyan-500 text-white shadow-lg shadow-cyan-500/20'
                      : 'bg-gray-900 border-gray-600 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  📈 Scalability
                  <p className="text-xs mt-1 font-normal opacity-70">Step-wise users</p>
                </button>
              </div>
            </div>

            {/* Virtual Users — สำหรับ Load Test */}
            {formData.test_type === 'load' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300 flex items-center">
                  <Users className="w-4 h-4 mr-2 text-purple-400" /> Virtual Users
                </label>
                <input
                  type="number"
                  min="1"
                  className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                  value={formData.virtual_users || ''}
                  onChange={e => {
                    const val = e.target.value;
                    setFormData({...formData, virtual_users: val === '' ? 0 : parseInt(val, 10) || 0});
                  }}
                />
              </div>
            )}

            {/* Duration — สำหรับ Load Test เท่านั้น */}
            {formData.test_type === 'load' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300 flex items-center">
                  <Clock className="w-4 h-4 mr-2 text-green-400" /> Duration (Seconds)
                </label>
                <input
                  type="number"
                  min="1"
                  className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-green-500 outline-none"
                  value={formData.duration || ''}
                  onChange={e => {
                    const val = e.target.value;
                    setFormData({...formData, duration: val === '' ? 0 : parseInt(val, 10) || 0});
                  }}
                />
              </div>
            )}

            {/* Stress Test Inputs */}
            {formData.test_type === 'stress' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300 flex items-center">
                    <Users className="w-4 h-4 mr-2 text-red-400" /> Max Users
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-red-500 outline-none"
                    value={formData.max_users || ''}
                    onChange={e => {
                      const val = e.target.value;
                      setFormData({...formData, max_users: val === '' ? 0 : parseInt(val, 10) || 0});
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300 flex items-center">
                    <Activity className="w-4 h-4 mr-2 text-orange-400" /> Ramp Up (sec/stage)
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.ramp_up_duration || ''}
                    onChange={e => {
                      const val = e.target.value;
                      setFormData({...formData, ramp_up_duration: val === '' ? 0 : parseInt(val, 10) || 0});
                    }}
                  />
                </div>
                <div className="col-span-1 md:col-span-2 space-y-2">
                  <label className="text-sm font-medium text-gray-300 flex items-center">
                    <Clock className="w-4 h-4 mr-2 text-yellow-400" /> Hold Duration (sec)
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                    value={formData.hold_duration || ''}
                    onChange={e => {
                      const val = e.target.value;
                      setFormData({...formData, hold_duration: val === '' ? 0 : parseInt(val, 10) || 0});
                    }}
                  />
                </div>

                {/* Stage Preview */}
                <div className="col-span-1 md:col-span-2 bg-gray-900 rounded-xl p-4 border border-gray-700">
                  <p className="text-xs text-gray-400 mb-2">📋 Stress Test Stages:</p>
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <span className="bg-blue-900/50 text-blue-300 px-2 py-1 rounded">↗ {Math.round(formData.max_users * 0.2)} users ({formData.ramp_up_duration}s)</span>
                    <span className="text-gray-600">→</span>
                    <span className="bg-purple-900/50 text-purple-300 px-2 py-1 rounded">↗ {Math.round(formData.max_users * 0.5)} users ({formData.ramp_up_duration}s)</span>
                    <span className="text-gray-600">→</span>
                    <span className="bg-red-900/50 text-red-300 px-2 py-1 rounded">↗ {formData.max_users} users ({formData.ramp_up_duration}s)</span>
                    <span className="text-gray-600">→</span>
                    <span className="bg-orange-900/50 text-orange-300 px-2 py-1 rounded">⏸ Hold ({formData.hold_duration}s)</span>
                    <span className="text-gray-600">→</span>
                    <span className="bg-green-900/50 text-green-300 px-2 py-1 rounded">↘ 0 users ({formData.ramp_up_duration}s)</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Total Duration: {(formData.ramp_up_duration * 4) + formData.hold_duration}s</p>
                </div>
              </>
            )}

            {/* Scalability Test Inputs */}
            {formData.test_type === 'scalability' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300 flex items-center">
                    <Users className="w-4 h-4 mr-2 text-cyan-400" /> Start Users
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                    value={formData.start_users || ''}
                    onChange={e => {
                      const val = e.target.value;
                      setFormData({...formData, start_users: val === '' ? 0 : parseInt(val, 10) || 0});
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300 flex items-center">
                    <Users className="w-4 h-4 mr-2 text-cyan-400" /> End Users
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                    value={formData.end_users || ''}
                    onChange={e => {
                      const val = e.target.value;
                      setFormData({...formData, end_users: val === '' ? 0 : parseInt(val, 10) || 0});
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300 flex items-center">
                    <Activity className="w-4 h-4 mr-2 text-teal-400" /> Step Size (users)
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-teal-500 outline-none"
                    value={formData.step_size || ''}
                    onChange={e => {
                      const val = e.target.value;
                      setFormData({...formData, step_size: val === '' ? 0 : parseInt(val, 10) || 0});
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300 flex items-center">
                    <Clock className="w-4 h-4 mr-2 text-teal-400" /> Step Duration (sec)
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-teal-500 outline-none"
                    value={formData.step_duration || ''}
                    onChange={e => {
                      const val = e.target.value;
                      setFormData({...formData, step_duration: val === '' ? 0 : parseInt(val, 10) || 0});
                    }}
                  />
                </div>

                {/* Step Preview */}
                <div className="col-span-1 md:col-span-2 bg-gray-900 rounded-xl p-4 border border-gray-700 min-w-0 overflow-hidden">
                  <p className="text-xs text-gray-400 mb-2">📋 Scalability Test Steps:</p>
                  <div className="overflow-x-auto pb-2">
                    <div className="flex items-center gap-2 text-xs whitespace-nowrap">
                      {Array.from({ length: Math.ceil((formData.end_users - formData.start_users) / (formData.step_size || 1)) + 1 }, (_, i) => {
                        const users = Math.min(formData.start_users + i * formData.step_size, formData.end_users);
                        return (
                          <span key={i} className="flex items-center gap-1">
                            {i > 0 && <span className="text-gray-600">→</span>}
                            <span className="bg-cyan-900/50 text-cyan-300 px-2 py-1 rounded">
                              {users} users ({formData.step_duration}s)
                            </span>
                          </span>
                        );
                      })}
                      <span className="text-gray-600">→</span>
                      <span className="bg-green-900/50 text-green-300 px-2 py-1 rounded">↘ 0 users (10s)</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Total Duration: {(Math.ceil((formData.end_users - formData.start_users) / (formData.step_size || 1)) + 1) * formData.step_duration + 10}s
                  </p>
                </div>
              </>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-4 text-lg font-bold rounded-xl shadow-lg transform transition-all flex items-center justify-center gap-3
              ${loading 
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white hover:scale-[1.01] active:scale-95'
              }`}
          >
            {loading ? (
              <>
                <div className="w-6 h-6 border-4 border-gray-400 border-t-purple-500 rounded-full animate-spin"></div>
                <span>Testing in progress...</span>
              </>
            ) : (
              <>
                <Play className="fill-current" /> Start {formData.test_type === 'stress' ? 'Stress' : formData.test_type === 'scalability' ? 'Scalability' : 'Load'} Test
              </>
            )}
          </button>
        </form>
      </div>

      {/* --- PROGRESS SECTION (Real-time) --- */}
      {loading && (
        <div className="bg-gray-800 rounded-2xl shadow-xl border border-gray-700 p-8 mb-8 animate-fade-in-up">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Activity className="text-purple-400 animate-pulse" />
            Testing in Progress...
          </h3>
          
          <div className="mb-6">
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>{progress.elapsed}s / {progress.total}s</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-gray-900 p-4 rounded-xl text-center">
              <p className="text-gray-400 text-xs mb-1">Users</p>
              <p className="text-2xl font-bold text-purple-400">{progress.current_users}</p>
            </div>
            <div className="bg-gray-900 p-4 rounded-xl text-center">
              <p className="text-gray-400 text-xs mb-1">Requests/s</p>
              <p className="text-2xl font-bold text-blue-400">{progress.requests_per_sec}</p>
            </div>
            <div className="bg-gray-900 p-4 rounded-xl text-center">
              <p className="text-gray-400 text-xs mb-1">Avg Response</p>
              <p className="text-2xl font-bold text-green-400">{progress.current_response_time} ms</p>
            </div>
            <div className="bg-gray-900 p-4 rounded-xl text-center">
              <p className="text-gray-400 text-xs mb-1">Total Requests</p>
              <p className="text-2xl font-bold text-cyan-400">{progress.total_requests}</p>
            </div>
            <div className="bg-gray-900 p-4 rounded-xl text-center">
              <p className="text-gray-400 text-xs mb-1">Error Rate</p>
              <p className={`text-2xl font-bold ${progress.current_error_rate > 0 ? 'text-red-400' : 'text-green-400'}`}>
                {progress.current_error_rate}%
              </p>
            </div>
          </div>

          {/* Real-time Charts — แสดงขณะทดสอบ */}
          {progressHistory.length > 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Response Time Chart */}
              <div className="bg-gray-900 p-4 rounded-xl">
                <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-1.5">
                  <Activity className="text-blue-400 w-4 h-4" /> Response Time
                </h4>
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={progressHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false}/>
                      <XAxis dataKey="time" stroke="#9ca3af" tick={{fontSize: 10}} 
                        label={{ value: 'sec', position: 'insideBottomRight', offset: -5, fill: '#9ca3af', fontSize: 10 }}/>
                      <YAxis stroke="#9ca3af" tick={{fontSize: 10}} 
                        label={{ value: 'ms', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 10 }}/>
                      <Tooltip contentStyle={{backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px'}} 
                        labelFormatter={(value) => `${value}s`}/>
                      <Line type="monotone" dataKey="responseTime" name="Avg (ms)"
                        stroke="#3b82f6" strokeWidth={2} dot={false}
                        isAnimationActive={false}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Throughput Chart */}
              <div className="bg-gray-900 p-4 rounded-xl">
                <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-1.5">
                  <Zap className="text-purple-400 w-4 h-4" /> Throughput
                </h4>
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={progressHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false}/>
                      <XAxis dataKey="time" stroke="#9ca3af" tick={{fontSize: 10}} 
                        label={{ value: 'sec', position: 'insideBottomRight', offset: -5, fill: '#9ca3af', fontSize: 10 }}/>
                      <YAxis stroke="#9ca3af" tick={{fontSize: 10}} 
                        label={{ value: 'req/s', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 10 }}/>
                      <Tooltip contentStyle={{backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px'}} 
                        labelFormatter={(value) => `${value}s`}/>
                      <Line type="monotone" dataKey="rps" name="req/s"
                        stroke="#a855f7" strokeWidth={2} dot={false}
                        isAnimationActive={false}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Error Rate Chart */}
              <div className="bg-gray-900 p-4 rounded-xl">
                <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-1.5">
                  <AlertTriangle className="text-red-400 w-4 h-4" /> Error Rate
                </h4>
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={progressHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false}/>
                      <XAxis dataKey="time" stroke="#9ca3af" tick={{fontSize: 10}} 
                        label={{ value: 'sec', position: 'insideBottomRight', offset: -5, fill: '#9ca3af', fontSize: 10 }}/>
                      <YAxis stroke="#9ca3af" tick={{fontSize: 10}} domain={[0, 100]} 
                        label={{ value: '%', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 10 }}/>
                      <Tooltip contentStyle={{backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px'}} 
                        labelFormatter={(value) => `${value}s`}/>
                      <Line type="monotone" dataKey="errorRate" name="Error (%)"
                        stroke="#ef4444" strokeWidth={2} dot={false}
                        isAnimationActive={false}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- RESULT AREA --- */}
      {currentResult && (
        <div ref={resultSectionRef} className="animate-fade-in-up space-y-8 border-t border-gray-700 pt-8">
          
          {/* Status Header */}
          <div className="flex items-center gap-3">
             {Number(currentResult.error_rate) >= 100 ? (
                <>
                    <AlertTriangle className="text-red-500 w-8 h-8" />
                    <h2 className="text-2xl font-bold text-red-500">Test Failed</h2>
                </>
             ) : currentResult.error_rate > 0 ? (
                <>
                    <AlertTriangle className="text-yellow-500 w-8 h-8" />
                    <h2 className="text-2xl font-bold text-yellow-500">Test Completed with Errors</h2>
                </>
             ) : (
                <>
                    <CheckCircle className="text-green-500 w-8 h-8" />
                    <h2 className="text-2xl font-bold text-green-500">Test Completed Successfully</h2>
                </>
             )}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 text-center shadow-lg">
              <p className="text-gray-400 text-sm mb-2">Min Response Time</p>
              <p className="text-4xl font-bold text-cyan-400">{currentResult.min_response_time?.toFixed(2) || '0'} <span className="text-lg">ms</span></p>
            </div>
            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 text-center shadow-lg">
              <p className="text-gray-400 text-sm mb-2">Avg Response Time</p>
              <p className="text-4xl font-bold text-blue-400">{currentResult.avg_response_time?.toFixed(2) || '0'} <span className="text-lg">ms</span></p>
            </div>
            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 text-center shadow-lg">
              <p className="text-gray-400 text-sm mb-2">Max Response Time</p>
              <p className="text-4xl font-bold text-orange-400">{currentResult.max_response_time?.toFixed(2) || '0'} <span className="text-lg">ms</span></p>
            </div>
            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 text-center shadow-lg">
              <p className="text-gray-400 text-sm mb-2">Throughput</p>
              <p className="text-4xl font-bold text-purple-400">{currentResult.throughput?.toFixed(2) || '0'} <span className="text-lg">req/s</span></p>
            </div>
            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 text-center shadow-lg">
              <p className="text-gray-400 text-sm mb-2">Total Requests</p>
              <p className="text-4xl font-bold text-white">{currentResult.total_requests || 0}</p>
            </div>
            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 text-center shadow-lg">
              <p className="text-gray-400 text-sm mb-2">Error Rate</p>
              <p className={`text-4xl font-bold ${currentResult.error_rate > 0 ? 'text-red-500' : 'text-green-400'}`}>
                {currentResult.error_rate}%
              </p>
            </div>
          </div>

          {/* Charts — แสดงข้อมูลที่เก็บระหว่างทดสอบ */}
          {progressHistory.length > 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                 <h3 className="text-lg font-bold text-gray-200 mb-4 flex items-center gap-2">
                   <Activity className="text-blue-400 w-5 h-5"/> Response Time
                 </h3>
                 <div className="h-[250px]">
                   <ResponsiveContainer width="100%" height="100%">
                     <LineChart data={progressHistory}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false}/>
                        <XAxis dataKey="time" stroke="#9ca3af" tick={{fontSize: 10}} 
                          label={{ value: 'sec', position: 'insideBottomRight', offset: -5, fill: '#9ca3af' }}/>
                        <YAxis stroke="#9ca3af" tick={{fontSize: 10}} 
                          label={{ value: 'ms', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}/>
                        <Tooltip contentStyle={{backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px'}} 
                          labelFormatter={(value) => `${value}s`}/>
                        <Legend />
                        <Line type="monotone" dataKey="responseTime" name="Avg Response (ms)"
                          stroke="#3b82f6" strokeWidth={2}
                          dot={{ fill: '#3b82f6', strokeWidth: 2, r: 3 }}
                          activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
                          isAnimationActive={true}/>
                     </LineChart>
                   </ResponsiveContainer>
                 </div>
              </div>

              <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                 <h3 className="text-lg font-bold text-gray-200 mb-4 flex items-center gap-2">
                   <Zap className="text-purple-400 w-5 h-5"/> Throughput
                 </h3>
                 <div className="h-[250px]">
                   <ResponsiveContainer width="100%" height="100%">
                     <LineChart data={progressHistory}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false}/>
                        <XAxis dataKey="time" stroke="#9ca3af" tick={{fontSize: 10}} 
                          label={{ value: 'sec', position: 'insideBottomRight', offset: -5, fill: '#9ca3af' }}/>
                        <YAxis stroke="#9ca3af" tick={{fontSize: 10}} 
                          label={{ value: 'req/s', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}/>
                        <Tooltip contentStyle={{backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px'}} 
                          labelFormatter={(value) => `${value}s`}/>
                        <Legend />
                        <Line type="monotone" dataKey="rps" name="Throughput (req/s)"
                          stroke="#a855f7" strokeWidth={2}
                          dot={{ fill: '#a855f7', strokeWidth: 2, r: 3 }}
                          activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
                          isAnimationActive={true}/>
                     </LineChart>
                   </ResponsiveContainer>
                 </div>
              </div>

              <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                 <h3 className="text-lg font-bold text-gray-200 mb-4 flex items-center gap-2">
                   <AlertTriangle className="text-red-400 w-5 h-5"/> Error Rate
                 </h3>
                 <div className="h-[250px]">
                   <ResponsiveContainer width="100%" height="100%">
                     <LineChart data={progressHistory}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false}/>
                        <XAxis dataKey="time" stroke="#9ca3af" tick={{fontSize: 10}} 
                          label={{ value: 'sec', position: 'insideBottomRight', offset: -5, fill: '#9ca3af' }}/>
                        <YAxis stroke="#9ca3af" tick={{fontSize: 10}} domain={[0, 100]} 
                          label={{ value: '%', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}/>
                        <Tooltip contentStyle={{backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px'}} 
                          labelFormatter={(value) => `${value}s`}/>
                        <Legend />
                        <Line type="monotone" dataKey="errorRate" name="Error Rate (%)"
                          stroke="#ef4444" strokeWidth={2}
                          dot={{ fill: '#ef4444', strokeWidth: 2, r: 3 }}
                          activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
                          isAnimationActive={true}/>
                     </LineChart>
                   </ResponsiveContainer>
                 </div>
              </div>
            </div>
          )}

          {/* Generate Report Button */}
          <button
            onClick={handleGenerateReport}
            className="w-full py-4 text-lg font-bold rounded-xl shadow-lg bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            <FileText /> Generate Report
          </button>
        </div>
      )}

    </div>
  );
}