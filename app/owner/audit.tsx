'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AuditLogs() {
  const [voids, setVoids] = useState<any[]>([])

  useEffect(() => {
    const fetchVoids = async () => {
      const { data } = await supabase
        .from('sales')
        .select('*')
        .eq('is_voided', true)
        .order('created_at', { ascending: false })
      setVoids(data || [])
    }
    fetchVoids()
  }, [])

  return (
    <div className="p-8 bg-black min-h-screen text-white">
      <nav className="mb-8">
        <a href="/owner" className="text-blue-500 hover:underline">← Back to Dashboard</a>
      </nav>

      <h1 className="text-3xl font-black mb-2 text-red-500">CORRUPTION AUDIT</h1>
      <p className="text-zinc-500 mb-8">All deleted or voided transactions are recorded here.</p>

      <div className="bg-zinc-900 rounded-2xl border border-red-900/50 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-zinc-800 text-zinc-400 text-sm uppercase">
            <tr>
              <th className="p-4">Time</th>
              <th className="p-4">Staff</th>
              <th className="p-4">Item</th>
              <th className="p-4">Amount</th>
              <th className="p-4">Void Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {voids.length === 0 && (
              <tr><td colSpan={5} className="p-10 text-center text-zinc-600">No suspicious activity detected.</td></tr>
            )}
            {voids.map((log) => (
              <tr key={log.id} className="hover:bg-red-900/10 transition">
                <td className="p-4 text-xs font-mono">{new Date(log.created_at).toLocaleString()}</td>
                <td className="p-4 font-bold">{log.staff_name}</td>
                <td className="p-4">{log.item_name}</td>
                <td className="p-4 text-red-400">-${log.amount}</td>
                <td className="p-4 italic text-zinc-400 text-sm">"{log.void_reason}"</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}