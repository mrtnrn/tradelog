'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/lib/theme'

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

async function fetchPrice(ticker: string): Promise<PriceData | null> {
  if (priceCache[ticker] && Date.now() - priceCache[ticker].ts < CACHE_TTL) return priceCache[ticker].data
  try {
    const res = await fetch(`/api/price?ticker=${encodeURIComponent(ticker)}`)
    if (!res.ok) return null
    const data = await res.json()
    if (data.error) return null
    priceCache[ticker] = { ts: Date.now(), data }
    return data
  } catch { return null }
}

// ── CSS HELPERS ─────────────────────────────────────────
function csBorderColor(cs: CS) {
  if (cs === 'watch') return 'var(--yellow)'
  if (cs === 'buy-long') return 'var(--accent)'
  if (cs === 'sell-long') return 'var(--red)'
  return 'var(--blue)'
}

function csBadgeClass(cs: CS) {
  if (cs === 'watch') return 'bg-yellow-400/10 text-yellow-400'
  if (cs === 'buy-long') return 'bg-emerald-400/10 text-emerald-400'
  if (cs === 'sell-long') return 'bg-red-400/10 text-red-400'
  return 'bg-blue-400/10 text-blue-400'
}

// ── STOCK MODAL ─────────────────────────────────────────
function StockModal({ ticker, entries, onClose, onAddEntry, user }: {
  ticker: string
  entries: (Entry & { date: string })[]
  onClose: () => void
  onAddEntry: (entry: Partial<Entry>, date: string) => Promise<void>
  user: any
}) {
  const [currentPrice, setCurrentPrice] = useState<PriceData | null>(null)
  const [activeSection, setActiveSection] = useState<'notes'|'trade'>('notes')

  // Form state
  const [comment, setComment] = useState('')
  const [status, setStatus] = useState<Status>('watch')
  const [direction, setDirection] = useState<Direction>('long')
  const [lot, setLot] = useState('')
  const [buyPrice, setBuyPrice] = useState('')
  const [sellPrice, setSellPrice] = useState('')
  const [entryDate, setEntryDate] = useState(() => dateKey(new Date()))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchPrice(ticker).then(pd => {
      if (pd) {
        setCurrentPrice(pd)
        setBuyPrice(pd.current.toFixed(2))
      }
    })
  }, [ticker])

  const sym = currencySymbol(currentPrice?.currency || 'USD')
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)

  async function handleSubmit() {
    if (!comment.trim()) return
    setSaving(true)
    const cs = compositeStatus(status, direction)
    const entry: Partial<Entry> = {
      id: Date.now(),
      ticker,
      comment,
      status, direction, cs,
      lot: lot ? parseFloat(lot) : null,
      buyPrice: buyPrice ? parseFloat(buyPrice) : null,
      sellPrice: sellPrice ? parseFloat(sellPrice) : null,
      time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      prices: currentPrice
    }
    await onAddEntry(entry, entryDate)
    setComment('')
    setLot('')
    setSaving(false)
    setActiveSection('notes')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--border)', background: 'var(--surface2)' }}>
          <div>
            <div className="font-mono text-2xl font-medium tracking-widest" style={{ color: 'var(--text)' }}>
              {ticker}
            </div>
            <div className="font-mono text-xs mt-1" style={{ color: 'var(--text3)' }}>
              {entries.length} kayıt · tüm zamanlar
            </div>
          </div>
          <div className="flex items-center gap-4">
            {currentPrice && (
              <div className="text-right">
                <div className="font-mono text-xl font-medium" style={{ color: 'var(--text)' }}>
                  {sym}{currentPrice.current.toFixed(2)}
                </div>
                {currentPrice.change != null && (
                  <div className={`font-mono text-sm ${currentPrice.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {currentPrice.change >= 0 ? '+' : ''}{currentPrice.change.toFixed(2)}%
                  </div>
                )}
              </div>
            )}
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ border: '1px solid var(--border2)', color: 'var(--text3)' }}>✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-2 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface2)' }}>
          {[
            { id: 'notes', label: '📋 Notlar' },
            { id: 'trade', label: '➕ Yeni Kayıt' },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveSection(t.id as any)}
              className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
              style={activeSection === t.id
                ? { background: 'var(--accent)', color: '#000' }
                : { color: 'var(--text2)' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Notes section */}
        {activeSection === 'notes' && (
          <div className="overflow-y-auto flex-1 divide-y" style={{ borderColor: 'var(--border)' }}>
            {sorted.length === 0 ? (
              <div className="text-center py-16" style={{ color: 'var(--text3)' }}>
                <p className="font-mono text-sm">Henüz kayıt yok.</p>
              </div>
            ) : sorted.map(e => {
              const cur = e.prices?.currency || (e.ticker?.endsWith('.IS') ? 'TRY' : 'USD')
              const esym = currencySymbol(cur)
              return (
                <div key={e.id} className="px-6 py-4"
                  style={{ borderLeft: `3px solid ${csBorderColor(e.cs)}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs" style={{ color: 'var(--text2)' }}>{e.date}</span>
                      {e.time && <span className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>{e.time}</span>}
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${csBadgeClass(e.cs)}`}>
                      {SL[e.cs]}
                    </span>
                  </div>
                  {e.lot && (
                    <div className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-full mb-2"
                      style={{ background: 'var(--surface2)', color: 'var(--text3)' }}>
                      📦 {e.lot} lot{e.buyPrice ? ` · ${esym}${e.buyPrice}` : ''}{e.sellPrice ? ` · ${esym}${e.sellPrice}` : ''}
                    </div>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text2)' }}>
                    {e.comment}
                  </p>
                </div>
              )
            })}
          </div>
        )}

        {/* New entry section */}
        {activeSection === 'trade' && (
          <div className="overflow-y-auto flex-1 p-6 space-y-4">
            {/* Date */}
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>Tarih</label>
              <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)}
                className="w-full rounded-lg px-4 py-2.5 font-mono text-sm outline-none transition-all"
                style={{ background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text)' }} />
            </div>

            {/* Status */}
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>Durum</label>
              <div className="flex gap-2">
                {(['watch','buy','sell'] as Status[]).map(s => (
                  <button key={s} onClick={() => setStatus(s)}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold border transition-all"
                    style={status === s ? {
                      background: s==='watch'?'rgba(255,209,102,0.1)':s==='buy'?'var(--accent-dim)':'rgba(255,77,109,0.1)',
                      borderColor: s==='watch'?'var(--yellow)':s==='buy'?'var(--accent)':'var(--red)',
                      color: s==='watch'?'var(--yellow)':s==='buy'?'var(--accent)':'var(--red)'
                    } : { borderColor: 'var(--border2)', color: 'var(--text2)' }}>
                    {s === 'watch' ? '👁 Takip' : s === 'buy' ? '✅ Alındı' : '💸 Satıldı'}
                  </button>
                ))}
              </div>
            </div>

            {/* Direction */}
            {status !== 'watch' && (
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>Yön</label>
                <div className="flex gap-2 w-40">
                  {(['long','short'] as Direction[]).map(d => (
                    <button key={d} onClick={() => setDirection(d)}
                      className="flex-1 py-2 rounded-lg text-xs font-bold border transition-all"
                      style={direction === d ? {
                        background: d==='long'?'var(--accent-dim)':'rgba(96,165,250,0.1)',
                        borderColor: d==='long'?'var(--accent)':'var(--blue)',
                        color: d==='long'?'var(--accent)':'var(--blue)'
                      } : { borderColor: 'var(--border2)', color: 'var(--text2)' }}>
                      {d === 'long' ? '↑ Long' : '↓ Short'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Trade fields */}
            {status !== 'watch' && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>Lot</label>
                  <input type="number" value={lot} onChange={e => setLot(e.target.value)}
                    className="w-full rounded-lg px-3 py-2.5 font-mono text-sm outline-none transition-all"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text)' }}
                    placeholder="100" />
                </div>
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>Alış Fiyatı</label>
                  <input type="number" value={buyPrice} onChange={e => setBuyPrice(e.target.value)}
                    className="w-full rounded-lg px-3 py-2.5 font-mono text-sm outline-none transition-all"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text)' }}
                    placeholder="0.00" />
                </div>
                {status === 'sell' && (
                  <div>
                    <label className="block font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>Satış Fiyatı</label>
                    <input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)}
                      className="w-full rounded-lg px-3 py-2.5 font-mono text-sm outline-none transition-all"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text)' }}
                      placeholder="0.00" />
                  </div>
                )}
              </div>
            )}

            {/* Comment */}
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>Yorum & Analiz</label>
              <textarea value={comment} onChange={e => setComment(e.target.value)}
                className="w-full rounded-lg px-4 py-3 text-sm outline-none resize-y min-h-24 transition-all"
                style={{ background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text)' }}
                placeholder="Bu hisse neden ilgi çekici?…" />
            </div>

            <button onClick={handleSubmit} disabled={!comment.trim() || saving}
              className="w-full py-3 font-bold rounded-lg text-black transition-all disabled:opacity-40"
              style={{ background: 'var(--accent)' }}>
              {saving ? 'Kaydediliyor…' : '+ Kayıt Ekle'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── TRADE MODAL (Portföy satış) ─────────────────────────

function TradeModal({ data, onClose, onSubmit, allEntries }: {
  data: { ticker: string, avgBuy: number, lots: number, currency: string }
  onClose: () => void
  onSubmit: (sellPrice: number, lots: number, date: string, buyPrice: number) => void
  allEntries: AllEntries
}) {
  const sym = currencySymbol(data.currency)
  const [sellPrice, setSellPrice] = useState('')
  const [sellLots, setSellLots] = useState(String(data.lots))
  const [buyPrice, setBuyPrice] = useState(data.avgBuy.toFixed(2))
  const [tradeDate, setTradeDate] = useState(() => dateKey(new Date()))
  const [loadingPrice, setLoadingPrice] = useState(true)

  useEffect(() => {
    fetchPrice(data.ticker).then(pd => {
      if (pd?.current) setSellPrice(pd.current.toFixed(2))
      setLoadingPrice(false)
    })
  }, [data.ticker])

  const sp = parseFloat(sellPrice)
  const sl = parseFloat(sellLots)
  const bp = parseFloat(buyPrice)
  const pnl = sp && sl && bp ? (sp - bp) * sl : null
  const pct = sp && bp ? (sp - bp) / bp * 100 : null

  // Bu hisseye ait tüm geçmiş kayıtlar
  const history: (Entry & { date: string })[] = []
  for (const [date, ents] of Object.entries(allEntries)) {
    for (const e of ents) {
      if (e.ticker === data.ticker) history.push({ ...e, date })
    }
  }
  history.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
          style={{ borderColor: 'var(--border)', background: 'var(--surface2)' }}>
          <div>
            <div className="font-mono text-xl font-medium tracking-widest" style={{ color: 'var(--text)' }}>{data.ticker}</div>
            <div className="font-mono text-xs mt-1" style={{ color: 'var(--text3)' }}>Long Satış İşlemi</div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ border: '1px solid var(--border2)', color: 'var(--text3)' }}>✕</button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Satış Formu */}
          <div className="p-6 space-y-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>İşlem Tarihi</label>
                <input type="date" value={tradeDate} onChange={e => setTradeDate(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 font-mono text-sm outline-none transition-all"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text)' }} />
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>Satış Lot (max: {data.lots})</label>
                <input type="number" value={sellLots} onChange={e => setSellLots(e.target.value)}
                  max={data.lots} min={1}
                  className="w-full rounded-lg px-3 py-2.5 font-mono text-sm outline-none transition-all"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text)' }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>
                  Alış Fiyatı <span style={{ color: 'var(--accent)', fontSize: '9px' }}>değiştirilebilir</span>
                </label>
                <input type="number" value={buyPrice} onChange={e => setBuyPrice(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 font-mono text-sm outline-none transition-all"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text)' }} />
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>
                  Satış Fiyatı {loadingPrice && <span className="animate-pulse">yükleniyor…</span>}
                </label>
                <input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg px-3 py-2.5 font-mono text-sm outline-none transition-all"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text)' }} />
              </div>
            </div>

            {pnl !== null && (
              <div className={`rounded-xl p-4 border ${pnl >= 0 ? 'border-emerald-400/30' : 'border-red-400/30'}`}
                style={{ background: pnl >= 0 ? 'rgba(0,229,160,0.08)' : 'rgba(255,77,109,0.08)' }}>
                <div className="font-mono text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>Tahmini K/Z</div>
                <div className={`font-mono text-2xl font-medium ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {pnl >= 0 ? '+' : ''}{sym}{Math.abs(pnl).toFixed(2)}
                </div>
                <div className={`font-mono text-xs mt-1 ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {pct! >= 0 ? '+' : ''}{pct!.toFixed(2)}% · {sl} lot
                </div>
              </div>
            )}

            <button
              onClick={() => { if (sp && sl && bp) onSubmit(sp, sl, tradeDate, bp) }}
              disabled={!sellPrice || !sellLots || !buyPrice}
              className="w-full py-3 font-bold rounded-lg text-white transition-all disabled:opacity-40"
              style={{ background: 'var(--red)' }}>
              💸 Satışı Kaydet
            </button>
          </div>

          {/* Geçmiş Notlar & İşlemler */}
          {history.length > 0 && (
            <div>
              <div className="px-6 py-3 font-mono text-[10px] uppercase tracking-widest"
                style={{ color: 'var(--text3)', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                Geçmiş Kayıtlar — {history.length} adet
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {history.map(e => {
                  const cur = e.prices?.currency || (e.ticker?.endsWith('.IS') ? 'TRY' : 'USD')
                  const esym = currencySymbol(cur)
                  return (
                    <div key={e.id} className="px-6 py-4"
                      style={{ borderLeft: `3px solid ${csBorderColor(e.cs)}` }}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs" style={{ color: 'var(--text2)' }}>{e.date}</span>
                          {e.time && <span className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>{e.time}</span>}
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${csBadgeClass(e.cs)}`}>
                          {SL[e.cs]}
                        </span>
                      </div>
                      {e.lot && (
                        <div className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-full mb-2"
                          style={{ background: 'var(--surface2)', color: 'var(--text3)' }}>
                          📦 {e.lot} lot{e.buyPrice ? ` · ${esym}${e.buyPrice}` : ''}{e.sellPrice ? ` · ${esym}${e.sellPrice}` : ''}
                        </div>
                      )}
                      <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text2)' }}>
                        {e.comment}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
// ── MAIN COMPONENT ──────────────────────────────────────
export default function Dashboard() {
  const [supabase] = useState(() => createClient())
  const router = useRouter()
  const { theme, setTheme } = useTheme()

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
  const [tickerSearch, setTickerSearch] = useState('')

  // Stock modal
  const [modalTicker, setModalTicker] = useState<string|null>(null)

  // Portfolio
  const [pfCurrency, setPfCurrency] = useState<'TRY'|'USD'>('TRY')
  const [usdTryRate, setUsdTryRate] = useState<number|null>(null)
  const [portfolioPrices, setPortfolioPrices] = useState<Record<string, PriceData>>({})
  // Date picker
  const [dpOpen, setDpOpen] = useState(false)
  const [dpYear, setDpYear] = useState(new Date().getFullYear())
  const [dpMonth, setDpMonth] = useState(new Date().getMonth())
  const [dpSelected, setDpSelected] = useState(new Date())

  // Hisse Takip görünüm ayarları
  const [tickerSort, setTickerSort] = useState<'alpha'|'recent'>('recent')
  const [tickerLayout, setTickerLayout] = useState<'grid'|'list'>('grid')

  // Portföy işlem modalı
  const [tradeModal, setTradeModal] = useState<{ticker: string, avgBuy: number, lots: number, currency: string}|null>(null)

  // ── AUTH & LOAD ──────────────────────────────────────
  useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) { window.location.href = '/auth/login'; return }
    setUser(session.user)
    loadData(session.user.id)
    fetchUSDTRY()
  })
}, [])

  async function refreshPortfolioPrices(data: AllEntries) {
  const tickers = new Set<string>()
  for (const ents of Object.values(data)) {
    for (const e of ents) {
      if (e.status === 'buy' || e.status === 'sell') tickers.add(e.ticker.trim())
    }
  }
  const results = await Promise.all([...tickers].map(async t => {
    const pd = await fetchPrice(t)
    return { t, pd }
  }))
  const prices: Record<string, PriceData> = {}
  for (const { t, pd } of results) {
    if (pd) prices[t] = pd
  }
  setPortfolioPrices(prices)
}
  async function fetchUSDTRY() {
    try {
      const res = await fetch('/api/price?ticker=USDTRY')
      const q = await res.json()
      if (q.current) setUsdTryRate(q.current)
    } catch {}
  }

  async function loadData(userId: string) {
    setLoading(true)
    const { data: rows, error } = await supabase
      .from('trade_entries')
      .select('*')
      .eq('user_id', userId)
      .order('id', { ascending: true })

    if (error) { console.error('loadData error:', error); setLoading(false); return }

    const data: AllEntries = {}
    for (const row of rows || []) {
      if (!data[row.date]) data[row.date] = []
      data[row.date].push({
        id: row.id, ticker: row.ticker.trim(), comment: row.comment,
        status: row.status, direction: row.direction || 'long',
        cs: row.cs || (row.status === 'watch' ? 'watch' : `${row.status}-${row.direction || 'long'}`) as CS,
        lot: row.lot, buyPrice: row.buy_price, sellPrice: row.sell_price,
        time: row.time, prices: row.prices
      })
    }
    setAllEntries(data)
    setLoading(false)

    const today = dateKey(new Date())
    const todayEntries = data[today] || []
    if (todayEntries.length > 0) {
      const tickers = [...new Set(todayEntries.map(e => e.ticker))]
      const results = await Promise.all(tickers.map(t => fetchPrice(t)))
      const updated = { ...data }
      for (let i = 0; i < tickers.length; i++) {
        const pd = results[i]
        if (pd && updated[today]) {
          updated[today] = updated[today].map(e => e.ticker === tickers[i] ? { ...e, prices: pd } : e)
        }
      }
      setAllEntries(updated)
      refreshPortfolioPrices(data)
    }
  }

  const key = dateKey(currentDate)
  const entries = allEntries[key] || []

  // ── GET ALL TICKER ENTRIES ────────────────────────────
  function getAllEntriesForTicker(t: string): (Entry & { date: string })[] {
    const result: (Entry & { date: string })[] = []
    for (const [date, ents] of Object.entries(allEntries)) {
      for (const e of ents) {
        if (e.ticker === t) result.push({ ...e, date })
      }
    }
    return result
  }

  // ── ADD ENTRY ─────────────────────────────────────────
  async function addEntry() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/auth/login'); return }
    const currentUser = session.user
    if (!ticker.trim() || !comment.trim()) return

    const cs = compositeStatus(status, direction)
    const entry: Entry = {
      id: Date.now(), ticker: ticker.toUpperCase(), comment, status, direction, cs,
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
    setTicker(''); setComment(''); setLot(''); setBuyPrice(''); setSellPrice('')
    setLivePriceBadge(''); setAutoBuyPrice(null)

    setSyncing(true)
    await supabase.from('trade_entries').insert({
      id: entry.id, date: key, ticker: entry.ticker, comment: entry.comment,
      status: entry.status, direction: entry.direction, cs: entry.cs,
      lot: entry.lot, buy_price: entry.buyPrice, sell_price: entry.sellPrice,
      time: entry.time, prices: null, user_id: currentUser.id
    })
    setSyncing(false)

    const pd = await fetchPrice(entry.ticker)
    if (pd) {
      setAllEntries(prev => {
        const u = { ...prev }
        if (u[key]) u[key] = u[key].map(e => e.id === entry.id ? { ...e, prices: pd } : e)
        return u
      })
      await supabase.from('trade_entries').update({ prices: pd }).eq('id', entry.id)
    }
  }

  // ── DELETE ENTRY ──────────────────────────────────────
  async function deleteEntry(id: number, date?: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const d = date || key
    const entry = (allEntries[d] || []).find(e => e.id === id)
    if (!entry) return
    const updated = { ...allEntries }
    updated[d] = updated[d].filter(e => e.id !== id)
    setAllEntries(updated)
    setDeletedItems(prev => [{ ...entry, date: d } as any, ...prev])
    await supabase.from('trade_entries').delete().eq('id', id)
    await supabase.from('deleted_entries').insert({
      id: entry.id, date: d, ticker: entry.ticker, comment: entry.comment,
      status: entry.status, direction: entry.direction, cs: entry.cs,
      lot: entry.lot, buy_price: entry.buyPrice, sell_price: entry.sellPrice,
      time: entry.time, prices: entry.prices, source_date: d,
      deleted_at: new Date().toISOString(), user_id: session.user.id
    })
  }
  // ── Revert Trade ─────────────────────────────────────
  async function revertTrade(entryId: number) {
    if (!confirm('Bu işlemi geri almak istediğinize emin misiniz?')) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    // Tüm tarihlerde bu entry'i bul
    for (const [date, ents] of Object.entries(allEntries)) {
      const idx = ents.findIndex(e => e.id === entryId)
      if (idx !== -1) {
        const entry = ents[idx]
        // Sadece sell-long ve buy-short geri alınabilir
        if (entry.cs !== 'sell-long' && entry.cs !== 'buy-short') {
          alert('Bu işlem türü geri alınamaz.')
          return
        }
        // State'ten kaldır
        const updated = { ...allEntries }
        updated[date] = updated[date].filter(e => e.id !== entryId)
        if (updated[date].length === 0) delete updated[date]
        setAllEntries(updated)

        // Supabase'den sil
        await supabase.from('trade_entries').delete().eq('id', entryId)
        return
      }
    }
  }
  // ── RESTORE ENTRY ─────────────────────────────────────
  async function restoreEntry(id: number) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const item = deletedItems.find(e => e.id === id) as any
    if (!item) return
    const date = item.date || key
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
      time: entry.time, prices: entry.prices, user_id: session.user.id
    })
  }

  // ── TICKER BLUR ───────────────────────────────────────
  async function onTickerBlur() {
    if (!ticker.trim()) return
    setLivePriceBadge('yükleniyor…')
    const pd = await fetchPrice(ticker.toUpperCase())
    if (pd) setLivePriceBadge(`${currencySymbol(pd.currency)}${pd.current.toFixed(2)}`)
    else setLivePriceBadge('')

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
    if (e.ticker.trim() !== t) continue
    const cs = e.cs || (e.status === 'watch' ? 'watch' : `${e.status}-${e.direction || 'long'}`)
    if (cs === 'buy-long' && e.lot && e.buyPrice) {
      const total = longLots * avgBuy + e.lot * e.buyPrice
      longLots += e.lot; avgBuy = total / longLots
    } else if (cs === 'sell-long' && e.lot) {
      longLots = Math.max(0, longLots - e.lot)
      if (longLots === 0) avgBuy = 0
    } else if (cs === 'buy-short' && e.lot && e.buyPrice) {
      const total = shortLots * avgShort + e.lot * e.buyPrice
      shortLots += e.lot; avgShort = total / shortLots
    } else if (cs === 'sell-short' && e.lot) {
      shortLots = Math.max(0, shortLots - e.lot)
      if (shortLots === 0) avgShort = 0
    }
  }
  return { longLots, avgBuy, shortLots, avgShort }
}

