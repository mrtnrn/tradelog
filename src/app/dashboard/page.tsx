'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

// ── TYPES ──────────────────────────────────────────────
type Status = 'watch' | 'buy' | 'sell'
type Direction = 'long' | 'short'
type CS = 'watch' | 'buy-long' | 'buy-short' | 'sell-long' | 'sell-short'

interface Entry {
  id: number
  ticker: string
  comment: string
  status: Status
  direction: Direction
  cs: CS
  lot: number | null
  buyPrice: number | null
  sellPrice: number | null
  time: string
  prices: PriceData | null
  date?: string
}

interface PriceData {
  current: number
  close: number | null
  prevClose: number | null
  currency: string
  change: number | null
  resolvedSymbol: string
}

interface AllEntries { [date: string]: Entry[] }

// ── CONSTANTS ───────────────────────────────────────────
const SL: Record<CS, string> = {
  'watch': 'TAKİP', 'buy-long': 'LONG ALIM', 'buy-short': 'SHORT KAPAT',
  'sell-long': 'LONG SATIŞ', 'sell-short': 'SHORT AÇIŞ'
}
const BC: Record<CS, string> = {
  'watch': 'badge-watch', 'buy-long': 'badge-buy-long', 'buy-short': 'badge-buy-short',
  'sell-long': 'badge-sell-long', 'sell-short': 'badge-sell-short'
}

const FINNHUB_KEY = 'd6tga41r01qhkb443g1gd6tga41r01qhkb443g20'
const CACHE_TTL = 10 * 60 * 1000
const priceCache: Record<string, { ts: number; data: PriceData }> = {}

