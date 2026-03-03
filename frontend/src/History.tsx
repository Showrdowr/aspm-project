import { useEffect, useState } from 'react';
import axios from 'axios';
import { Clock, CheckCircle, AlertTriangle, Trash2 } from 'lucide-react';

interface TestResult {
  id: number;
  test_type: string;
  target_url: string;
  status: string;
  avg_response_time: number;
  error_rate: number;
  created_at: string;
}

export default function History() {
  const [history, setHistory] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const res = await axios.get('http://localhost:3002/api/test/history', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setHistory(res.data);
    } catch (err) {
      console.error("Failed to fetch history", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleDeleteMode = () => {
    if (deleteMode && selectedIds.size > 0) {
      // กดปุ่มถังขยะอีกครั้ง เมื่อมี items ที่เลือกอยู่ → แสดงยืนยัน
      setShowConfirm(true);
    } else {
      setDeleteMode(!deleteMode);
      setSelectedIds(new Set());
    }
  };

  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === history.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(history.map(h => h.id)));
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const token = localStorage.getItem("token");
      await axios.delete('http://localhost:3002/api/test/history/delete', {
        headers: { Authorization: `Bearer ${token}` },
        data: { ids: Array.from(selectedIds) }
      });
      // Refresh data
      await fetchHistory();
      setSelectedIds(new Set());
      setDeleteMode(false);
      setShowConfirm(false);
    } catch (err) {
      console.error("Failed to delete", err);
      alert("ลบข้อมูลไม่สำเร็จ");
    } finally {
      setDeleting(false);
    }
  };

  const cancelDelete = () => {
    setShowConfirm(false);
  };

  const exitDeleteMode = () => {
    setDeleteMode(false);
    setSelectedIds(new Set());
  };

  if (loading) return <div className="text-white text-center mt-10">Loading history...</div>;

  return (
    <div className="w-full max-w-6xl mx-auto animate-fade-in-up p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">ประวัติการทดสอบ (Test History)</h2>
        <div className="flex items-center gap-3">
          {deleteMode && (
            <>
              <button
                onClick={toggleSelectAll}
                className="px-4 py-2 rounded-full text-sm font-medium text-blue-400 hover:text-blue-300 border border-blue-500 hover:bg-blue-500/10 transition-all"
              >
                {selectedIds.size === history.length && history.length > 0 ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
              </button>
              <button onClick={exitDeleteMode} className="text-sm text-gray-400 hover:text-gray-300 underline">
                ยกเลิก
              </button>
            </>
          )}
          <button
            onClick={toggleDeleteMode}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
              deleteMode
                ? selectedIds.size > 0
                  ? 'bg-red-500/20 text-red-400 border-red-500 hover:bg-red-500/30'
                  : 'bg-red-500/10 text-red-400 border-red-500'
                : 'text-red-400 border-red-500 hover:bg-red-500/10'
            }`}
          >
            <Trash2 size={16} className="text-red-400" />
            {deleteMode && selectedIds.size > 0 ? `ลบ (${selectedIds.size})` : ''}
          </button>

          <button onClick={fetchHistory} className="px-4 py-2 rounded-full text-sm font-medium text-purple-400 hover:text-purple-300 border border-gray-600 hover:border-purple-400 transition-all">
            Refresh Data
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-red-500/20">
                <Trash2 size={24} className="text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-white">ยืนยันการลบ</h3>
            </div>
            <p className="text-gray-300 mb-6">
              ต้องการลบข้อมูลที่เลือก <span className="text-red-400 font-bold">{selectedIds.size} รายการ</span> หรือไม่?
              <br />
              <span className="text-gray-500 text-sm">การดำเนินการนี้ไม่สามารถย้อนกลับได้</span>
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                {deleting ? 'กำลังลบ...' : 'ยืนยันลบ'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-800 rounded-xl shadow-xl border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-700/50 text-gray-400 text-sm uppercase tracking-wider">
                {deleteMode && (
                  <th className="p-4 font-medium w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === history.length && history.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-500 text-purple-500 focus:ring-purple-500 cursor-pointer"
                    />
                  </th>
                )}
                <th className="p-4 font-medium">ID</th>
                <th className="p-4 font-medium">Target URL</th>
                <th className="p-4 font-medium">Type</th>
                <th className="p-4 font-medium text-center">Status</th>
                <th className="p-4 font-medium text-right">Avg Response</th>
                <th className="p-4 font-medium text-right">Error Rate</th>
                <th className="p-4 font-medium text-right">Tested At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={deleteMode ? 8 : 7} className="p-8 text-center text-gray-500">
                    ยังไม่มีประวัติการทดสอบ
                  </td>
                </tr>
              ) : (
                history.map((item) => (
                  <tr
                    key={item.id}
                    className={`hover:bg-gray-700/30 transition-colors text-gray-300 ${
                      selectedIds.has(item.id) ? 'bg-red-500/5' : ''
                    }`}
                  >
                    {deleteMode && (
                      <td className="p-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="w-4 h-4 rounded border-gray-500 text-purple-500 focus:ring-purple-500 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="p-4 text-sm font-mono text-gray-500">#{item.id}</td>
                    <td className="p-4 font-medium text-white">{item.target_url}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        item.test_type === 'load' 
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          : item.test_type === 'stress'
                          ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                          : item.test_type === 'scalability'
                          ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                          : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}>
                        {item.test_type.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      {item.status?.includes('Failed') ? (
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                          <AlertTriangle size={12} className="mr-1" /> {item.status}
                        </span>
                      ) : item.status?.includes('Errors') ? (
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                          <AlertTriangle size={12} className="mr-1" /> {item.status}
                        </span>
                      ) : item.status === 'Pending' ? (
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20">
                          <Clock size={12} className="mr-1" /> {item.status}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/20">
                          <CheckCircle size={12} className="mr-1" /> {item.status}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right font-mono">
                      <div className="flex items-center justify-end text-yellow-400">
                        <Clock size={14} className="mr-1 opacity-50" />
                        {item.avg_response_time} ms
                      </div>
                    </td>
                    <td className="p-4 text-right font-mono">
                      <div className={`flex items-center justify-end ${item.error_rate > 0 ? 'text-red-400' : 'text-gray-400'}`}>
                        <AlertTriangle size={14} className="mr-1 opacity-50" />
                        {item.error_rate}%
                      </div>
                    </td>
                    <td className="p-4 text-right text-sm text-gray-400">
                      {item.created_at ? new Date(item.created_at).toLocaleString('th-TH', {
                        year: 'numeric', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                      }) : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}