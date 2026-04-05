'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Profile() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [fullName, setFullName] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/auth/login'); return }
      setUser(session.user)
      setFullName(session.user.user_metadata?.full_name || '')
      setLoading(false)
    })
  }, [])

  async function saveProfile() {
    if (!user) return
    setSaving(true)
    await supabase.auth.updateUser({ data: { full_name: fullName } })
    setMessage('Profil güncellendi ✓')
    setSaving(false)
    setTimeout(() => setMessage(''), 3000)
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0a0b0e] flex items-center justify-center">
      <p className="text-[#8892aa] font-mono animate-pulse">Yükleniyor…</p>
    </div>
  )

  if (!user) return null

  return (
    <div className="min-h-screen bg-[#0a0b0e] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => router.push('/dashboard')}
            className="w-9 h-9 border border-[#252b3a] text-[#8892aa] rounded-lg flex items-center justify-center hover:border-[#00e5a0] hover:text-[#00e5a0] transition-all">
            ←
          </button>
          <h1 className="text-xl font-black">Profil</h1>
        </div>

        <div className="bg-[#111318] border border-[#1e2330] rounded-2xl p-8">
          <div className="flex items-center gap-4 mb-8 pb-8 border-b border-[#1e2330]">
            <div className="w-16 h-16 rounded-2xl bg-[#00e5a0] flex items-center justify-center text-2xl font-black text-black">
              {(fullName || user.email || '?')[0].toUpperCase()}
            </div>
            <div>
              <div className="font-bold text-lg">{fullName || 'İsimsiz'}</div>
              <div className="font-mono text-xs text-[#8892aa]">{user.email}</div>
              <div className="font-mono text-[10px] text-[#3e4a5e] mt-1">
                Üyelik: {new Date(user.created_at).toLocaleDateString('tr-TR')}
              </div>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block font-mono text-[10px] text-[#3e4a5e] uppercase tracking-widest mb-2">Ad Soyad</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)}
                className="w-full bg-[#0a0b0e] border border-[#252b3a] text-white rounded-xl px-4 py-3 outline-none focus:border-[#00e5a0] transition-all"
                placeholder="Adınız Soyadınız" />
            </div>
            <div>
              <label className="block font-mono text-[10px] text-[#3e4a5e] uppercase tracking-widest mb-2">Email</label>
              <input value={user.email} readOnly
                className="w-full bg-[#0a0b0e] border border-[#252b3a] text-[#8892aa] rounded-xl px-4 py-3 cursor-not-allowed" />
            </div>
          </div>

          {message && <p className="text-[#00e5a0] font-mono text-sm mb-4">{message}</p>}

          <button onClick={saveProfile} disabled={saving}
            className="w-full py-3 bg-[#00e5a0] text-black font-bold rounded-xl hover:bg-[#00b37a] transition-all disabled:opacity-50 mb-3">
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>

          <button onClick={signOut}
            className="w-full py-3 border border-[#252b3a] text-[#ff4d6d] font-bold rounded-xl hover:bg-[rgba(255,77,109,0.08)] transition-all">
            Çıkış Yap
          </button>
        </div>
      </div>
    </div>
  )
}