import { NextRequest, NextResponse } from 'next/server'

const FINNHUB_KEY = process.env.FINNHUB_KEY!

async function fetchFinnhub(sym: string) {
  const res = await fetch(
    `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_KEY}`
  )
  const q = await res.json()
  if (!q.c || q.c === 0) return null
  const isBIST = sym.startsWith('BORSA:')
  const currency = isBIST ? 'TRY' : 'USD'
  return { current: q.c, close: q.pc, prevClose: q.pc, currency,
    change: q.pc ? (q.c - q.pc) / q.pc * 100 : null, resolvedSymbol: sym }
}

async function fetchYahoo(symbol: string) {
  const res = await fetch(
    `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  )
  if (!res.ok) return null
  const data = await res.json()
  const result = data?.chart?.result?.[0]
  if (!result) return null
  const meta = result.meta
  const current = meta.regularMarketPrice || meta.previousClose
  const prevClose = meta.previousClose || meta.chartPreviousClose
  if (!current) return null
  const currency = symbol.endsWith('.IS') ? 'TRY' : (meta.currency || 'USD')
  return { current, close: prevClose, prevClose, currency,
    change: prevClose ? (current - prevClose) / prevClose * 100 : null,
    resolvedSymbol: symbol }
}

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker')
  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 })

  try {
    const upper = ticker.toUpperCase()
    const clean = upper.replace('.IS', '')

    // 1. Finnhub US hissesi (direkt)
    if (!upper.includes('.')) {
      const pd = await fetchFinnhub(upper)
      if (pd) return NextResponse.json(pd)
    }

    // 2. Finnhub BIST (BORSA: formatı)
    const pdBorsa = await fetchFinnhub(`BORSA:${clean}`)
    if (pdBorsa) return NextResponse.json(pdBorsa)

    // 3. Yahoo Finance fallback (sunucudan CORS yok)
    const pdYahoo = await fetchYahoo(clean + '.IS')
    if (pdYahoo) return NextResponse.json(pdYahoo)

    // 4. Yahoo US
    const pdYahooUS = await fetchYahoo(upper)
    if (pdYahooUS) return NextResponse.json(pdYahooUS)

    return NextResponse.json({ error: 'no data' }, { status: 404 })
  } catch(e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}