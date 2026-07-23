'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

export default function Home() {
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        window.location.href = '/dashboard'
      } else {
        setChecking(false)
      }
    })
  }, [])

  if (checking) return (
    <div className="min-h-screen bg-[#0a0b0e] flex items-center justify-center">
      <p className="text-[#8892aa] font-mono text-sm animate-pulse">Yükleniyor…</p>
    </div>
  )

  return (
    <main className="min-h-screen bg-[#0a0b0e] flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full text-center">
        <div className="w-16 h-16 bg-[#00e5a0] rounded-2xl flex items-center justify-center text-3xl mx-auto mb-8">
          📈
        </div>
        <h1 className="text-5xl font-black text-white mb-4 tracking-tight">
          Trade<span className="text-[#00e5a0]">Log</span>
        </h1>
        <p className="text-[#8892aa] text-lg mb-12 font-mono">
          Kişisel trade günlüğünüz. Hisselerinizi takip edin, yorumlarınızı kaydedin.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/auth/register"
            className="px-8 py-4 bg-[#00e5a0] text-black font-bold rounded-xl hover:bg-[#00b37a] transition-all">
            Ücretsiz Başla
          </Link>
          <Link href="/auth/login"
            className="px-8 py-4 border border-[#252b3a] text-[#8892aa] font-bold rounded-xl hover:border-[#00e5a0] hover:text-[#00e5a0] transition-all">
            Giriş Yap
          </Link>
        </div>
      </div>
    </main>
  )
}