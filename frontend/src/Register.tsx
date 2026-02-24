import React, { useState } from 'react';
import axios from 'axios';
import { UserPlus, User, Mail, Lock, ArrowLeft } from 'lucide-react';

interface RegisterProps {
  onSwitchToLogin: () => void;
}

export default function Register({ onSwitchToLogin }: RegisterProps) {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (formData.password !== formData.confirmPassword) {
      setError("รหัสผ่านไม่ตรงกัน");
      return;
    }

    setLoading(true);
    try {
      await axios.post('http://localhost:3002/api/auth/register', {
        username: formData.username,
        email: formData.email,
        password: formData.password
      });
      setSuccess(true);
      setTimeout(() => {
        onSwitchToLogin(); // สมัครเสร็จเด้งไปหน้า Login อัตโนมัติ
      }, 2000);
    } catch (err: unknown) {
      // แสดง Error จาก Backend (เช่น Username ซ้ำ)
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.detail || "เกิดข้อผิดพลาดในการสมัครสมาชิก");
      } else {
        setError("เกิดข้อผิดพลาดในการสมัครสมาชิก");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 font-sans p-4">
      <div className="w-full max-w-md p-8 bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 animate-fade-in-up relative overflow-hidden">
        
        {/* Background Gradient Decoration */}
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600"></div>

        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto bg-gray-700 rounded-full flex items-center justify-center mb-4 shadow-inner">
            <UserPlus className="w-8 h-8 text-purple-400" />
          </div>
          <h2 className="text-3xl font-bold text-white">Create Account</h2>
          <p className="text-gray-400 mt-2">Join our Performance Testing Platform</p>
        </div>

        {success ? (
          <div className="bg-green-500/10 border border-green-500 text-green-400 p-4 rounded-lg text-center animate-pulse">
            สมัครสมาชิกสำเร็จ! กำลังนำคุณไปหน้าเข้าสู่ระบบ...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-500/10 border border-red-500 text-red-400 text-sm p-3 rounded-lg text-center">
                {error}
              </div>
            )}

            <div className="space-y-4">
             <InputWithIcon icon={<User />} type="text" placeholder="Username" value={formData.username} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, username: e.target.value})} />
             <InputWithIcon icon={<Mail />} type="email" placeholder="Email Address" value={formData.email} onChange={(e: React.ChangeEvent<HTMLInputElement>)  => setFormData({...formData, email: e.target.value})} />
             <InputWithIcon icon={<Lock />} type="password" placeholder="Password" value={formData.password} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, password: e.target.value})} />
             <InputWithIcon icon={<Lock />} type="password" placeholder="Confirm Password" value={formData.confirmPassword} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, confirmPassword: e.target.value})} />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white font-bold rounded-lg shadow-lg transform transition hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creating Account..." : "Sign Up"}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <button onClick={onSwitchToLogin} className="text-gray-400 hover:text-white text-sm flex items-center justify-center mx-auto transition-colors">
            <ArrowLeft size={16} className="mr-1" /> Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper Component for Inputs
const InputWithIcon = ({ icon, ...props }: { icon: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div className="relative group">
    <div className="absolute left-3 top-3.5 text-gray-500 group-focus-within:text-purple-400 transition-colors">
      {icon}
    </div>
    <input
      required
      className="w-full pl-10 pr-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-white placeholder-gray-500 transition-all"
      {...props}
    />
  </div>
);