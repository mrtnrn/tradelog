'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Admin() {
  const supabase = createClient()
  const router = useRouter()
  const [users, setUsers] = useState<any[]>([])
  const [stats, setStats] = useState({ total: 0, entries: 0 })
  const [loading, setLoading] = useState(true)
  const [unauthorized, setUnauthorized] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }

      // Admin kontrolü
      const { data: profile } = await supabase
        .from('profiles').select('is_admin').eq('id', user.id).single()

      if (!profile?.is_admin) { setUnauthorized(true); setLoading(false); return }

      // Kullanıcıları getir
      const { data: profiles } = await supabase
        .from('profiles').select('*').order('created_at', { ascending: false })

      // İstatistikler
      const { count: entryCount } = await supabase
        .from('trade_entries').select('*', { count: 'exact', head: true })

      setUsers(profiles || [])
      setStats({ total: profiles?.length || 0, entries: entryCount || 0 })
      setLoading(false)
    })
  }, [])

  if (loading) return (
    <div className="min-h-screen bg-[#0a0b0e] flex items-center justify-center">
      <p className="text-[#8892aa] font-mono animate-pulse">Yükleniyor…</p>
    </div>
  )

  if (unauthorized) return (
    <div className="min-h-screen bg-[#0a0b0e] flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4">🚫</div>
        <p className="text-[#ff4d6d] font-mono mb-4">Bu sayfaya erişim yetkiniz yok.</p>
        <button onClick={() => router.push('/dashboard')}
          className="px-6 py-2 bg-[#00e5a0] text-black font-bold rounded-lg">
          Dashboard'a Dön
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0a0b0e] text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => router.push('/dashboard')}
            className="w-9 h-9 border border-[#252b3a] text-[#8892aa] rounded-lg flex items-center justify-center hover:border-[#00e5a0] hover:text-[#00e5a0] transition-all">
            ←
          </button>
          <h1 className="text-xl font-black">Admin Paneli</h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Toplam Kullanıcı', value: stats.total, color: 'text-[#00e5a0]' },
            { label: 'Toplam Kayıt', value: stats.entries, color: 'text-[#ffd166]' },
            { label: 'Aktif Bugün', value: '—', color: 'text-white' },
          ].map(s => (
            <div key={s.label} className="bg-[#111318] border border-[#1e2330] rounded-xl p-5">
              <div className="font-mono text-[10px] text-[#3e4a5e] uppercase tracking-widest mb-2">{s.label}</div>
              <div className={`font-mono text-3xl font-medium ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Users Table */}
        <div className="bg-[#111318] border border-[#1e2330] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#1e2330]">
            <h2 className="font-bold">Kullanıcılar</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="font-mono text-[9px] text-[#3e4a5e] uppercase tracking-widest border-b border-[#1e2330]">
                  {['Ad Soyad', 'Email', 'Kayıt Tarihi', 'Admin', 'İşlem'].map(h => (
                    <th key={h} className="text-left py-3 px-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-[#1e2330] hover:bg-[#181b22] transition-all">
                    <td className="py-3 px-4 font-medium">{u.full_name || '—'}</td>
                    <td className="py-3 px-4 font-mono text-xs text-[#8892aa]">{u.email}</td>
                    <td className="py-3 px-4 font-mono text-xs text-[#8892aa]">
                      {new Date(u.created_at).toLocaleDateString('tr-TR')}
                    </td>
                    <td className="py-3 px-4">
                      {u.is_admin
                        ? <span className="bg-[rgba(0,229,160,0.08)] text-[#00e5a0] text-[9px] font-bold px-2 py-0.5 rounded-full">ADMIN</span>
                        : <span className="text-[#3e4a5e] text-xs font-mono">—</span>}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={async () => {
                          await supabase.from('profiles').update({ is_admin: !u.is_admin }).eq('id', u.id)
                          setUsers(prev => prev.map(p => p.id === u.id ? { ...p, is_admin: !p.is_admin } : p))
                        }}
                        className="font-mono text-[10px] px-3 py-1 border border-[#252b3a] text-[#8892aa] rounded-lg hover:border-[#00e5a0] hover:text-[#00e5a0] transition-all">
                        {u.is_admin ? 'Admin Kaldır' : 'Admin Yap'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}