import { useEffect, useState } from 'react';
import axios from 'axios';
import { UserCircle, Activity, BarChart2, TrendingUp, Layers, FileText, History as HistoryIcon, LogOut } from 'lucide-react';
import History from './History';
import Login from './Login';
import Register from './Register';
import LoadTest from './LoadTest';
import StressTest from './StressTest';
import ScalabilityTest from './ScalabilityTest';
import TestReport from './TestReport';
import Dashboard from './Dashboard';

function App() {
  // State สำหรับ Authentication
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [username, setUsername] = useState<string>(localStorage.getItem("username") || "Guest");
  const [currentView, setCurrentView] = useState<'login' | 'register'>('login');
  const [verifying, setVerifying] = useState(() => !!localStorage.getItem("token")); // true เฉพาะเมื่อมี token ให้ verify

  // State สำหรับ Dashboard Navigation — อ่านจาก localStorage เพื่อให้ refresh แล้วอยู่หน้าเดิม
  const [activeTab, setActiveTab] = useState<'dashboard' | 'load' | 'stress' | 'scalability' | 'report' | 'history'>(() => {
    const saved = localStorage.getItem('activeTab');
    return (saved as 'dashboard' | 'load' | 'stress' | 'scalability' | 'report' | 'history') || 'dashboard';
  });
  
  // State สำหรับ Status Bar
  const [message, setMessage] = useState<string>("Connecting...");
  const [dbStatus, setDbStatus] = useState<string>("Checking DB...");

  // บันทึก activeTab ลง localStorage ทุกครั้งที่เปลี่ยน
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  const handleLoginSuccess = (newToken: string, newUsername: string) => {
    localStorage.setItem("token", newToken);
    localStorage.setItem("username", newUsername);
    setToken(newToken);
    setUsername(newUsername);
    setVerifying(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("activeTab");
    setToken(null);
    setUsername("");
    setCurrentView('login');
    setActiveTab('dashboard');
  };

  // Verify token กับ backend เมื่อเริ่มโปรแกรม
  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (!storedToken) {
      return;
    }

    axios.get('http://localhost:3002/api/auth/verify', {
      headers: { Authorization: `Bearer ${storedToken}` }
    })
      .then(res => {
        if (res.data.valid) {
          setToken(storedToken);
          setUsername(res.data.username || localStorage.getItem("username") || "Guest");
          setVerifying(false);

          // ตรวจสอบสถานะ server + DB
          axios.get('http://localhost:3002/api/health')
            .then(r => setMessage(r.data.status || "Online"))
            .catch(() => setMessage("Offline"));
          axios.get('http://localhost:3002/api/health/db')
            .then(r => setDbStatus(r.data.database || "Connected"))
            .catch(() => setDbStatus("Disconnected"));
        } else {
          handleLogout();
          setVerifying(false);
        }
      })
      .catch(() => {
        handleLogout();
        setVerifying(false);
      });
  }, []);

  // Listen for custom navigate events (from LoadTest/StressTest/ScalabilityTest)
  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setActiveTab(customEvent.detail as typeof activeTab);
      }
    };
    window.addEventListener('navigate', handleNavigate);
    return () => window.removeEventListener('navigate', handleNavigate);
  }, []);

  // แสดง loading ระหว่างตรวจสอบ token
  if (verifying) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400 text-sm">Verifying session...</p>
        </div>
      </div>
    );
  }

  // --- Logic สลับหน้า Login/Register ---
  if (!token) {
    if (currentView === 'register') {
      return <Register onSwitchToLogin={() => setCurrentView('login')} />;
    }
    return <Login onLoginSuccess={handleLoginSuccess} onSwitchToRegister={() => setCurrentView('register')} />;
  }

  // --- Dashboard View ---
  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden font-sans">
      
      {/* Sidebar */}
      <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col shadow-2xl z-20">
        <div className="h-20 flex items-center px-6 border-b border-gray-700 bg-gray-800/50">
          <UserCircle className="w-10 h-10 text-purple-400 mr-3" />
          <div>
            <p className="font-bold text-lg leading-tight truncate w-32">{username}</p>
            <p className="text-xs text-green-400">● Online</p>
          </div>
        </div>

        <nav className="flex-1 flex flex-col pt-4 space-y-1">
          {/* เมนู Dashboard (หน้าแรก) */}
          <div onClick={() => setActiveTab('dashboard')}>
             <MenuItem icon={<Activity size={20} />} text="Dashboard" isActive={activeTab === 'dashboard'} />
          </div>
          
          {/* เมนู Load Test (กดแล้วเปลี่ยนหน้า) */}
          <div onClick={() => setActiveTab('load')}>
             <MenuItem icon={<BarChart2 size={20} />} text="Load Test" isActive={activeTab === 'load'} />
          </div>

          <div onClick={() => setActiveTab('stress')}>
            <MenuItem icon={<TrendingUp size={20} />} text="Stress Test" isActive={activeTab === 'stress'} />
          </div>
          <div onClick={() => setActiveTab('scalability')}>
            <MenuItem icon={<Layers size={20} />} text="Scalability Test" isActive={activeTab === 'scalability'} />
          </div>
          <div onClick={() => setActiveTab('history')}>
            <MenuItem icon={<HistoryIcon size={20} />} text="ประวัติการทดสอบ" isActive={activeTab === 'history'} />
          </div>
          <div onClick={() => setActiveTab('report')}>
            <MenuItem icon={<FileText size={20} />} text="Test Report" isActive={activeTab === 'report'} />
          </div>
        </nav>

        <div 
          onClick={handleLogout}
          className="h-16 flex items-center px-6 border-t border-gray-700 hover:bg-red-900/20 cursor-pointer transition-colors text-gray-400 hover:text-red-400"
        >
          <LogOut className="w-6 h-6 mr-3" />
          <span className="font-medium">Sign Out</span>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative">
        <header className="h-16 bg-gradient-to-r from-violet-800 via-purple-700 to-fuchsia-700 flex items-center justify-end px-6 shadow-lg z-10 border-b border-purple-900/50">
          <div className="w-10 h-10 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center shadow-inner border border-white/20">
            <span className="text-white font-bold text-xs">Logo</span>
          </div>
        </header>

        {/* พื้นที่แสดงเนื้อหา เปลี่ยนตาม activeTab */}
        <main className="flex-1 flex flex-col p-8 bg-gray-900 relative overflow-y-auto">
            
            {/* 1. หน้า Dashboard (หน้าแรก) */}
            {activeTab === 'dashboard' && (
              <Dashboard onNavigateToLoadTest={() => setActiveTab('load')} />
            )}

            {/* 2. หน้า Load Test */}
            {activeTab === 'load' && <LoadTest />}

            {/* 3. หน้า Stress Test */}
            {activeTab === 'stress' && <StressTest />}

            {/* 4. หน้า Scalability Test */}
            {activeTab === 'scalability' && <ScalabilityTest />}

            {activeTab === 'history' && <History />}

            {/* 6. หน้า Test Report */}
            {activeTab === 'report' && <TestReport />}

            {/* Status Bar ด้านล่างขวา */}
            <div className="fixed bottom-4 right-8 text-xs text-gray-500 flex space-x-3 bg-gray-800/80 backdrop-blur px-3 py-1 rounded-full border border-gray-700 shadow-lg z-50">
               <span className={`flex items-center ${message === 'Online' ? 'text-green-400' : 'text-red-400'}`}>
                 Server: {message}
               </span>
               <span className="text-gray-600">|</span>
               <span className={`flex items-center ${dbStatus === 'Connected' ? 'text-green-400' : 'text-red-400'}`}>
                 DB: {dbStatus}
               </span>
            </div>
        </main>

        <footer className="h-4 bg-gradient-to-r from-violet-800 via-purple-700 to-fuchsia-700 shadow-inner"></footer>
      </div>
    </div>
  );
}

// Helper Component สำหรับเมนู (ปรับปรุงให้รองรับ Active State)
function MenuItem({ icon, text, isActive }: { icon: React.ReactNode, text: string, isActive?: boolean }) {
  return (
    <div className={`cursor-pointer flex items-center px-6 py-4 transition-all border-l-4 group select-none
      ${isActive 
        ? 'bg-gray-800 border-l-purple-500 text-purple-400 shadow-inner' 
        : 'border-l-transparent text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
      }
    `}>
      <span className={`mr-3 transition-transform duration-200 ${isActive ? 'scale-110 text-purple-400' : 'group-hover:scale-110'}`}>
        {icon}
      </span>
      <span className="font-medium">{text}</span>
    </div>
  );
}

export default App;