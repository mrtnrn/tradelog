'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'

interface Entry {
  id: number
  date: string
  ticker: string
  comment: string
  status: string
  direction: string
  cs: string
  lot: number | null
  buy_price: number | null
  sell_price: number | null
  time: string
  prices: any
}

function currencySymbol(cur: string) {
  if (cur === 'TRY') return '₺'
  if (cur === 'USD') return '$'
  if (cur === 'EUR') return '€'
  return cur
}

const SL: Record<string, string> = {
  'watch': 'TAKİP', 'buy-long': 'LONG ALIM', 'buy-short': 'SHORT KAPAT',
  'sell-long': 'LONG SATIŞ', 'sell-short': 'SHORT AÇIŞ'
}

export default function StockPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const ticker = decodeURIComponent(params.ticker as string).toUpperCase()

  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPrice, setCurrentPrice] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/auth/login'); return }

      const { data } = await supabase
        .from('trade_entries')
        .select('*')
        .ilike('ticker', ticker.trim())
        .eq('user_id', session.user.id)
        .order('date', { ascending: false })
        .order('id', { ascending: false })

      setEntries(data || [])
      setLoading(false)

      // Güncel fiyat çek
      try {
        const res = await fetch(`/api/price?ticker=${encodeURIComponent(ticker)}`)
        if (res.ok) {
          const pd = await res.json()
          if (pd.current) setCurrentPrice(pd)
        }
      } catch {}
    })
  }, [ticker])

  const statCounts = {
    watch: entries.filter(e => e.cs === 'watch').length,
    buy: entries.filter(e => e.cs === 'buy-long' || e.cs === 'buy-short').length,
    sell: entries.filter(e => e.cs === 'sell-long' || e.cs === 'sell-short').length,
  }

  const borderColor = (cs: string) => {
    if (cs === 'watch') return '#ffd166'
    if (cs === 'buy-long') return '#00e5a0'
    if (cs === 'sell-long') return '#ff4d6d'
    return '#60a5fa'
  }

  const badgeStyle = (cs: string) => {
    if (cs === 'watch') return 'bg-[rgba(255,209,102,0.1)] text-[#ffd166]'
    if (cs === 'buy-long') return 'bg-[rgba(0,229,160,0.08)] text-[#00e5a0]'
    if (cs === 'sell-long') return 'bg-[rgba(255,77,109,0.1)] text-[#ff4d6d]'
    return 'bg-[rgba(96,165,250,0.1)] text-[#60a5fa]'
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0a0b0e] flex items-center justify-center">
      <p className="text-[#8892aa] font-mono animate-pulse">Yükleniyor…</p>
    </div>
  )

  const sym = currencySymbol(currentPrice?.currency || 'USD')

  return (
    <div className="min-h-screen bg-[#0a0b0e] text-white" style={{ fontFamily: "'Syne', sans-serif" }}>
      {/* Grid bg */}
      <div className="fixed inset-0 pointer-events-none z-0" style={{
        backgroundImage: 'linear-gradient(rgba(0,229,160,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,160,0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px'
      }} />

      <div className="relative z-10 max-w-3xl mx-auto px-6 pb-20">
        {/* Header */}
        <div className="flex items-center gap-3 pt-8 mb-8">
          <button onClick={() => router.back()}
            className="w-9 h-9 border border-[#252b3a] text-[#8892aa] rounded-lg flex items-center justify-center hover:border-[#00e5a0] hover:text-[#00e5a0] transition-all">
            ←
          </button>
          <div className="flex-1">
            <h1 className="font-mono text-3xl font-medium tracking-widest">{ticker}</h1>
            <p className="text-[#8892aa] text-sm mt-1">{entries.length} kayıt</p>
          </div>
          {currentPrice && (
            <div className="text-right">
              <div className="font-mono text-2xl font-medium">
                {sym}{currentPrice.current.toFixed(2)}
              </div>
              {currentPrice.change != null && (
                <div className={`font-mono text-sm ${currentPrice.change >= 0 ? 'text-[#00e5a0]' : 'text-[#ff4d6d]'}`}>
                  {currentPrice.change >= 0 ? '+' : ''}{currentPrice.change.toFixed(2)}%
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { label: 'Takip', value: statCounts.watch, color: 'text-[#ffd166]' },
            { label: 'Alım', value: statCounts.buy, color: 'text-[#00e5a0]' },
            { label: 'Satış', value: statCounts.sell, color: 'text-[#ff4d6d]' },
          ].map(s => (
            <div key={s.label} className="bg-[#111318] border border-[#1e2330] rounded-xl p-4">
              <div className="font-mono text-[10px] text-[#3e4a5e] uppercase tracking-widest mb-2">{s.label}</div>
              <div className={`font-mono text-3xl font-medium ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Entries */}
        {entries.length === 0 ? (
          <div className="text-center py-16 text-[#3e4a5e]">
            <div className="text-4xl mb-3 opacity-40">📋</div>
            <p className="font-mono text-sm">Bu hisse için kayıt bulunamadı.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map(e => {
              const cur = e.prices?.currency || (ticker.endsWith('.IS') ? 'TRY' : 'USD')
              const esym = currencySymbol(cur)
              return (
                <div key={e.id}
                  className="bg-[#111318] border border-[#1e2330] rounded-xl p-5 transition-all hover:border-[#252b3a]"
                  style={{ borderLeft: `3px solid ${borderColor(e.cs)}` }}>

                  {/* Top row */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-[#8892aa]">{e.date}</span>
                      {e.time && <span className="font-mono text-xs text-[#3e4a5e]">{e.time}</span>}
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-1 rounded-full ${badgeStyle(e.cs)}`}>
                      {SL[e.cs] || e.cs}
                    </span>
                  </div>

                  {/* Lot chip */}
                  {e.lot && (
                    <div className="inline-flex items-center gap-1 font-mono text-[10px] text-[#3e4a5e] bg-[#181b22] px-2 py-1 rounded-full mb-3">
                      📦 {e.lot} lot
                      {e.buy_price ? ` · ${esym}${e.buy_price}` : ''}
                      {e.sell_price ? ` · ${esym}${e.sell_price}` : ''}
                    </div>
                  )}

                  {/* Comment */}
                  <p className="text-sm text-[#8892aa] leading-relaxed whitespace-pre-line">
                    {e.comment}
                  </p>

                  {/* Prices */}
                  {e.prices && (
                    <div className="flex gap-4 mt-3 pt-3 border-t border-[#1e2330] flex-wrap">
                      {e.prices.current && (
                        <div>
                          <div className="font-mono text-[9px] text-[#3e4a5e] uppercase tracking-wider mb-1">Kapanış</div>
                          <div className="font-mono text-sm">{esym}{e.prices.current.toFixed(2)}</div>
                        </div>
                      )}
                      {e.buy_price && e.prices.current && (
                        <div>
                          <div className="font-mono text-[9px] text-[#3e4a5e] uppercase tracking-wider mb-1">K/Z</div>
                          {(() => {
                            const pnl = e.sell_price
                              ? (e.sell_price - e.buy_price) * (e.lot || 1)
                              : (e.prices.current - e.buy_price) * (e.lot || 1)
                            const isPos = pnl >= 0
                            return (
                              <div className={`font-mono text-sm font-medium ${isPos ? 'text-[#00e5a0]' : 'text-[#ff4d6d]'}`}>
                                {isPos ? '+' : ''}{esym}{Math.abs(pnl).toFixed(2)}
                              </div>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}