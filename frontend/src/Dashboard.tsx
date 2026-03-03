import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Activity, Clock, AlertTriangle } from 'lucide-react';

// กำหนด Type ของข้อมูลที่จะใช้ในกราฟ
interface ChartData {
  name: string;
  response: number;
  error: number;
}

interface TestHistoryItem {
    id: number;
    avg_response_time: number;
    error_rate: number;
}

export default function Dashboard({ onNavigateToLoadTest }: { onNavigateToLoadTest: () => void }) {
  const [data, setData] = useState<ChartData[]>([]);
  const [username] = useState(localStorage.getItem("username") || "User");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;
        const res = await axios.get('http://localhost:3002/api/test/history', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        // แปลงข้อมูลสำหรับกราฟ (กลับด้านเพื่อให้เรียงจาก อดีต -> ปัจจุบัน)
        const formattedData = res.data.reverse().map((item: TestHistoryItem) => ({
            name: `#${item.id}`, // ใช้ ID เป็นชื่อแกน X
            response: item.avg_response_time,
            error: item.error_rate
        }));
        
        setData(formattedData);
      } catch (err) {
        console.error("Error fetching data:", err);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="p-6 space-y-8 animate-fade-in-up pb-20">
      {/* ส่วนหัว Header */}
      <div className="flex justify-between items-end border-b border-gray-700 pb-6">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Dashboard Overview</h1>
          <p className="text-gray-400">ยินดีต้อนรับ, <span className="text-purple-400">{username}</span></p>
        </div>
        <button 
          onClick={onNavigateToLoadTest}
          className="px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-lg transition-transform transform hover:scale-105 flex items-center gap-2"
        >
          <Activity size={18} />
          เริ่มทดสอบใหม่ (New Test)
        </button>
      </div>

      {/* Grid แสดงกราฟ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* กราฟที่ 1: Response Time (Area Chart) */}
        <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-xl hover:border-gray-600 transition-colors">
          <div className="flex items-center mb-6">
            <div className="p-2 bg-blue-500/20 rounded-lg mr-3">
              <Clock className="w-6 h-6 text-blue-400"/>
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-200">Response Time Trend</h3>
              <p className="text-xs text-gray-500">ความเร็วในการตอบสนอง (ms)</p>
            </div>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorResponse" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="name" stroke="#9ca3af" tick={{fontSize: 12}} />
                <YAxis stroke="#9ca3af" tick={{fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff', borderRadius: '8px' }}
                  itemStyle={{ color: '#60a5fa' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="response" 
                  stroke="#3b82f6" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorResponse)" 
                  name="Response Time (ms)" 
                  animationDuration={1500}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* กราฟที่ 2: Error Rate (Bar Chart) */}
        <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-xl hover:border-gray-600 transition-colors">
          <div className="flex items-center mb-6">
            <div className="p-2 bg-red-500/20 rounded-lg mr-3">
              <AlertTriangle className="w-6 h-6 text-red-400"/>
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-200">Error Rate (%)</h3>
              <p className="text-xs text-gray-500">อัตราข้อผิดพลาดที่พบ</p>
            </div>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="name" stroke="#9ca3af" tick={{fontSize: 12}} />
                <YAxis stroke="#9ca3af" tick={{fontSize: 12}} />
                <Tooltip 
                  cursor={{fill: '#374151', opacity: 0.4}}
                  contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff', borderRadius: '8px' }}
                />
                <Bar 
                  dataKey="error" 
                  fill="#ef4444" 
                  radius={[4, 4, 0, 0]} 
                  name="Error (%)" 
                  barSize={40}
                  animationDuration={1500}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
