import React, { useState, useRef } from 'react';
import { 
  Flame, Globe, Users, Clock, Play, CheckCircle, 
  Activity, AlertTriangle, TrendingUp, FileText
} from 'lucide-react';
import {
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import type { TestResult } from './types';


export default function StressTest() {
  const [formData, setFormData] = useState({
    target_url: '',
    max_users: 0,
    ramp_up_duration: 0,
    hold_duration: 0,
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
    time: number;
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

  // คำนวณ total duration จาก stages
  const getTotalDuration = () => {
    const rampUp = formData.ramp_up_duration;
    const hold = formData.hold_duration;
    return rampUp * 4 + hold + 15; // 4 ramp stages + hold + k6 overhead buffer
  };

  // Generate Report — เปิดหน้า Report พร้อมส่งข้อมูลผลลัพธ์
  const handleGenerateReport = () => {
    if (!currentResult) return;
    
    const reportData = {
      test_type: currentResult.test_type || 'stress',
      target_url: currentResult.target_url || formData.target_url,
      virtual_users: currentResult.virtual_users || formData.max_users,
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
    if (formData.max_users <= 0 || formData.ramp_up_duration <= 0 || formData.hold_duration <= 0) {
      alert("กรุณากรอกค่าทุกช่องให้มากกว่า 0");
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
      virtual_users: String(formData.max_users),
      duration: String(totalDuration),
      test_type: "stress",
      max_users: String(formData.max_users),
      ramp_up_duration: String(formData.ramp_up_duration),
      hold_duration: String(formData.hold_duration),
      token: token || ""
    });
    
    const eventSource = new EventSource(`http://localhost:3002/api/test/stream?${params}`);
    
    eventSource.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'progress') {
        setProgress(data);
        setProgressHistory(prev => [...prev, {
          time: data.elapsed,
          users: data.current_users,
          responseTime: data.current_response_time,
          p95: data.p95_response_time,
          errorRate: data.current_error_rate,
        }]);
      }
      
      if (data.type === 'complete') {
        eventSource.close();
        setLoading(false);
        setCurrentResult({
          id: Date.now(),
          test_type: 'stress',
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
          virtual_users: data.virtual_users || formData.max_users,
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

  // สร้าง stage preview data
  const getStagePreview = () => {
    const maxUsers = formData.max_users;
    const rampUp = formData.ramp_up_duration;
    const hold = formData.hold_duration;
    
    const step1 = Math.round(maxUsers * 0.2);
    const step2 = Math.round(maxUsers * 0.5);
    
    return [
      { stage: 'Ramp Up 1', users: step1, duration: `${rampUp}s` },
      { stage: 'Ramp Up 2', users: step2, duration: `${rampUp}s` },
      { stage: 'Ramp Up 3', users: maxUsers, duration: `${rampUp}s` },
      { stage: 'Hold Peak', users: maxUsers, duration: `${hold}s` },
      { stage: 'Ramp Down', users: 0, duration: `${rampUp}s` },
    ];
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-6 pb-20 animate-fade-in-up">
      
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <Flame className="text-orange-400 fill-current" /> Stress Testing Console
        </h1>
        <p className="text-gray-400">ทดสอบระบบภายใต้ภาระหนัก — เพิ่ม users แบบขั้นบันไดจนถึงจุดสูงสุด</p>
      </div>

      {/* --- INPUT FORM --- */}
      <div className="bg-gray-800 rounded-2xl shadow-xl border border-gray-700 p-8 mb-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* URL Input */}
            <div className="col-span-1 md:col-span-2 space-y-2">
              <label className="text-sm font-medium text-gray-300 flex items-center">
                <Globe className="w-4 h-4 mr-2 text-blue-400" /> Target URL
              </label>
              <input
                type="url"
                required
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all"
                value={formData.target_url}
                onChange={e => setFormData({...formData, target_url: e.target.value})}
              />
            </div>

            {/* Max Users */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300 flex items-center">
                <Users className="w-4 h-4 mr-2 text-orange-400" /> Max Users (จุดสูงสุด)
              </label>
              <input
                type="number"
                min="5"
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none"
                value={formData.max_users || ''}
                onChange={e => setFormData({...formData, max_users: Number(e.target.value)})}
              />
            </div>

            {/* Ramp Up Duration */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300 flex items-center">
                <TrendingUp className="w-4 h-4 mr-2 text-yellow-400" /> Ramp-up Duration (วินาทีต่อขั้น)
              </label>
              <input
                type="number"
                min="5"
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                value={formData.ramp_up_duration || ''}
                onChange={e => setFormData({...formData, ramp_up_duration: Number(e.target.value)})}
              />
            </div>

            {/* Hold Duration */}
            <div className="col-span-1 md:col-span-2 space-y-2">
              <label className="text-sm font-medium text-gray-300 flex items-center">
                <Clock className="w-4 h-4 mr-2 text-green-400" /> Hold Peak Duration (วินาที)
              </label>
              <input
                type="number"
                min="5"
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-green-500 outline-none"
                value={formData.hold_duration || ''}
                onChange={e => setFormData({...formData, hold_duration: Number(e.target.value)})}
              />
            </div>
          </div>

          {/* Stage Preview */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-600">
            <h4 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-orange-400" /> Stress Stages Preview
            </h4>
            <div className="flex items-end gap-1 h-20">
              {getStagePreview().map((stage, i) => (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <span className="text-[10px] text-gray-500 mb-1">{stage.users} users</span>
                  <div 
                    className="w-full rounded-t transition-all bg-gradient-to-t from-orange-600 to-orange-400"
                    style={{ height: `${Math.max(4, (stage.users / formData.max_users) * 60)}px` }}
                  />
                  <span className="text-[9px] text-gray-600 mt-1">{stage.duration}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              Total: ~{getTotalDuration()} วินาที ({Math.round(getTotalDuration() / 60)} นาที)
            </p>
          </div>

          {/* Start Button */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-4 text-lg font-bold rounded-xl shadow-lg transform transition-all flex items-center justify-center gap-3
              ${loading 
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                : 'bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white hover:scale-[1.01] active:scale-95'
              }`}
          >
            {loading ? (
              <>
                <div className="w-6 h-6 border-4 border-gray-400 border-t-orange-500 rounded-full animate-spin"></div>
                <span>Stress Testing in progress...</span>
              </>
            ) : (
              <>
                <Play className="fill-current" /> Start Stress Test
              </>
            )}
          </button>
        </form>
      </div>

      {/* --- PROGRESS SECTION --- */}
      {loading && (
        <div className="bg-gray-800 rounded-2xl shadow-xl border border-gray-700 p-8 mb-8 animate-fade-in-up">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Activity className="text-orange-400 animate-pulse" />
            Stress Testing in Progress...
          </h3>
          
          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>{progress.elapsed}s / {progress.total}s</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>

          {/* Real-time Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-900 rounded-xl p-4 text-center">
              <p className="text-gray-400 text-xs mb-1">Active Users</p>
              <p className="text-2xl font-bold text-orange-400">{progress.current_users}</p>
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
              <p className="text-gray-400 text-xs mb-1">Elapsed</p>
              <p className="text-2xl font-bold text-gray-300">{progress.elapsed}s</p>
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

          {/* Real-time Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {/* Response Time over Time */}
            <div className="bg-gray-900 p-4 rounded-xl border border-gray-700">
              <h4 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
                <Activity className="text-blue-400 w-4 h-4" /> Response Time vs Users
              </h4>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={progressHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false}/>
                    <XAxis dataKey="time" stroke="#9ca3af" tick={{fontSize: 10}} label={{ value: 'Seconds', position: 'insideBottomRight', offset: -5, fill: '#9ca3af' }}/>
                    <YAxis yAxisId="left" stroke="#3b82f6" tick={{fontSize: 10}} label={{ value: 'ms', angle: -90, position: 'insideLeft', fill: '#3b82f6' }}/>
                    <YAxis yAxisId="right" orientation="right" stroke="#f97316" tick={{fontSize: 10}} label={{ value: 'users', angle: 90, position: 'insideRight', fill: '#f97316' }}/>
                    <Tooltip contentStyle={{backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px'}} labelFormatter={(v) => `${v}s`}/>
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="responseTime" name="Avg (ms)" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false}/>
                    <Line yAxisId="left" type="monotone" dataKey="p95" name="p95 (ms)" stroke="#fb923c" strokeWidth={2} dot={false} strokeDasharray="5 3" isAnimationActive={false}/>
                    <Line yAxisId="right" type="monotone" dataKey="users" name="Active Users" stroke="#f97316" strokeWidth={2} dot={false} strokeDasharray="5 5" isAnimationActive={false}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Error Rate over Time */}
            <div className="bg-gray-900 p-4 rounded-xl border border-gray-700">
              <h4 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
                <AlertTriangle className="text-red-400 w-4 h-4" /> Error Rate
              </h4>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={progressHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false}/>
                    <XAxis dataKey="time" stroke="#9ca3af" tick={{fontSize: 10}} label={{ value: 'Seconds', position: 'insideBottomRight', offset: -5, fill: '#9ca3af' }}/>
                    <YAxis stroke="#ef4444" tick={{fontSize: 10}} domain={[0, 100]} label={{ value: '%', angle: -90, position: 'insideLeft', fill: '#ef4444' }}/>
                    <Tooltip contentStyle={{backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px'}} labelFormatter={(v) => `${v}s`}/>
                    <Legend />
                    <Line type="monotone" dataKey="errorRate" name="Error Rate (%)" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
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
                <h2 className="text-2xl font-bold text-red-500">Stress Test Failed</h2>
              </>
            ) : currentResult.error_rate > 0 ? (
              <>
                <AlertTriangle className="text-yellow-500 w-8 h-8" />
                <h2 className="text-2xl font-bold text-yellow-500">Completed with Errors</h2>
              </>
            ) : (
              <>
                <CheckCircle className="text-green-500 w-8 h-8" />
                <h2 className="text-2xl font-bold text-green-500">Stress Test Passed!</h2>
              </>
            )}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
            <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 text-center shadow-lg">
              <p className="text-gray-400 text-sm mb-2">Max Users Tested</p>
              <p className="text-4xl font-bold text-orange-400">{currentResult.virtual_users || formData.max_users}</p>
            </div>
            <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 text-center shadow-lg">
              <p className="text-gray-400 text-sm mb-2">Avg Response Time</p>
              <p className="text-4xl font-bold text-blue-400">{currentResult.avg_response_time} <span className="text-lg">ms</span></p>
            </div>
            <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 text-center shadow-lg">
              <p className="text-gray-400 text-sm mb-2">Median (p50)</p>
              <p className="text-4xl font-bold text-sky-400">{currentResult.median_response_time || 0} <span className="text-lg">ms</span></p>
            </div>
            <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 text-center shadow-lg">
              <p className="text-gray-400 text-sm mb-2">P95 Response</p>
              <p className="text-4xl font-bold text-indigo-400">{currentResult.p95_response_time || 0} <span className="text-lg">ms</span></p>
            </div>
            <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 text-center shadow-lg">
              <p className="text-gray-400 text-sm mb-2">P99 Response</p>
              <p className="text-4xl font-bold text-purple-400">{currentResult.p99_response_time || 0} <span className="text-lg">ms</span></p>
            </div>
            <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 text-center shadow-lg">
              <p className="text-gray-400 text-sm mb-2">Throughput</p>
              <p className="text-4xl font-bold text-green-400">{currentResult.throughput || 0} <span className="text-lg">req/s</span></p>
            </div>
            <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 text-center shadow-lg">
              <p className="text-gray-400 text-sm mb-2">Error Rate</p>
              <p className={`text-4xl font-bold ${currentResult.error_rate > 0 ? 'text-red-500' : 'text-green-400'}`}>
                {currentResult.error_rate}%
              </p>
            </div>
          </div>

          {/* Final Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-900 p-6 rounded-2xl border border-gray-700">
              <h3 className="text-lg font-bold text-gray-200 mb-4 flex items-center gap-2">
                <Activity className="text-blue-400 w-5 h-5"/> Response Time
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={progressHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false}/>
                    <XAxis dataKey="time" stroke="#9ca3af" tick={{fontSize: 10}} label={{ value: 'Seconds', position: 'insideBottomRight', offset: -5, fill: '#9ca3af' }}/>
                    <YAxis yAxisId="left" stroke="#3b82f6" tick={{fontSize: 10}} label={{ value: 'ms', angle: -90, position: 'insideLeft', fill: '#3b82f6' }}/>
                    <YAxis yAxisId="right" orientation="right" stroke="#f97316" tick={{fontSize: 10}} label={{ value: 'users', angle: 90, position: 'insideRight', fill: '#f97316' }}/>
                    <Tooltip contentStyle={{backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px'}} labelFormatter={(v) => `${v}s`}/>
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="responseTime" name="Response Time (ms)" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', strokeWidth: 2, r: 3 }} isAnimationActive={true}/>
                    <Line yAxisId="right" type="monotone" dataKey="users" name="Users" stroke="#f97316" strokeWidth={2} dot={false} strokeDasharray="5 5" isAnimationActive={true}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-gray-900 p-6 rounded-2xl border border-gray-700">
              <h3 className="text-lg font-bold text-gray-200 mb-4 flex items-center gap-2">
                <AlertTriangle className="text-red-400 w-5 h-5"/> Error Rate
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={progressHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false}/>
                    <XAxis dataKey="time" stroke="#9ca3af" tick={{fontSize: 10}} label={{ value: 'Seconds', position: 'insideBottomRight', offset: -5, fill: '#9ca3af' }}/>
                    <YAxis stroke="#ef4444" tick={{fontSize: 10}} domain={[0, 100]} label={{ value: '%', angle: -90, position: 'insideLeft', fill: '#ef4444' }}/>
                    <Tooltip contentStyle={{backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px'}} labelFormatter={(v) => `${v}s`}/>
                    <Legend />
                    <Line type="monotone" dataKey="errorRate" name="Error Rate (%)" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', strokeWidth: 2, r: 3 }} isAnimationActive={true}/>
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