function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDateTR(d: Date): string {
  const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

function weekdayTR(d: Date): string {
  return ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'][d.getDay()]
}

function currencySymbol(cur: string): string {
  if (cur === 'TRY') return '₺'
  if (cur === 'USD') return '$'
  if (cur === 'EUR') return '€'
  return cur
}

function compositeStatus(status: Status, dir: Direction): CS {
  if (status === 'watch') return 'watch'
  return `${status}-${dir}` as CS
}

async function fetchFinnhub(ticker: string): Promise<PriceData | null> {
  if (!FINNHUB_KEY) return null
  try {
    const sym = ticker.endsWith('.IS') ? 'BORSA:' + ticker.replace('.IS', '') : ticker
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 3500)
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_KEY}`, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const q = await res.json()
    if (!q.c || q.c === 0) return null
    const currency = sym.startsWith('BORSA:') ? 'TRY' : 'USD'
    return {
      current: q.c, close: q.pc, prevClose: q.pc, currency,
      change: q.pc ? (q.c - q.pc) / q.pc * 100 : null,
      resolvedSymbol: ticker
    }
  } catch { return null }
}

async function fetchPrice(ticker: string): Promise<PriceData | null> {
  if (priceCache[ticker] && Date.now() - priceCache[ticker].ts < CACHE_TTL) return priceCache[ticker].data
  const pd = await fetchFinnhub(ticker)
  if (pd) priceCache[ticker] = { ts: Date.now(), data: pd }
  return pd
}

// ── MAIN COMPONENT ──────────────────────────────────────
export default function Dashboard() {
  const supabase = createClient()
  const router = useRouter()

  const [user, setUser] = useState<any>(null)
  const [allEntries, setAllEntries] = useState<AllEntries>({})
  const [deletedItems, setDeletedItems] = useState<Entry[]>([])
  const [currentDate, setCurrentDate] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d })
  const [activeTab, setActiveTab] = useState<'daily'|'tickers'|'portfolio'|'history'>('daily')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  // Form state
  const [ticker, setTicker] = useState('')
  const [comment, setComment] = useState('')
  const [status, setStatus] = useState<Status>('watch')
  const [direction, setDirection] = useState<Direction>('long')
  const [lot, setLot] = useState('')
  const [buyPrice, setBuyPrice] = useState('')
  const [sellPrice, setSellPrice] = useState('')
  const [livePriceBadge, setLivePriceBadge] = useState('')
  const [autoBuyPrice, setAutoBuyPrice] = useState<number|null>(null)

  // Ticker view
  const [activeTicker, setActiveTicker] = useState<string|null>(null)
  const [tickerSearch, setTickerSearch] = useState('')

  // Portfolio currency
  const [pfCurrency, setPfCurrency] = useState<'TRY'|'USD'>('TRY')
  const [usdTryRate, setUsdTryRate] = useState<number|null>(null)

  // Date picker
  const [dpOpen, setDpOpen] = useState(false)
  const [dpYear, setDpYear] = useState(new Date().getFullYear())
  const [dpMonth, setDpMonth] = useState(new Date().getMonth())
  const [dpSelected, setDpSelected] = useState(new Date())

  // ── AUTH & LOAD ──────────────────────────────────────
  useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) { router.push('/auth/login'); return }
    setUser(session.user)
    loadData(session.user.id)
    fetchUSDTRY()
  })
}, [])

  async function fetchUSDTRY() {
    try {
      const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=USDTRY&token=${FINNHUB_KEY}`)
      const q = await res.json()
      if (q.c) setUsdTryRate(q.c)
    } catch {}
  }

  async function loadData(userId: string) {
    setLoading(true)
    const { data: rows } = await supabase
      .from('trade_entries')
      .select('*')
      .eq('user_id', userId)
      .order('id', { ascending: true })

    const data: AllEntries = {}
    for (const row of rows || []) {
      if (!data[row.date]) data[row.date] = []
      data[row.date].push({
        id: row.id, ticker: row.ticker, comment: row.comment,
        status: row.status, direction: row.direction || 'long',
        cs: row.cs || (row.status === 'watch' ? 'watch' : `${row.status}-${row.direction || 'long'}`) as CS,
        lot: row.lot, buyPrice: row.buy_price, sellPrice: row.sell_price,
        time: row.time, prices: row.prices
      })
    }
    setAllEntries(data)
    setLoading(false)

    // Bugünkü fiyatları yükle
    const today = dateKey(new Date())
    const todayEntries = data[today] || []
    if (todayEntries.length > 0) {
      const tickers = [...new Set(todayEntries.map(e => e.ticker))]
      const results = await Promise.all(tickers.map(t => fetchPrice(t)))
      const updated = { ...data }
      for (let i = 0; i < tickers.length; i++) {
        const pd = results[i]
        if (pd && updated[today]) {
          updated[today] = updated[today].map(e =>
            e.ticker === tickers[i] ? { ...e, prices: pd } : e
          )
        }
      }
      setAllEntries(updated)
    }
  }

  // ── CURRENT DATE ENTRIES ─────────────────────────────
  const key = dateKey(currentDate)
  const entries = allEntries[key] || []

  // ── ADD ENTRY ─────────────────────────────────────────
  async function addEntry() {
    if (!ticker.trim()) return
    if (!comment.trim()) return
    if (!user) return

    const cs = compositeStatus(status, direction)
    const entry: Entry = {
      id: Date.now(),
      ticker: ticker.toUpperCase(),
      comment,
      status, direction, cs,
      lot: lot ? parseFloat(lot) : null,
      buyPrice: buyPrice ? parseFloat(buyPrice) : null,
      sellPrice: sellPrice ? parseFloat(sellPrice) : null,
      time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      prices: null
    }

    const updated = { ...allEntries }
    if (!updated[key]) updated[key] = []
    updated[key] = [...updated[key], entry]
    setAllEntries(updated)

    // Reset form
    setTicker(''); setComment(''); setLot(''); setBuyPrice(''); setSellPrice('')
    setLivePriceBadge(''); setAutoBuyPrice(null)

    // Supabase
    setSyncing(true)
    await supabase.from('trade_entries').insert({
      id: entry.id, date: key, ticker: entry.ticker, comment: entry.comment,
      status: entry.status, direction: entry.direction, cs: entry.cs,
      lot: entry.lot, buy_price: entry.buyPrice, sell_price: entry.sellPrice,
      time: entry.time, prices: null, user_id: user.id
    })
    setSyncing(false)

    // Fiyat çek
    const pd = await fetchPrice(entry.ticker)
    if (pd) {
      const updated2 = { ...allEntries }
      if (!updated2[key]) updated2[key] = []
      updated2[key] = updated2[key].map(e => e.id === entry.id ? { ...e, prices: pd } : e)
      setAllEntries(updated2)
      await supabase.from('trade_entries').update({ prices: pd }).eq('id', entry.id)
    }
  }

  // ── DELETE ENTRY ──────────────────────────────────────
  async function deleteEntry(id: number, date?: string) {
    const d = date || key
    const entry = (allEntries[d] || []).find(e => e.id === id)
    if (!entry) return
    const updated = { ...allEntries }
    updated[d] = updated[d].filter(e => e.id !== id)
    setAllEntries(updated)
    const deleted = { ...entry, deletedAt: new Date().toISOString(), sourceDate: d }
    setDeletedItems(prev => [deleted as any, ...prev])

    await supabase.from('trade_entries').delete().eq('id', id)
    await supabase.from('deleted_entries').insert({
      id: entry.id, date: d, ticker: entry.ticker, comment: entry.comment,
      status: entry.status, direction: entry.direction, cs: entry.cs,
      lot: entry.lot, buy_price: entry.buyPrice, sell_price: entry.sellPrice,
      time: entry.time, prices: entry.prices, source_date: d,
      deleted_at: new Date().toISOString(), user_id: user.id
    })
  }

  // ── RESTORE ENTRY ─────────────────────────────────────
  async function restoreEntry(id: number) {
    const item = deletedItems.find(e => e.id === id) as any
    if (!item) return
    const date = item.sourceDate || key
    const entry = { ...item }
    delete entry.deletedAt; delete entry.sourceDate
    const updated = { ...allEntries }
    if (!updated[date]) updated[date] = []
    updated[date] = [...updated[date], entry].sort((a, b) => a.id - b.id)
    setAllEntries(updated)
    setDeletedItems(prev => prev.filter(e => e.id !== id))

    await supabase.from('deleted_entries').delete().eq('id', id)
    await supabase.from('trade_entries').insert({
      id: entry.id, date, ticker: entry.ticker, comment: entry.comment,
      status: entry.status, direction: entry.direction, cs: entry.cs,
      lot: entry.lot, buy_price: entry.buyPrice, sell_price: entry.sellPrice,
      time: entry.time, prices: entry.prices, user_id: user.id
    })
  }

  // ── TICKER BLUR ───────────────────────────────────────
  async function onTickerBlur() {
    if (!ticker.trim()) return
    setLivePriceBadge('yükleniyor…')
    const pd = await fetchPrice(ticker.toUpperCase())
    if (pd) {
      const sym = currencySymbol(pd.currency)
      setLivePriceBadge(`${sym}${pd.current.toFixed(2)}`)
    } else setLivePriceBadge('')

    // Satış + long ise portföyden ort. maliyet al
    if (status === 'sell' && direction === 'long') {
      const pos = getPosition(ticker.toUpperCase())
      if (pos && pos.longLots > 0 && pos.avgBuy > 0) {
        setAutoBuyPrice(pos.avgBuy)
        setBuyPrice(pos.avgBuy.toFixed(4))
        if (!lot) setLot(String(pos.longLots))
      }
    }
  }

  // ── PORTFOLIO POSITION ────────────────────────────────
  function getPosition(t: string) {
    const allFlat: (Entry & { date: string })[] = []
    for (const [date, ents] of Object.entries(allEntries)) {
      for (const e of ents) allFlat.push({ ...e, date })
    }
    allFlat.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    let longLots = 0, avgBuy = 0, shortLots = 0, avgShort = 0
    for (const e of allFlat) {
      if (e.ticker !== t) continue
      const cs = e.cs
      if (cs === 'buy-long' && e.lot && e.buyPrice) {
        const total = longLots * avgBuy + e.lot * e.buyPrice
        longLots += e.lot; avgBuy = total / longLots
      } else if (cs === 'sell-long' && e.lot) {
        longLots = Math.max(0, longLots - e.lot)
        if (longLots === 0) avgBuy = 0
      } else if (cs === 'sell-short' && e.lot && e.sellPrice) {
        const total = shortLots * avgShort + e.lot * e.sellPrice
        shortLots += e.lot; avgShort = total / shortLots
      } else if (cs === 'buy-short' && e.lot) {
        shortLots = Math.max(0, shortLots - e.lot)
        if (shortLots === 0) avgShort = 0
      }
    }
    return { longLots, avgBuy, shortLots, avgShort }
  }

  // ── SIGN OUT ──────────────────────────────────────────
  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  // ── RENDER ────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#0a0b0e] flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4">📈</div>
        <p className="text-[#8892aa] font-mono text-sm animate-pulse">Veriler yükleniyor…</p>
      </div>
    </div>
  )

  const tabs = [
    { id: 'daily', label: '📅 Günlük' },
    { id: 'tickers', label: '🔖 Hisse Takip' },
    { id: 'portfolio', label: '💼 Portföy' },
    { id: 'history', label: '🗂 Geçmiş' },
  ] as const

  return (
    <div className="min-h-screen bg-[#0a0b0e] text-white" style={{fontFamily:"'Syne', sans-serif"}}>
      {/* Grid background */}
      <div className="fixed inset-0 pointer-events-none z-0" style={{
        backgroundImage: 'linear-gradient(rgba(0,229,160,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,160,0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px'
      }}/>

      <div className="relative z-10 max-w-[1150px] mx-auto px-6 pb-20">
        {/* HEADER */}
        <header className="flex items-center justify-between py-7 mb-8 border-b border-[#1e2330]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#00e5a0] rounded-lg flex items-center justify-center text-lg">📈</div>
            <span className="text-xl font-black">Trade<span className="text-[#00e5a0]">Log</span></span>
          </div>
          <div className="flex items-center gap-4">
            {syncing && <span className="text-[#00e5a0] text-xs font-mono animate-pulse">⟳ kaydediliyor…</span>}
            <span className="text-[#8892aa] text-xs font-mono hidden sm:block">{user?.email}</span>
            <button onClick={() => router.push('/profile')}
              className="px-3 py-2 border border-[#252b3a] text-[#8892aa] rounded-lg text-xs font-mono hover:border-[#00e5a0] hover:text-[#00e5a0] transition-all">
              Profil
            </button>
            <button onClick={signOut}
              className="px-3 py-2 border border-[#252b3a] text-[#8892aa] rounded-lg text-xs font-mono hover:border-[#ff4d6d] hover:text-[#ff4d6d] transition-all">
              Çıkış
            </button>
          </div>
        </header>

        {/* TABS */}
        <div className="flex gap-1 bg-[#111318] border border-[#1e2330] rounded-xl p-1 mb-7">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === t.id
                  ? 'bg-[#181b22] text-white shadow-lg'
                  : 'text-[#8892aa] hover:text-white'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── DAILY TAB ── */}
        {activeTab === 'daily' && (
          <div>
            {/* Date Nav */}
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate()-1); setCurrentDate(d) }}
                className="w-10 h-10 border border-[#252b3a] bg-[#111318] text-[#8892aa] rounded-lg flex items-center justify-center hover:border-[#00e5a0] hover:text-[#00e5a0] transition-all">
                ←
              </button>
              <div className="flex-1">
                <span className="text-2xl font-bold">{formatDateTR(currentDate)}</span>
                <span className="text-[#8892aa] font-mono text-sm ml-3">{weekdayTR(currentDate)}</span>
              </div>
              <button onClick={() => setDpOpen(true)}
                className="px-4 py-2 border border-[#252b3a] bg-[#111318] text-[#8892aa] rounded-lg font-mono text-xs hover:border-[#00e5a0] hover:text-[#00e5a0] transition-all">
                📅 Tarih Seç
              </button>
              <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate()+1); setCurrentDate(d) }}
                className="w-10 h-10 border border-[#252b3a] bg-[#111318] text-[#8892aa] rounded-lg flex items-center justify-center hover:border-[#00e5a0] hover:text-[#00e5a0] transition-all">
                →
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { label: 'Takipte', value: entries.filter(e=>e.status==='watch').length, color: 'text-[#ffd166]' },
                { label: 'Alınan', value: entries.filter(e=>e.status==='buy').length, color: 'text-[#00e5a0]' },
                { label: 'Satılan', value: entries.filter(e=>e.status==='sell').length, color: 'text-[#ff4d6d]' },
              ].map(s => (
                <div key={s.label} className="bg-[#111318] border border-[#1e2330] rounded-xl p-5">
                  <div className="font-mono text-[10px] text-[#3e4a5e] uppercase tracking-widest mb-2">{s.label}</div>
                  <div className={`font-mono text-5xl font-medium ${s.color}`}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Add Form */}
            <div className="bg-[#111318] border border-[#1e2330] rounded-xl p-6 mb-7 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#00e5a0] to-transparent"/>
              <div className="font-mono text-[11px] text-[#00e5a0] uppercase tracking-[2px] mb-5">Yeni Kayıt</div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block font-mono text-[10px] text-[#3e4a5e] uppercase tracking-widest mb-2">Hisse Kodu</label>
                  <div className="relative">
                    <input value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase())}
                      onBlur={onTickerBlur}
                      className="w-full bg-[#0a0b0e] border border-[#252b3a] text-white rounded-lg px-4 py-2.5 font-mono tracking-widest text-sm outline-none focus:border-[#00e5a0] pr-28 transition-all"
                      placeholder="THYAO, AAPL…" />
                    {livePriceBadge && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-[#00e5a0]">
                        {livePriceBadge}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block font-mono text-[10px] text-[#3e4a5e] uppercase tracking-widest mb-2">Durum</label>
                  <div className="flex gap-2">
                    {(['watch','buy','sell'] as Status[]).map(s => (
                      <button key={s} onClick={() => {
                        setStatus(s)
                        if (s === 'watch') { setBuyPrice(''); setSellPrice(''); setAutoBuyPrice(null) }
                        if (s === 'buy') { setSellPrice(''); setAutoBuyPrice(null) }
                      }}
                        className={`flex-1 py-2.5 rounded-lg text-xs font-semibold border transition-all ${
                          status === s
                            ? s === 'watch' ? 'bg-[rgba(255,209,102,0.1)] border-[#ffd166] text-[#ffd166]'
                              : s === 'buy' ? 'bg-[rgba(0,229,160,0.08)] border-[#00e5a0] text-[#00e5a0]'
                              : 'bg-[rgba(255,77,109,0.1)] border-[#ff4d6d] text-[#ff4d6d]'
                            : 'border-[#252b3a] text-[#8892aa]'
                        }`}>
                        {s === 'watch' ? '👁 Takip' : s === 'buy' ? '✅ Alındı' : '💸 Satıldı'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Direction */}
              {status !== 'watch' && (
                <div className="mb-4">
                  <label className="block font-mono text-[10px] text-[#3e4a5e] uppercase tracking-widest mb-2">Yön</label>
                  <div className="flex gap-2 w-48">
                    {(['long','short'] as Direction[]).map(d => (
                      <button key={d} onClick={() => setDirection(d)}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                          direction === d
                            ? d === 'long' ? 'bg-[rgba(0,229,160,0.08)] border-[#00e5a0] text-[#00e5a0]'
                              : 'bg-[rgba(96,165,250,0.1)] border-[#60a5fa] text-[#60a5fa]'
                            : 'border-[#252b3a] text-[#8892aa]'
                        }`}>
                        {d === 'long' ? '↑ Long' : '↓ Short'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Trade Fields */}
              {status !== 'watch' && (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div>
                    <label className="block font-mono text-[10px] text-[#3e4a5e] uppercase tracking-widest mb-2">Lot</label>
                    <input type="number" value={lot} onChange={e=>setLot(e.target.value)}
                      className="w-full bg-[#0a0b0e] border border-[#252b3a] text-white rounded-lg px-3 py-2.5 font-mono text-sm outline-none focus:border-[#00e5a0] transition-all"
                      placeholder="100" />
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] text-[#3e4a5e] uppercase tracking-widest mb-2">
                      {autoBuyPrice ? 'Ort. Maliyet (Otomatik)' : 'Alış Fiyatı'}
                    </label>
                    <input type="number" value={buyPrice} onChange={e=>setBuyPrice(e.target.value)}
                      readOnly={!!autoBuyPrice && status === 'sell'}
                      className={`w-full bg-[#0a0b0e] border border-[#252b3a] rounded-lg px-3 py-2.5 font-mono text-sm outline-none focus:border-[#00e5a0] transition-all ${autoBuyPrice && status==='sell' ? 'text-[#8892aa]' : 'text-white'}`}
                      placeholder="0.00" />
                  </div>
                  {status === 'sell' && (
                    <div>
                      <label className="block font-mono text-[10px] text-[#3e4a5e] uppercase tracking-widest mb-2">Satış Fiyatı</label>
                      <input type="number" value={sellPrice} onChange={e=>setSellPrice(e.target.value)}
                        className="w-full bg-[#0a0b0e] border border-[#252b3a] text-white rounded-lg px-3 py-2.5 font-mono text-sm outline-none focus:border-[#00e5a0] transition-all"
                        placeholder="0.00" />
                    </div>
                  )}
                </div>
              )}

              <div className="mb-4">
                <label className="block font-mono text-[10px] text-[#3e4a5e] uppercase tracking-widest mb-2">Yorum & Analiz</label>
                <textarea value={comment} onChange={e=>setComment(e.target.value)}
                  className="w-full bg-[#0a0b0e] border border-[#252b3a] text-white rounded-lg px-4 py-3 font-sans text-sm outline-none focus:border-[#00e5a0] resize-y min-h-20 transition-all"
                  placeholder="Bu hisse neden ilgi çekici?…" />
              </div>
              <button onClick={addEntry}
                className="w-full py-3 bg-[#00e5a0] text-black font-bold rounded-lg hover:bg-[#00b37a] transition-all">
                + Kayıt Ekle
              </button>
            </div>

            {/* Entries */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Günlük Kayıtlar</h2>
              <span className="font-mono text-xs text-[#8892aa] bg-[#181b22] px-3 py-1 rounded-full">{entries.length} kayıt</span>
            </div>

            {entries.length === 0 ? (
              <div className="text-center py-16 text-[#3e4a5e]">
                <div className="text-4xl mb-3 opacity-40">📋</div>
                <p className="font-mono text-sm">Bu gün için kayıt yok.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {entries.map(e => {
                  const cs = e.cs
                  const cur = e.prices?.currency || (e.ticker?.endsWith('.IS') ? 'TRY' : 'USD')
                  const sym = currencySymbol(cur)
                  const borderColor = cs==='watch'?'#ffd166':cs.startsWith('buy-long')?'#00e5a0':cs.startsWith('sell')?'#ff4d6d':'#60a5fa'
                  return (
                    <div key={e.id} className="bg-[#111318] border border-[#1e2330] rounded-xl p-5 grid gap-4 hover:border-[#252b3a] transition-all"
                      style={{ gridTemplateColumns: '88px 1fr auto', borderLeft: `3px solid ${borderColor}` }}>
                      <div className="flex flex-col items-center gap-1.5 pt-0.5">
                        <div className="font-mono text-base font-medium tracking-widest">{e.ticker}</div>
                        <span className={`text-[8px] font-bold tracking-wide px-2 py-0.5 rounded-full ${
                          cs==='watch'?'bg-[rgba(255,209,102,0.1)] text-[#ffd166]':
                          cs==='buy-long'?'bg-[rgba(0,229,160,0.08)] text-[#00e5a0]':
                          cs==='sell-long'?'bg-[rgba(255,77,109,0.1)] text-[#ff4d6d]':
                          'bg-[rgba(96,165,250,0.1)] text-[#60a5fa]'
                        }`}>{SL[cs]}</span>
                        <div className="font-mono text-[10px] text-[#3e4a5e]">{e.time}</div>
                      </div>
                      <div>
                        {e.lot && (
                          <div className="inline-flex items-center gap-1 font-mono text-[10px] text-[#3e4a5e] bg-[#181b22] px-2 py-1 rounded-full mb-2">
                            📦 {e.lot} lot{e.buyPrice ? ` · ${sym}${e.buyPrice}` : ''}{e.sellPrice ? ` · ${sym}${e.sellPrice}` : ''}
                          </div>
                        )}
                        <p className="text-sm text-[#8892aa] leading-relaxed mb-3">{e.comment}</p>
                        {e.prices ? (
                          <div className="flex gap-4 flex-wrap">
                            <div>
                              <div className="font-mono text-[9px] text-[#3e4a5e] uppercase tracking-wider">Güncel</div>
                              <div className="font-mono text-sm">{sym}{e.prices.current.toFixed(2)}</div>
                              {e.prices.change != null && (
                                <div className={`font-mono text-[11px] ${e.prices.change >= 0 ? 'text-[#00e5a0]' : 'text-[#ff4d6d]'}`}>
                                  {e.prices.change >= 0 ? '+' : ''}{e.prices.change.toFixed(2)}%
                                </div>
                              )}
                            </div>
                            {e.buyPrice && e.prices.current && (
                              <div>
                                <div className="font-mono text-[9px] text-[#3e4a5e] uppercase tracking-wider">
                                  {e.cs === 'sell-long' || e.cs === 'sell-short' ? 'Gerçekleşen K/Z' : 'Anlık K/Z'}
                                </div>
                                {(() => {
                                  const pnl = e.cs === 'sell-long' && e.sellPrice
                                    ? (e.sellPrice - e.buyPrice!) * (e.lot || 1)
                                    : (e.prices!.current - e.buyPrice!) * (e.lot || 1)
                                  const isPos = pnl >= 0
                                  return (
                                    <div className={`font-mono text-sm font-medium ${isPos ? 'text-[#00e5a0]' : 'text-[#ff4d6d]'}`}>
                                      {isPos ? '+' : ''}{sym}{Math.abs(pnl).toFixed(2)}
                                    </div>
                                  )
                                })()}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="font-mono text-xs text-[#3e4a5e] animate-pulse">fiyat yükleniyor…</div>
                        )}
                      </div>
                      <button onClick={() => deleteEntry(e.id)}
                        className="w-8 h-8 border border-[#252b3a] text-[#3e4a5e] rounded-lg flex items-center justify-center text-sm hover:border-[#ff4d6d] hover:text-[#ff4d6d] hover:bg-[rgba(255,77,109,0.1)] transition-all self-start">
                        🗑
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TICKERS TAB ── */}
        {activeTab === 'tickers' && (
          <div>
            <input value={tickerSearch} onChange={e=>setTickerSearch(e.target.value.toUpperCase())}
              className="w-full bg-[#111318] border border-[#1e2330] text-white rounded-xl px-4 py-3 font-mono tracking-widest text-sm outline-none focus:border-[#00e5a0] mb-5 transition-all"
              placeholder="HİSSE ARA…" />

            {(() => {
              const map: Record<string, (Entry & {date:string})[]> = {}
              for (const [date, ents] of Object.entries(allEntries)) {
                for (const e of ents) {
                  if (!map[e.ticker]) map[e.ticker] = []
                  map[e.ticker].push({ ...e, date })
                }
              }
              const tickers = Object.keys(map)
                .filter(t => !tickerSearch || t.includes(tickerSearch))
                .sort()

              return (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold">Hisse Takip</h2>
                    <span className="font-mono text-xs text-[#8892aa] bg-[#181b22] px-3 py-1 rounded-full">{tickers.length} hisse</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                    {tickers.map(t => {
                      const ents = map[t]
                      const latest = ents[0]
                      const p = latest.prices
                      const cur = p?.currency || (t.endsWith('.IS') ? 'TRY' : 'USD')
                      const sym = currencySymbol(cur)
                      return (
                        <div key={t} onClick={() => setActiveTicker(activeTicker === t ? null : t)}
                          className={`bg-[#111318] border rounded-xl p-5 cursor-pointer transition-all hover:-translate-y-0.5 ${activeTicker===t?'border-[#00e5a0] bg-[#181b22]':'border-[#1e2330] hover:border-[#00e5a0]'}`}>
                          <div className="flex items-start justify-between mb-3">
                            <div className="font-mono text-lg font-medium tracking-widest">{t}</div>
                            <div className="font-mono text-[10px] text-[#3e4a5e] bg-[#181b22] px-2 py-0.5 rounded-full">{ents.length} yorum</div>
                          </div>
                          <div className="font-mono text-sm mb-2">
                            {p?.current ? `${sym}${p.current.toFixed(2)}` : <span className="text-[#3e4a5e]">—</span>}
                            {p?.change != null && (
                              <span className={`text-xs ml-2 ${p.change>=0?'text-[#00e5a0]':'text-[#ff4d6d]'}`}>
                                {p.change>=0?'+':''}{p.change.toFixed(2)}%
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[9px] text-[#3e4a5e]">Son: {latest.date}</div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Ticker Detail */}
                  {activeTicker && map[activeTicker] && (
                    <div className="bg-[#111318] border border-[#00e5a0] rounded-xl overflow-hidden">
                      <div className="bg-[#181b22] px-6 py-4 flex items-center justify-between border-b border-[#1e2330]">
                        <div>
                          <div className="font-mono text-xl font-medium tracking-widest">{activeTicker}</div>
                          <div className="font-mono text-xs text-[#3e4a5e] mt-1">{map[activeTicker].length} yorum · tüm zamanlar</div>
                        </div>
                        <button onClick={() => setActiveTicker(null)}
                          className="w-8 h-8 border border-[#252b3a] text-[#3e4a5e] rounded-lg flex items-center justify-center hover:border-[#ff4d6d] hover:text-[#ff4d6d] transition-all">
                          ✕
                        </button>
                      </div>
                      <div className="divide-y divide-[#1e2330]">
                        {[...map[activeTicker]].sort((a,b) => b.date.localeCompare(a.date) || b.id - a.id).map(e => {
                          const cur = e.prices?.currency || (e.ticker?.endsWith('.IS') ? 'TRY' : 'USD')
                          const sym = currencySymbol(cur)
                          return (
                            <div key={e.id} className="grid px-6 py-5 gap-4" style={{gridTemplateColumns:'120px 1fr auto'}}>
                              <div className="flex flex-col gap-1.5">
                                <div className="font-mono text-xs text-[#8892aa]">{e.date}<br/><span className="text-[#3e4a5e]">{e.time}</span></div>
                                <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full self-start ${BC[e.cs]?.includes('buy-long')?'bg-[rgba(0,229,160,0.08)] text-[#00e5a0]':BC[e.cs]?.includes('sell')?'bg-[rgba(255,77,109,0.1)] text-[#ff4d6d]':'bg-[rgba(255,209,102,0.1)] text-[#ffd166]'}`}>
                                  {SL[e.cs]}
                                </span>
                              </div>
                              <div>
                                {e.lot && <div className="font-mono text-[10px] text-[#3e4a5e] mb-2">📦 {e.lot} lot{e.buyPrice?` · ${sym}${e.buyPrice}`:''}
                                  {e.sellPrice?` · ${sym}${e.sellPrice}`:''}</div>}
                                <p className="text-sm text-[#8892aa] leading-relaxed">{e.comment}</p>
                              </div>
                              <button onClick={() => deleteEntry(e.id, e.date)}
                                className="w-8 h-8 border border-[#252b3a] text-[#3e4a5e] rounded-lg flex items-center justify-center text-sm hover:border-[#ff4d6d] hover:text-[#ff4d6d] hover:bg-[rgba(255,77,109,0.1)] transition-all self-start">
                                🗑
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}

        {/* ── PORTFOLIO TAB ── */}
        {activeTab === 'portfolio' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">Portföy</h2>
              <div className="flex gap-1 bg-[#181b22] rounded-lg p-1">
                {(['TRY','USD'] as const).map(c => (
                  <button key={c} onClick={() => setPfCurrency(c)}
                    className={`px-4 py-1.5 rounded-md text-xs font-mono font-medium transition-all ${pfCurrency===c?'bg-[#111318] text-white shadow':'text-[#8892aa]'}`}>
                    {c === 'TRY' ? '₺ TRY' : '$ USD'}
                  </button>
                ))}
              </div>
            </div>
            {usdTryRate && <p className="font-mono text-xs text-[#3e4a5e] mb-6">1 USD = ₺{usdTryRate.toFixed(2)}</p>}

            {(() => {
              const allFlat: (Entry & {date:string})[] = []
              for (const [date, ents] of Object.entries(allEntries)) {
                for (const e of ents) allFlat.push({ ...e, date })
              }
              allFlat.sort((a,b) => a.date.localeCompare(b.date) || a.id - b.id)

              const positions: Record<string, any> = {}
              const realized: any[] = []

              for (const e of allFlat) {
                const t = e.ticker
                const cur = e.prices?.currency || (t.endsWith('.IS') ? 'TRY' : 'USD')
                if (!positions[t]) positions[t] = { longLots:0, avgBuy:0, shortLots:0, avgShort:0, currency:cur, prices:e.prices }
                const pos = positions[t]
                if (e.prices) { pos.prices = e.prices; pos.currency = e.prices.currency }

                if (e.cs==='buy-long'&&e.lot&&e.buyPrice) {
                  const total = pos.longLots*pos.avgBuy + e.lot*e.buyPrice
                  pos.longLots += e.lot; pos.avgBuy = total/pos.longLots
                } else if (e.cs==='sell-long'&&e.lot) {
                  const lots = Math.min(e.lot, pos.longLots||e.lot)
                  const cost = e.buyPrice||pos.avgBuy
                  if (cost&&e.sellPrice) {
                    realized.push({id:e.id, ticker:t, lots, pnl:(e.sellPrice-cost)*lots,
                      pct:(e.sellPrice-cost)/cost*100, type:'long', currency:pos.currency,
                      sym:currencySymbol(pos.currency), buyPrice:cost, sellPrice:e.sellPrice, date:e.date})
                  }
                  pos.longLots = Math.max(0,(pos.longLots||0)-lots)
                  if(pos.longLots===0) pos.avgBuy=0
                } else if (e.cs==='sell-short'&&e.lot&&e.sellPrice) {
                  const total = pos.shortLots*pos.avgShort + e.lot*e.sellPrice
                  pos.shortLots += e.lot; pos.avgShort = total/pos.shortLots
                } else if (e.cs==='buy-short'&&e.lot&&e.buyPrice&&e.sellPrice) {
                  const lots = Math.min(e.lot, pos.shortLots)
                  realized.push({id:e.id, ticker:t, lots, pnl:(e.sellPrice-e.buyPrice)*lots,
                    pct:(e.sellPrice-e.buyPrice)/e.sellPrice*100, type:'short', currency:pos.currency,
                    sym:currencySymbol(pos.currency), buyPrice:e.buyPrice, sellPrice:e.sellPrice, date:e.date})
                  pos.shortLots = Math.max(0, pos.shortLots-lots)
                  if(pos.shortLots===0) pos.avgShort=0
                }
              }

              const openLong = Object.entries(positions).filter(([,p])=>p.longLots>0)
              const openShort = Object.entries(positions).filter(([,p])=>p.shortLots>0)

              function convertPnl(pnl: number, cur: string) {
                if (cur === pfCurrency) return pnl
                if (cur==='USD'&&pfCurrency==='TRY'&&usdTryRate) return pnl*usdTryRate
                if (cur==='TRY'&&pfCurrency==='USD'&&usdTryRate) return pnl/usdTryRate
                return pnl
              }
              const pfSym = pfCurrency==='TRY'?'₺':'$'

              let totalUnrealized = 0, totalRealized = 0
              for (const [,pos] of openLong) {
                if (pos.prices?.current && pos.avgBuy)
                  totalUnrealized += convertPnl((pos.prices.current-pos.avgBuy)*pos.longLots, pos.currency)
              }
              for (const r of realized) totalRealized += convertPnl(r.pnl, r.currency)
              const totalPnl = totalUnrealized + totalRealized

              return (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                    {[
                      { label: 'Açık Pozisyon', value: String(openLong.length+openShort.length), color: 'text-white' },
                      { label: 'Anlık K/Z', value: `${totalUnrealized>=0?'+':''}${pfSym}${Math.abs(totalUnrealized).toFixed(2)}`, color: totalUnrealized>=0?'text-[#00e5a0]':'text-[#ff4d6d]' },
                      { label: 'Gerçekleşen K/Z', value: `${totalRealized>=0?'+':''}${pfSym}${Math.abs(totalRealized).toFixed(2)}`, color: totalRealized>=0?'text-[#00e5a0]':'text-[#ff4d6d]' },
                      { label: 'Toplam K/Z', value: `${totalPnl>=0?'+':''}${pfSym}${Math.abs(totalPnl).toFixed(2)}`, color: totalPnl>=0?'text-[#00e5a0]':'text-[#ff4d6d]' },
                    ].map(s => (
                      <div key={s.label} className="bg-[#111318] border border-[#1e2330] rounded-xl p-5">
                        <div className="font-mono text-[10px] text-[#3e4a5e] uppercase tracking-widest mb-2">{s.label}</div>
                        <div className={`font-mono text-2xl font-medium ${s.color}`}>{s.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Open Long */}
                  <h3 className="font-bold mb-3 flex items-center gap-2">
                    Açık Long <span className="text-[10px] font-mono bg-[rgba(0,229,160,0.08)] text-[#00e5a0] px-2 py-0.5 rounded-full">LONG</span>
                  </h3>
                  {openLong.length===0 ? <p className="text-[#3e4a5e] font-mono text-sm mb-6">Açık long pozisyon yok.</p> : (
                    <div className="overflow-x-auto mb-6">
                      <table className="w-full text-sm">
                        <thead><tr className="font-mono text-[9px] text-[#3e4a5e] uppercase tracking-widest border-b border-[#1e2330]">
                          {['Hisse','Lot','Ort. Maliyet','Güncel','Anlık K/Z','K/Z %',''].map(h=><th key={h} className="text-left py-2 px-3">{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {openLong.map(([t,pos])=>{
                            const cp = pos.prices?.current
                            const sym = currencySymbol(pos.currency)
                            const uPnl = cp&&pos.avgBuy?(cp-pos.avgBuy)*pos.longLots:null
                            const uPct = cp&&pos.avgBuy?(cp-pos.avgBuy)/pos.avgBuy*100:null
                            return <tr key={t} className="border-b border-[#1e2330] hover:bg-[#181b22]">
                              <td className="py-3 px-3 font-mono font-medium">{t}</td>
                              <td className="py-3 px-3 font-mono">{pos.longLots}</td>
                              <td className="py-3 px-3 font-mono">{sym}{pos.avgBuy.toFixed(2)}</td>
                              <td className="py-3 px-3 font-mono">{cp?sym+cp.toFixed(2):'—'}</td>
                              <td className={`py-3 px-3 font-mono font-medium ${uPnl!=null?(uPnl>=0?'text-[#00e5a0]':'text-[#ff4d6d]'):''}`}>
                                {uPnl!=null?(uPnl>=0?'+':'')+sym+Math.abs(uPnl).toFixed(2):'—'}
                              </td>
                              <td className={`py-3 px-3 font-mono ${uPct!=null?(uPct>=0?'text-[#00e5a0]':'text-[#ff4d6d]'):''}`}>
                                {uPct!=null?(uPct>=0?'+':'')+uPct.toFixed(2)+'%':'—'}
                              </td>
                              <td className="py-3 px-3"></td>
                            </tr>
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Realized */}
                  <h3 className="font-bold mb-3 flex items-center gap-2">
                    Kapatılan İşlemler <span className="text-[10px] font-mono bg-[rgba(255,77,109,0.1)] text-[#ff4d6d] px-2 py-0.5 rounded-full">GERÇEKLEŞTİ</span>
                  </h3>
                  {realized.length===0 ? <p className="text-[#3e4a5e] font-mono text-sm">Henüz kapatılan işlem yok.</p> : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="font-mono text-[9px] text-[#3e4a5e] uppercase tracking-widest border-b border-[#1e2330]">
                          {['Tarih','Hisse','Yön','Lot','Giriş','Çıkış','K/Z','K/Z %',''].map(h=><th key={h} className="text-left py-2 px-3">{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {[...realized].sort((a,b)=>b.date.localeCompare(a.date)).map(r=>{
                            const ep = r.type==='long'?r.buyPrice:r.sellPrice
                            const xp = r.type==='long'?r.sellPrice:r.buyPrice
                            return <tr key={r.id} className="border-b border-[#1e2330] hover:bg-[#181b22]">
                              <td className="py-3 px-3 font-mono text-xs text-[#8892aa]">{r.date}</td>
                              <td className="py-3 px-3 font-mono font-medium">{r.ticker}</td>
                              <td className="py-3 px-3"><span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${r.type==='long'?'bg-[rgba(0,229,160,0.08)] text-[#00e5a0]':'bg-[rgba(96,165,250,0.1)] text-[#60a5fa]'}`}>{r.type.toUpperCase()}</span></td>
                              <td className="py-3 px-3 font-mono">{r.lots}</td>
                              <td className="py-3 px-3 font-mono">{r.sym}{ep.toFixed(2)}</td>
                              <td className="py-3 px-3 font-mono">{r.sym}{xp.toFixed(2)}</td>
                              <td className={`py-3 px-3 font-mono font-medium ${r.pnl>=0?'text-[#00e5a0]':'text-[#ff4d6d]'}`}>
                                {r.pnl>=0?'+':''}{r.sym}{Math.abs(r.pnl).toFixed(2)}
                              </td>
                              <td className={`py-3 px-3 font-mono ${r.pct>=0?'text-[#00e5a0]':'text-[#ff4d6d]'}`}>
                                {r.pct>=0?'+':''}{r.pct.toFixed(2)}%
                              </td>
                              <td className="py-3 px-3">
                                <button onClick={() => deleteEntry(r.id)}
                                  className="w-7 h-7 border border-[#252b3a] text-[#3e4a5e] rounded-lg flex items-center justify-center text-xs hover:border-[#ff4d6d] hover:text-[#ff4d6d] transition-all">
                                  🗑
                                </button>
                              </td>
                            </tr>
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === 'history' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">Geçmiş</h2>
              <span className="font-mono text-xs text-[#8892aa] bg-[#181b22] px-3 py-1 rounded-full">{deletedItems.length} kayıt</span>
            </div>
            {deletedItems.length === 0 ? (
              <div className="text-center py-16 text-[#3e4a5e]">
                <div className="text-4xl mb-3 opacity-40">🗂</div>
                <p className="font-mono text-sm">Silinmiş kayıt yok.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {deletedItems.map((e: any) => (
                  <div key={e.id} className="bg-[#111318] border border-[#1e2330] rounded-xl p-5 grid gap-4 opacity-70 hover:opacity-100 transition-all"
                    style={{ gridTemplateColumns: '100px 1fr auto' }}>
                    <div>
                      <div className="font-mono text-xs text-[#8892aa]">{e.sourceDate || '—'}</div>
                      <div className="font-mono text-xs text-[#3e4a5e] mt-1">{e.time}</div>
                      {e.deletedAt && <div className="font-mono text-[9px] text-[#3e4a5e] mt-2">Silindi: {new Date(e.deletedAt).toLocaleDateString('tr-TR')}</div>}
                    </div>
                    <div>
                      <div className="font-mono font-medium mb-1">{e.ticker}</div>
                      <p className="text-sm text-[#8892aa] leading-relaxed">{(e.comment||'').slice(0,150)}{(e.comment||'').length>150?'…':''}</p>
                    </div>
                    <button onClick={() => restoreEntry(e.id)}
                      className="px-3 py-1.5 border border-[#252b3a] text-[#3e4a5e] rounded-lg font-mono text-[10px] hover:border-[#00e5a0] hover:text-[#00e5a0] transition-all self-start whitespace-nowrap">
                      ↩ Geri Yükle
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* DATE PICKER MODAL */}
      {dpOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setDpOpen(false)}>
          <div className="bg-[#111318] border border-[#252b3a] rounded-2xl p-7 w-80" onClick={e=>e.stopPropagation()}>
            <div className="font-mono text-[11px] text-[#00e5a0] uppercase tracking-widest mb-5">Tarih Seç</div>
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => { if(dpMonth===0){setDpMonth(11);setDpYear(y=>y-1)}else setDpMonth(m=>m-1) }}
                className="w-8 h-8 border border-[#252b3a] text-[#8892aa] rounded-lg flex items-center justify-center hover:border-[#00e5a0] hover:text-[#00e5a0] transition-all">←</button>
              <span className="font-bold">
                {['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'][dpMonth]} {dpYear}
              </span>
              <button onClick={() => { if(dpMonth===11){setDpMonth(0);setDpYear(y=>y+1)}else setDpMonth(m=>m+1) }}
                className="w-8 h-8 border border-[#252b3a] text-[#8892aa] rounded-lg flex items-center justify-center hover:border-[#00e5a0] hover:text-[#00e5a0] transition-all">→</button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-4">
              {['Pt','Sa','Ça','Pe','Cu','Ct','Pz'].map(d=><div key={d} className="text-center font-mono text-[9px] text-[#3e4a5e] py-1">{d}</div>)}
              {Array.from({length:(new Date(dpYear,dpMonth,1).getDay()+6)%7}).map((_,i)=><div key={i}/>)}
              {Array.from({length:new Date(dpYear,dpMonth+1,0).getDate()}).map((_,i)=>{
                const d = i+1
                const isSelected = dpSelected && new Date(dpYear,dpMonth,d).toDateString()===dpSelected.toDateString()
                const isToday = new Date(dpYear,dpMonth,d).toDateString()===new Date().toDateString()
                return <button key={d} onClick={()=>setDpSelected(new Date(dpYear,dpMonth,d))}
                  className={`aspect-square rounded-lg font-mono text-xs flex items-center justify-center transition-all ${
                    isSelected?'bg-[#00e5a0] text-black font-bold':isToday?'text-[#00e5a0] font-bold border border-[#00e5a0]':'text-[#8892aa] hover:bg-[rgba(0,229,160,0.08)] hover:text-[#00e5a0]'
                  }`}>{d}</button>
              })}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={()=>setDpOpen(false)} className="px-4 py-2 border border-[#252b3a] text-[#8892aa] rounded-lg text-sm font-semibold hover:text-white transition-all">İptal</button>
              <button onClick={()=>{ const d=new Date(dpSelected);d.setHours(0,0,0,0);setCurrentDate(d);setDpOpen(false) }}
                className="px-4 py-2 bg-[#00e5a0] text-black font-bold rounded-lg text-sm hover:bg-[#00b37a] transition-all">Seç</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}