async function signOut() {
  await supabase.auth.signOut()
  window.location.href = '/'
}
  const tabs = [
  { id: 'daily', label: '📅 Günlük' },
  { id: 'tickers', label: '🔖 Hisse Takip' },
  { id: 'portfolio', label: '💼 Portföy' },
  { id: 'history', label: '🗂 Geçmiş' },
] as const
function switchToTab(tab: typeof activeTab) {
  setActiveTab(tab)
  if (tab === 'portfolio') {
    const tickers = new Set<string>()
    for (const ents of Object.values(allEntries)) {
      for (const e of ents) {
        if (e.status === 'buy' || e.status === 'sell') tickers.add(e.ticker.trim())
      }
    }
    Promise.all([...tickers].map(async t => {
      const pd = await fetchPrice(t)
      if (pd) setPortfolioPrices(prev => ({ ...prev, [t]: pd }))
    }))
  }
}
  function buildPortfolio() {
  const allFlat: (Entry & { date: string })[] = []
  for (const [date, ents] of Object.entries(allEntries)) {
    for (const e of ents) allFlat.push({ ...e, date })
  }
  allFlat.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)

  const positions: Record<string, any> = {}
  const realized: any[] = []

  for (const e of allFlat) {
    const t = e.ticker.trim()
    const cur = e.prices?.currency || (t.endsWith('.IS') ? 'TRY' : 'USD')

    if (!positions[t]) {
      positions[t] = {
        longLots: 0, avgBuy: 0, totalCost: 0,
        shortLots: 0, avgShort: 0, totalShortCost: 0,
        currency: cur, prices: e.prices
      }
    }
    const pos = positions[t]
    if (e.prices) { pos.prices = e.prices; pos.currency = e.prices.currency }

    const cs = e.cs || (e.status === 'watch' ? 'watch' : `${e.status}-${e.direction || 'long'}`)
    const lot = e.lot != null && e.lot > 0 ? e.lot : 0

    if (cs === 'buy-long') {
      // Long pozisyon AÇ
      if (lot > 0) {
        if (e.buyPrice != null && e.buyPrice > 0) {
          pos.totalCost += lot * e.buyPrice
          pos.longLots += lot
          pos.avgBuy = pos.totalCost / pos.longLots
        } else {
          pos.longLots += lot
        }
      }

    } else if (cs === 'sell-long') {
      // Long pozisyon KAPAT
      const lots = Math.min(lot, pos.longLots || 0)
      if (lots > 0) {
        const cost = (e.buyPrice != null && e.buyPrice > 0) ? e.buyPrice : pos.avgBuy
        if (cost > 0 && e.sellPrice != null && e.sellPrice > 0) {
          realized.push({
            id: e.id, ticker: t, lots,
            pnl: (e.sellPrice - cost) * lots,
            pct: (e.sellPrice - cost) / cost * 100,
            type: 'long', currency: pos.currency,
            sym: currencySymbol(pos.currency),
            buyPrice: cost, sellPrice: e.sellPrice, date: e.date
          })
        }
        pos.longLots = Math.max(0, pos.longLots - lots)
        pos.totalCost = pos.longLots * pos.avgBuy
        if (pos.longLots === 0) { pos.avgBuy = 0; pos.totalCost = 0 }
      }

    } else if (cs === 'buy-short') {
  // buy + short = short pozisyon AÇ
  const lotCount = e.lot != null && e.lot > 0 ? e.lot : 0
  if (lotCount > 0) {
    if (e.buyPrice != null && e.buyPrice > 0) {
      pos.totalShortCost = (pos.totalShortCost || 0) + lotCount * e.buyPrice
      pos.shortLots += lotCount
      pos.avgShort = pos.totalShortCost / pos.shortLots
    } else {
      pos.shortLots += lotCount
    }
  }

    } else if (cs === 'sell-short') {
      // Short pozisyon KAPAT — "Satıldı + Short"
      // sellPrice = geri alış (kapanış) fiyatı
      const lots = Math.min(lot, pos.shortLots || 0)
      if (lots > 0) {
        const openPrice = pos.avgShort // açılış fiyatı
        const closePrice = e.sellPrice != null && e.sellPrice > 0 ? e.sellPrice : null
        if (openPrice > 0 && closePrice != null) {
          // Short K/Z: açılış - kapanış (düşerse kar)
          realized.push({
            id: e.id, ticker: t, lots,
            pnl: (openPrice - closePrice) * lots,
            pct: (openPrice - closePrice) / openPrice * 100,
            type: 'short', currency: pos.currency,
            sym: currencySymbol(pos.currency),
            buyPrice: openPrice, sellPrice: closePrice, date: e.date
          })
        }
        pos.shortLots = Math.max(0, pos.shortLots - lots)
        pos.totalShortCost = pos.shortLots * pos.avgShort
        if (pos.shortLots === 0) { pos.avgShort = 0; pos.totalShortCost = 0 }
      }
    }
  }

  return { positions, realized }
}

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Syne', sans-serif" }}>
      {/* Grid background */}
      <div className="fixed inset-0 pointer-events-none z-0" style={{
        backgroundImage: `linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)`,
        backgroundSize: '40px 40px'
      }} />

      {/* Stock Modal */}
      {/* Trade Modal */}
{tradeModal && (
  <TradeModal
    data={tradeModal}
    onClose={() => setTradeModal(null)}
    allEntries={allEntries}
    onSubmit={async (sellPrice, lots, tradeDate, buyPrice) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return
  const cs: CS = 'sell-long'
  const entry: Entry = {
    id: Date.now(),
    ticker: tradeModal!.ticker,
    comment: `Portföy satışı — ${lots} lot @ ${tradeModal!.currency === 'TRY' ? '₺' : '$'}${sellPrice.toFixed(2)}`,
    status: 'sell', direction: 'long', cs,
    lot: lots,
    buyPrice: buyPrice,
    sellPrice,
    time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    prices: null
  }
  const updated = { ...allEntries }
  if (!updated[tradeDate]) updated[tradeDate] = []
  updated[tradeDate] = [...updated[tradeDate], entry]
  setAllEntries(updated)
  await supabase.from('trade_entries').insert({
    id: entry.id, date: tradeDate, ticker: entry.ticker, comment: entry.comment,
    status: 'sell', direction: 'long', cs: 'sell-long',
    lot: lots, buy_price: buyPrice, sell_price: sellPrice,
    time: entry.time, prices: null, user_id: session.user.id
  })
  setTradeModal(null)
}}
  />
)}
      {modalTicker && (
        <StockModal
          ticker={modalTicker}
          entries={getAllEntriesForTicker(modalTicker)}
          onClose={() => setModalTicker(null)}
          user={user}
          onAddEntry={async (entry, date) => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return
            const fullEntry = { ...entry, id: entry.id || Date.now() } as Entry
            const updated = { ...allEntries }
            if (!updated[date]) updated[date] = []
            updated[date] = [...updated[date], fullEntry]
            setAllEntries(updated)
            await supabase.from('trade_entries').insert({
              id: fullEntry.id, date, ticker: fullEntry.ticker, comment: fullEntry.comment,
              status: fullEntry.status, direction: fullEntry.direction, cs: fullEntry.cs,
              lot: fullEntry.lot, buy_price: fullEntry.buyPrice, sell_price: fullEntry.sellPrice,
              time: fullEntry.time, prices: fullEntry.prices, user_id: session.user.id
            })
          }}
       />
      )}

      <div className="relative z-10 max-w-[1150px] mx-auto px-6 pb-20">
        {/* HEADER */}
        <header className="flex items-center justify-between py-7 mb-8" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg text-black" style={{ background: 'var(--accent)' }}>📈</div>
            <button onClick={() => router.push('/')} className="text-xl font-black hover:opacity-80 transition-all">
              Trade<span style={{ color: 'var(--accent)' }}>Log</span>
            </button>
          </div>
          <div className="flex items-center gap-4">
            {syncing && <span className="text-xs font-mono animate-pulse" style={{ color: 'var(--accent)' }}>⟳ kaydediliyor…</span>}
            <span className="text-xs font-mono hidden sm:block" style={{ color: 'var(--text2)' }}>{user?.user_metadata?.full_name || user?.email?.split('@')[0]}</span>
            <button onClick={() => window.location.href = '/profile'}
              className="px-3 py-2 rounded-lg text-xs font-mono transition-all"
              style={{ border: '1px solid var(--border2)', color: 'var(--text2)' }}>
              Profil
            </button>
            <button onClick={signOut}
              className="px-3 py-2 rounded-lg text-xs font-mono transition-all"
              style={{ border: '1px solid var(--border2)', color: 'var(--text2)' }}>
              Çıkış
            </button>
          </div>
        </header>

        {/* TABS */}
        <div className="flex gap-1 rounded-xl p-1 mb-7" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => switchToTab(t.id as typeof activeTab)}
              className="flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all"
              style={activeTab === t.id
                ? { background: 'var(--surface2)', color: 'var(--text)' }
                : { color: 'var(--text2)' }}>
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
                className="w-10 h-10 rounded-lg flex items-center justify-center transition-all"
                style={{ border: '1px solid var(--border2)', background: 'var(--surface)', color: 'var(--text2)' }}>←</button>
              <div className="flex-1">
                <span className="text-2xl font-bold">{formatDateTR(currentDate)}</span>
                <span className="font-mono text-sm ml-3" style={{ color: 'var(--text2)' }}>{weekdayTR(currentDate)}</span>
              </div>
              <button onClick={() => setDpOpen(true)}
                className="px-4 py-2 rounded-lg font-mono text-xs transition-all"
                style={{ border: '1px solid var(--border2)', background: 'var(--surface)', color: 'var(--text2)' }}>
                📅 Tarih Seç
              </button>
              <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate()+1); setCurrentDate(d) }}
                className="w-10 h-10 rounded-lg flex items-center justify-center transition-all"
                style={{ border: '1px solid var(--border2)', background: 'var(--surface)', color: 'var(--text2)' }}>→</button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { label: 'Takipte', value: entries.filter(e=>e.status==='watch').length, color: 'var(--yellow)' },
                { label: 'Alınan', value: entries.filter(e=>e.status==='buy').length, color: 'var(--accent)' },
                { label: 'Satılan', value: entries.filter(e=>e.status==='sell').length, color: 'var(--red)' },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>{s.label}</div>
                  <div className="font-mono text-5xl font-medium" style={{ color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Add Form */}
            <div className="rounded-xl p-6 mb-7 relative overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: `linear-gradient(90deg, var(--accent), transparent)` }} />
              <div className="font-mono text-[11px] uppercase tracking-[2px] mb-5" style={{ color: 'var(--accent)' }}>Yeni Kayıt</div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>Hisse Kodu</label>
                  <div className="relative">
                    <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} onBlur={onTickerBlur}
                      className="w-full rounded-lg px-4 py-2.5 font-mono tracking-widest text-sm outline-none pr-28 transition-all"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text)' }}
                      placeholder="THYAO, AAPL…" />
                    {livePriceBadge && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px]" style={{ color: 'var(--accent)' }}>
                        {livePriceBadge}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>Durum</label>
                  <div className="flex gap-2">
                    {(['watch','buy','sell'] as Status[]).map(s => (
                      <button key={s} onClick={() => { setStatus(s); if(s==='watch'){setBuyPrice('');setSellPrice('');setAutoBuyPrice(null)} if(s==='buy'){setSellPrice('');setAutoBuyPrice(null)} }}
                        className="flex-1 py-2.5 rounded-lg text-xs font-semibold border transition-all"
                        style={status === s ? {
                          background: s==='watch'?'rgba(255,209,102,0.1)':s==='buy'?'var(--accent-dim)':'rgba(255,77,109,0.1)',
                          borderColor: s==='watch'?'var(--yellow)':s==='buy'?'var(--accent)':'var(--red)',
                          color: s==='watch'?'var(--yellow)':s==='buy'?'var(--accent)':'var(--red)'
                        } : { borderColor: 'var(--border2)', color: 'var(--text2)' }}>
                        {s === 'watch' ? '👁 Takip' : s === 'buy' ? '✅ Alındı' : '💸 Satıldı'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {status !== 'watch' && (
                <div className="mb-4">
                  <label className="block font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>Yön</label>
                  <div className="flex gap-2 w-48">
                    {(['long','short'] as Direction[]).map(d => (
                      <button key={d} onClick={() => setDirection(d)}
                        className="flex-1 py-2 rounded-lg text-xs font-bold border transition-all"
                        style={direction === d ? {
                          background: d==='long'?'var(--accent-dim)':'rgba(96,165,250,0.1)',
                          borderColor: d==='long'?'var(--accent)':'var(--blue)',
                          color: d==='long'?'var(--accent)':'var(--blue)'
                        } : { borderColor: 'var(--border2)', color: 'var(--text2)' }}>
                        {d === 'long' ? '↑ Long' : '↓ Short'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {status !== 'watch' && (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div>
                    <label className="block font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>Lot</label>
                    <input type="number" value={lot} onChange={e => setLot(e.target.value)}
                      className="w-full rounded-lg px-3 py-2.5 font-mono text-sm outline-none transition-all"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text)' }}
                      placeholder="100" />
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>
                      {autoBuyPrice ? 'Ort. Maliyet (Otomatik)' : 'Alış Fiyatı'}
                    </label>
                    <input type="number" value={buyPrice} onChange={e => setBuyPrice(e.target.value)}
                      readOnly={!!autoBuyPrice && status === 'sell'}
                      className="w-full rounded-lg px-3 py-2.5 font-mono text-sm outline-none transition-all"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border2)', color: autoBuyPrice && status==='sell' ? 'var(--text3)' : 'var(--text)' }}
                      placeholder="0.00" />
                  </div>
                  {status === 'sell' && (
                    <div>
                      <label className="block font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>Satış Fiyatı</label>
                      <input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)}
                        className="w-full rounded-lg px-3 py-2.5 font-mono text-sm outline-none transition-all"
                        style={{ background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text)' }}
                        placeholder="0.00" />
                    </div>
                  )}
                </div>
              )}

              <div className="mb-4">
                <label className="block font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>Yorum & Analiz</label>
                <textarea value={comment} onChange={e => setComment(e.target.value)}
                  className="w-full rounded-lg px-4 py-3 text-sm outline-none resize-y min-h-20 transition-all"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text)' }}
                  placeholder="Bu hisse neden ilgi çekici?…" />
              </div>
              <button onClick={addEntry}
                className="w-full py-3 font-bold rounded-lg text-black transition-all"
                style={{ background: 'var(--accent)' }}>
                + Kayıt Ekle
              </button>
            </div>

            {/* Entries */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Günlük Kayıtlar</h2>
              <span className="font-mono text-xs px-3 py-1 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>{entries.length} kayıt</span>
            </div>

            {entries.length === 0 ? (
              <div className="text-center py-16" style={{ color: 'var(--text3)' }}>
                <div className="text-4xl mb-3 opacity-40">📋</div>
                <p className="font-mono text-sm">Bu gün için kayıt yok.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {entries.map(e => {
                  const cur = e.prices?.currency || (e.ticker?.endsWith('.IS') ? 'TRY' : 'USD')
                  const sym = currencySymbol(cur)
                  return (
                    <div key={e.id} className="rounded-xl p-5 grid gap-4 transition-all"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', gridTemplateColumns: '88px 1fr auto', borderLeft: `3px solid ${csBorderColor(e.cs)}` }}>
                      <div className="flex flex-col items-center gap-1.5 pt-0.5">
                        <button onClick={() => setModalTicker(e.ticker)}
                          className="font-mono text-base font-medium tracking-widest transition-colors hover:underline"
                          style={{ color: 'var(--accent)' }}>
                          {e.ticker}
                        </button>
                        <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full ${csBadgeClass(e.cs)}`}>{SL[e.cs]}</span>
                        <div className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>{e.time}</div>
                      </div>
                      <div>
                        {e.lot && (
                          <div className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-1 rounded-full mb-2"
                            style={{ background: 'var(--surface2)', color: 'var(--text3)' }}>
                            📦 {e.lot} lot{e.buyPrice ? ` · ${sym}${e.buyPrice}` : ''}{e.sellPrice ? ` · ${sym}${e.sellPrice}` : ''}
                          </div>
                        )}
                        <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text2)' }}>{e.comment}</p>
                        {e.prices ? (
                          <div className="flex gap-4 flex-wrap">
                            <div>
                              <div className="font-mono text-[9px] uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Güncel</div>
                              <div className="font-mono text-sm">{sym}{e.prices.current.toFixed(2)}</div>
                              {e.prices.change != null && (
                                <div className={`font-mono text-[11px] ${e.prices.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {e.prices.change >= 0 ? '+' : ''}{e.prices.change.toFixed(2)}%
                                </div>
                              )}
                            </div>
                            {e.buyPrice && e.prices.current && (() => {
                              const pnl = e.cs === 'sell-long' && e.sellPrice
                                ? (e.sellPrice - e.buyPrice!) * (e.lot ?? 1)
                                : (e.prices!.current - e.buyPrice!) * (e.lot ?? 1)
                              const isPos = pnl >= 0
                              return (
                                <div>
                                  <div className="font-mono text-[9px] uppercase tracking-wider" style={{ color: 'var(--text3)' }}>K/Z</div>
                                  <div className={`font-mono text-sm font-medium ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {isPos ? '+' : ''}{sym}{Math.abs(pnl).toFixed(2)}
                                  </div>
                                </div>
                              )
                            })()}
                          </div>
                        ) : (
                          <div className="font-mono text-xs animate-pulse" style={{ color: 'var(--text3)' }}>fiyat yükleniyor…</div>
                        )}
                      </div>
                      <button onClick={() => deleteEntry(e.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all self-start"
                        style={{ border: '1px solid var(--border2)', color: 'var(--text3)' }}>
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
            <input value={tickerSearch} onChange={e => setTickerSearch(e.target.value.toUpperCase())}
              className="w-full rounded-xl px-4 py-3 font-mono tracking-widest text-sm outline-none mb-5 transition-all"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
              placeholder="HİSSE ARA…" />

            {(() => {
              const map: Record<string, (Entry & { date: string })[]> = {}
              for (const [date, ents] of Object.entries(allEntries)) {
                for (const e of ents) {
                  if (!map[e.ticker]) map[e.ticker] = []
                  map[e.ticker].push({ ...e, date })
                }
              }
              const tickers = Object.keys(map)
                .filter(t => !tickerSearch || t.includes(tickerSearch))
                .sort((a, b) => {
                if (tickerSort === 'alpha') return a.localeCompare(b)
                // En son yorum tarihine göre
                const latestA = Math.max(...map[a].map(e => new Date(e.date).getTime()))
                const latestB = Math.max(...map[b].map(e => new Date(e.date).getTime()))
                return latestB - latestA
                })

              return (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold">Hisse Takip</h2>
                    <span className="font-mono text-xs px-3 py-1 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>{tickers.length} hisse</span>
                  </div>
                    {/* Sıralama ve görünüm */}
<div className="flex items-center justify-between mb-4">
  <div className="flex gap-2">
    <button onClick={() => setTickerSort('recent')}
      className="px-3 py-1.5 rounded-lg text-xs font-mono transition-all"
      style={tickerSort === 'recent'
        ? { background: 'var(--accent-dim)', border: '1px solid var(--accent)', color: 'var(--accent)' }
        : { border: '1px solid var(--border2)', color: 'var(--text2)' }}>
      Son Yorum
    </button>
    <button onClick={() => setTickerSort('alpha')}
      className="px-3 py-1.5 rounded-lg text-xs font-mono transition-all"
      style={tickerSort === 'alpha'
        ? { background: 'var(--accent-dim)', border: '1px solid var(--accent)', color: 'var(--accent)' }
        : { border: '1px solid var(--border2)', color: 'var(--text2)' }}>
      A→Z
    </button>
  </div>
  <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--surface2)' }}>
    <button onClick={() => setTickerLayout('grid')}
      className="px-3 py-1 rounded-md text-xs transition-all"
      style={tickerLayout === 'grid'
        ? { background: 'var(--surface)', color: 'var(--text)' }
        : { color: 'var(--text2)' }}>⊞ Grid</button>
    <button onClick={() => setTickerLayout('list')}
      className="px-3 py-1 rounded-md text-xs transition-all"
      style={tickerLayout === 'list'
        ? { background: 'var(--surface)', color: 'var(--text)' }
        : { color: 'var(--text2)' }}>☰ Liste</button>
  </div>
</div>
                  
                  <div className={tickerLayout === 'grid'
                    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'
                    : 'flex flex-col gap-2'}>
                    {tickers.map(t => {
                      const ents = map[t]
                      const latest = [...ents].sort((a, b) => b.date.localeCompare(a.date))[0]
                      const p = latest.prices
                      const cur = p?.currency || (t.endsWith('.IS') ? 'TRY' : 'USD')
                      const sym = currencySymbol(cur)
                      return (
                        <button key={t} onClick={() => setModalTicker(t)}
                          className="rounded-xl p-4 text-left transition-all"
                          style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            display: tickerLayout === 'list' ? 'flex' : 'block',
                            alignItems: tickerLayout === 'list' ? 'center' : undefined,
                            gap: tickerLayout === 'list' ? '16px' : undefined,
                          }}>
                          <div className="font-mono text-lg font-medium tracking-widest" style={{ color: 'var(--accent)', minWidth: tickerLayout === 'list' ? '80px' : undefined }}>{t}</div>
                          <div className="font-mono text-sm" style={{ flex: tickerLayout === 'list' ? 1 : undefined }}>
                            {p?.current ? (
                              <>
                                {sym}{p.current.toFixed(2)}
                                {p.change != null && (
                                  <span className={`text-xs ml-2 ${p.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {p.change >= 0 ? '+' : ''}{p.change.toFixed(2)}%
                                  </span>
                                )}
                              </>
                            ) : <span style={{ color: 'var(--text3)', fontSize: '12px' }}>—</span>}
                          </div>
                          <div className="font-mono text-[9px]" style={{ color: 'var(--text3)' }}>
                            {ents.length} yorum · Son: {latest.date}
                          </div>
                      </button>
                      )
                    })}
                  </div>
                </>
              )
            })()}
          </div>
        )}

        {/* ── PORTFOLIO TAB ── */}
        {activeTab === 'portfolio' && (() => {
          const { positions, realized } = buildPortfolio()
          const openLong = Object.entries(positions).filter(([, p]) => p.longLots > 0)
          const openShort = Object.entries(positions).filter(([, p]) => p.shortLots > 0)
          for (const [t, pos] of Object.entries(positions)) {
            if (portfolioPrices[t]) {
              pos.prices = portfolioPrices[t]
              pos.currency = portfolioPrices[t].currency
            }
          }

          function convertPnl(pnl: number, cur: string) {
            if (cur === pfCurrency) return pnl
            if (cur === 'USD' && pfCurrency === 'TRY' && usdTryRate) return pnl * usdTryRate
            if (cur === 'TRY' && pfCurrency === 'USD' && usdTryRate) return pnl / usdTryRate
            return pnl
          }
          const pfSym = pfCurrency === 'TRY' ? '₺' : '$'
          let totalUnrealized = 0, totalRealized = 0
          for (const [, pos] of openLong) {
            if (pos.prices?.current && pos.avgBuy)
              totalUnrealized += convertPnl((pos.prices.current - pos.avgBuy) * pos.longLots, pos.currency)
          }
          for (const [t, pos] of openShort) {
            const cp = portfolioPrices[t]?.current || pos.prices?.current
            if (cp && pos.avgShort > 0)
              totalUnrealized += convertPnl((pos.avgShort - cp) * pos.shortLots, pos.currency)
          }
          for (const r of realized) totalRealized += convertPnl(r.pnl, r.currency)

          return (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold">Portföy</h2>
                <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--surface2)' }}>
                  {(['TRY', 'USD'] as const).map(c => (
                    <button key={c} onClick={() => setPfCurrency(c)}
                      className="px-4 py-1.5 rounded-lg text-xs font-mono font-medium transition-all"
                      style={pfCurrency === c ? { background: 'var(--surface)', color: 'var(--text)' } : { color: 'var(--text2)' }}>
                      {c === 'TRY' ? '₺ TRY' : '$ USD'}
                    </button>
                  ))}
                </div>
              </div>
              {usdTryRate && <p className="font-mono text-xs mb-6" style={{ color: 'var(--text3)' }}>1 USD = ₺{usdTryRate.toFixed(2)}</p>}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                {[
                  { label: 'Açık Pozisyon', value: String(openLong.length + openShort.length), color: 'var(--text)' },
                  { label: 'Anlık K/Z', value: `${totalUnrealized >= 0 ? '+' : ''}${pfSym}${Math.abs(totalUnrealized).toFixed(2)}`, color: totalUnrealized >= 0 ? 'var(--accent)' : 'var(--red)' },
                  { label: 'Gerçekleşen K/Z', value: `${totalRealized >= 0 ? '+' : ''}${pfSym}${Math.abs(totalRealized).toFixed(2)}`, color: totalRealized >= 0 ? 'var(--accent)' : 'var(--red)' },
                  { label: 'Toplam K/Z', value: `${(totalUnrealized + totalRealized) >= 0 ? '+' : ''}${pfSym}${Math.abs(totalUnrealized + totalRealized).toFixed(2)}`, color: (totalUnrealized + totalRealized) >= 0 ? 'var(--accent)' : 'var(--red)' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>{s.label}</div>
                    <div className="font-mono text-2xl font-medium" style={{ color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Open Long */}
              <h3 className="font-bold mb-3 flex items-center gap-2">
                Açık Long <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>LONG</span>
              </h3>
              {openLong.length === 0 ? (
                <p className="font-mono text-sm mb-6" style={{ color: 'var(--text3)' }}>Açık long pozisyon yok.</p>
              ) : (
                <div className="overflow-x-auto mb-6">
                  <table className="w-full text-sm">
                    <thead><tr className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>
                      {['Hisse', 'Lot', 'Ort. Maliyet', 'Güncel', 'Anlık K/Z', 'K/Z %'].map(h => <th key={h} className="text-left py-2 px-3">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {openLong.map(([t, pos]) => {
                        const cp = portfolioPrices[t]?.current || pos.prices?.current
                        const sym = currencySymbol(pos.currency)
                        // Long K/Z: güncel - maliyet
                        const uPnl = cp && pos.avgBuy > 0 ? (cp - pos.avgBuy) * pos.longLots : null
                        const uPct = cp && pos.avgBuy > 0 ? (cp - pos.avgBuy) / pos.avgBuy * 100 : null
                        return <tr key={t} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="py-3 px-3">
                            <button onClick={() => setTradeModal({
                              ticker: t,
                              avgBuy: pos.avgBuy,
                              lots: pos.longLots,
                              currency: pos.currency
                            })}
                              className="font-mono font-medium hover:underline flex items-center gap-1"
                              style={{ color: 'var(--accent)' }}>
                              {t} <span className="text-[9px]" style={{ color: 'var(--text3)' }}>↗ sat</span>
                            </button>
                          </td>
                          <td className="py-3 px-3 font-mono">{pos.longLots}</td>
                          <td className="py-3 px-3 font-mono">{sym}{pos.avgBuy.toFixed(2)}</td>
                          <td className="py-3 px-3 font-mono">{cp ? sym + cp.toFixed(2) : '—'}</td>
                          <td className={`py-3 px-3 font-mono font-medium ${uPnl != null ? (uPnl >= 0 ? 'text-emerald-400' : 'text-red-400') : ''}`}>
                            {uPnl != null ? (uPnl >= 0 ? '+' : '') + sym + Math.abs(uPnl).toFixed(2) : '—'}
                          </td>
                          <td className={`py-3 px-3 font-mono ${uPct != null ? (uPct >= 0 ? 'text-emerald-400' : 'text-red-400') : ''}`}>
                            {uPct != null ? (uPct >= 0 ? '+' : '') + uPct.toFixed(2) + '%' : '—'}
                          </td>
                        </tr>
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {/* Open Short */}
              <h3 className="font-bold mb-3 mt-6 flex items-center gap-2">
                Açık Short <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: 'rgba(96,165,250,0.1)', color: 'var(--blue)' }}>SHORT</span>
              </h3>
              {openShort.length === 0 ? (
                <p className="font-mono text-sm mb-6" style={{ color: 'var(--text3)' }}>Açık short pozisyon yok.</p>
              ) : (
                <div className="overflow-x-auto mb-6">
                  <table className="w-full text-sm">
                    <thead><tr className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>
                      {['Hisse', 'Lot', 'Short Giriş', 'Güncel', 'Anlık K/Z', 'K/Z %'].map(h => <th key={h} className="text-left py-2 px-3">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {openShort.map(([t, pos]) => {
                        const cp = portfolioPrices[t]?.current || pos.prices?.current
                        const sym = currencySymbol(pos.currency)
                        // Short K/Z: giriş - güncel (düşerse kar)
                        const uPnl = cp && pos.avgShort > 0 ? (pos.avgShort - cp) * pos.shortLots : null
                        const uPct = cp && pos.avgShort > 0 ? (pos.avgShort - cp) / pos.avgShort * 100 : null
                        return <tr key={t} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="py-3 px-3">
                            <button onClick={() => setModalTicker(t)}
                              className="font-mono font-medium hover:underline flex items-center gap-1"
                              style={{ color: 'var(--blue)' }}>
                              {t}
                            </button>
                          </td>
                          <td className="py-3 px-3 font-mono">{pos.shortLots}</td>
                          <td className="py-3 px-3 font-mono">{sym}{pos.avgShort.toFixed(2)}</td>
                          <td className="py-3 px-3 font-mono">{cp ? sym + cp.toFixed(2) : '—'}</td>
                          <td className={`py-3 px-3 font-mono font-medium ${uPnl != null ? (uPnl >= 0 ? 'text-emerald-400' : 'text-red-400') : ''}`}>
                            {uPnl != null ? (uPnl >= 0 ? '+' : '') + sym + Math.abs(uPnl).toFixed(2) : '—'}
                          </td>
                          <td className={`py-3 px-3 font-mono ${uPct != null ? (uPct >= 0 ? 'text-emerald-400' : 'text-red-400') : ''}`}>
                            {uPct != null ? (uPct >= 0 ? '+' : '') + uPct.toFixed(2) + '%' : '—'}
                          </td>
                        </tr>
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {/* Realized */}
              <h3 className="font-bold mb-3 flex items-center gap-2">
                Kapatılan İşlemler <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,77,109,0.1)', color: 'var(--red)' }}>GERÇEKLEŞTİ</span>
              </h3>
              {realized.length === 0 ? (
                <p className="font-mono text-sm" style={{ color: 'var(--text3)' }}>Henüz kapatılan işlem yok.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>
                      {['Tarih','Hisse','Yön','Lot','Giriş','Çıkış','K/Z','K/Z %',''].map(h => <th key={h} className="text-left py-2 px-3">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {[...realized].sort((a, b) => b.date.localeCompare(a.date)).map(r => {
                        const ep = r.type === 'long' ? r.buyPrice : r.sellPrice
                        const xp = r.type === 'long' ? r.sellPrice : r.buyPrice
                        return <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="py-3 px-3 font-mono text-xs" style={{ color: 'var(--text2)' }}>{r.date}</td>
                          <td className="py-3 px-3">
                            <button onClick={() => setModalTicker(r.ticker)} className="font-mono font-medium hover:underline" style={{ color: 'var(--accent)' }}>{r.ticker}</button>
                          </td>
                          <td className="py-3 px-3"><span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${r.type === 'long' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-blue-400/10 text-blue-400'}`}>{r.type.toUpperCase()}</span></td>
                          <td className="py-3 px-3 font-mono">{r.lots}</td>
                          <td className="py-3 px-3 font-mono">{r.sym}{ep.toFixed(2)}</td>
                          <td className="py-3 px-3 font-mono">{r.sym}{xp.toFixed(2)}</td>
                          <td className={`py-3 px-3 font-mono font-medium ${r.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.pnl >= 0 ? '+' : ''}{r.sym}{Math.abs(r.pnl).toFixed(2)}</td>
                          <td className={`py-3 px-3 font-mono ${r.pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.pct >= 0 ? '+' : ''}{r.pct.toFixed(2)}%</td>
                          <td className="py-3 px-3">
                            <button onClick={() => revertTrade(r.id)}
                              className="font-mono text-[10px] px-3 py-1 rounded-lg transition-all whitespace-nowrap"
                              style={{ border: '1px solid var(--border2)', color: 'var(--text3)' }}>
                              ↩ Geri Al
                            </button>
                          </td>
                        </tr>
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })()}

        {/* ── HISTORY TAB ── */}
        {activeTab === 'history' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">Geçmiş</h2>
              <span className="font-mono text-xs px-3 py-1 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>{deletedItems.length} kayıt</span>
            </div>
            {deletedItems.length === 0 ? (
              <div className="text-center py-16" style={{ color: 'var(--text3)' }}>
                <div className="text-4xl mb-3 opacity-40">🗂</div>
                <p className="font-mono text-sm">Silinmiş kayıt yok.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {deletedItems.map((e: any) => (
                  <div key={e.id} className="rounded-xl p-5 grid gap-4 opacity-70 hover:opacity-100 transition-all"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', gridTemplateColumns: '100px 1fr auto' }}>
                    <div>
                      <div className="font-mono text-xs" style={{ color: 'var(--text2)' }}>{e.sourceDate || e.date || '—'}</div>
                      <div className="font-mono text-xs mt-1" style={{ color: 'var(--text3)' }}>{e.time}</div>
                    </div>
                    <div>
                      <div className="font-mono font-medium mb-1">{e.ticker}</div>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--text2)' }}>{(e.comment || '').slice(0, 150)}{(e.comment || '').length > 150 ? '…' : ''}</p>
                    </div>
                    <button onClick={() => restoreEntry(e.id)}
                      className="px-3 py-1.5 rounded-lg font-mono text-[10px] transition-all self-start whitespace-nowrap"
                      style={{ border: '1px solid var(--border2)', color: 'var(--text3)' }}>
                      ↩ Geri Yükle
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* DATE PICKER */}
      {dpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={() => setDpOpen(false)}>
          <div className="rounded-2xl p-7 w-80" style={{ background: 'var(--surface)', border: '1px solid var(--border2)' }}
            onClick={e => e.stopPropagation()}>
            <div className="font-mono text-[11px] uppercase tracking-widest mb-5" style={{ color: 'var(--accent)' }}>Tarih Seç</div>
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => { if(dpMonth===0){setDpMonth(11);setDpYear(y=>y-1)}else setDpMonth(m=>m-1) }}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                style={{ border: '1px solid var(--border2)', color: 'var(--text2)' }}>←</button>
              <span className="font-bold">
                {['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'][dpMonth]} {dpYear}
              </span>
              <button onClick={() => { if(dpMonth===11){setDpMonth(0);setDpYear(y=>y+1)}else setDpMonth(m=>m+1) }}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                style={{ border: '1px solid var(--border2)', color: 'var(--text2)' }}>→</button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-4">
              {['Pt','Sa','Ça','Pe','Cu','Ct','Pz'].map(d => (
                <div key={d} className="text-center font-mono text-[9px] py-1" style={{ color: 'var(--text3)' }}>{d}</div>
              ))}
              {Array.from({ length: (new Date(dpYear, dpMonth, 1).getDay() + 6) % 7 }).map((_, i) => <div key={i} />)}
              {Array.from({ length: new Date(dpYear, dpMonth + 1, 0).getDate() }).map((_, i) => {
                const d = i + 1
                const isSelected = dpSelected && new Date(dpYear, dpMonth, d).toDateString() === dpSelected.toDateString()
                const isToday = new Date(dpYear, dpMonth, d).toDateString() === new Date().toDateString()
                return (
                  <button key={d} onClick={() => setDpSelected(new Date(dpYear, dpMonth, d))}
                    className="aspect-square rounded-lg font-mono text-xs flex items-center justify-center transition-all"
                    style={isSelected
                      ? { background: 'var(--accent)', color: '#000', fontWeight: 700 }
                      : isToday
                      ? { color: 'var(--accent)', fontWeight: 700, border: '1px solid var(--accent)' }
                      : { color: 'var(--text2)' }}>
                    {d}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDpOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                style={{ border: '1px solid var(--border2)', color: 'var(--text2)' }}>İptal</button>
              <button onClick={() => { const d = new Date(dpSelected); d.setHours(0,0,0,0); setCurrentDate(d); setDpOpen(false) }}
                className="px-4 py-2 rounded-lg text-sm font-bold text-black transition-all"
                style={{ background: 'var(--accent)' }}>Seç</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}