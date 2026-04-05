'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
  e.preventDefault()
  setLoading(true)
  setError('')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) { 
    setError(error.message)
    setLoading(false) 
  } else {
    router.refresh()
    router.push('/dashboard')
  }
}

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    })
  }

  return (
    <main className="min-h-screen bg-[#0a0b0e] flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-[#00e5a0] rounded-xl flex items-center justify-center text-2xl mx-auto mb-4">📈</div>
          <h1 className="text-2xl font-black text-white">Trade<span className="text-[#00e5a0]">Log</span></h1>
          <p className="text-[#8892aa] text-sm mt-2 font-mono">Hesabınıza giriş yapın</p>
        </div>
        <div className="bg-[#111318] border border-[#1e2330] rounded-2xl p-8">
          <button onClick={handleGoogle}
            className="w-full py-3 border border-[#252b3a] text-[#8892aa] rounded-xl font-semibold hover:border-[#00e5a0] hover:text-white transition-all flex items-center justify-center gap-3 mb-6">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google ile Giriş Yap
          </button>
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-[#1e2330]"></div>
            <span className="text-[#3e4a5e] text-xs font-mono">veya</span>
            <div className="flex-1 h-px bg-[#1e2330]"></div>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs text-[#3e4a5e] uppercase tracking-widest font-mono mb-2">Email</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                className="w-full bg-[#0a0b0e] border border-[#252b3a] text-white rounded-xl px-4 py-3 outline-none focus:border-[#00e5a0] transition-all"
                placeholder="ornek@email.com" required />
            </div>
            <div>
              <label className="block text-xs text-[#3e4a5e] uppercase tracking-widest font-mono mb-2">Şifre</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
                className="w-full bg-[#0a0b0e] border border-[#252b3a] text-white rounded-xl px-4 py-3 outline-none focus:border-[#00e5a0] transition-all"
                placeholder="••••••••" required />
            </div>
            {error && <p className="text-[#ff4d6d] text-sm font-mono">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-[#00e5a0] text-black font-bold rounded-xl hover:bg-[#00b37a] transition-all disabled:opacity-50">
              {loading ? 'Giriş yapılıyor…' : 'Giriş Yap'}
            </button>
          </form>
          <p className="text-center text-[#8892aa] text-sm mt-6 font-mono">
            Hesabınız yok mu?{' '}
            <Link href="/auth/register" className="text-[#00e5a0] hover:underline">Kayıt ol</Link>
          </p>
        </div>
      </div>
    </main>
  )
}