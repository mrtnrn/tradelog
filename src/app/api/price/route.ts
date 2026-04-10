import { NextRequest, NextResponse } from 'next/server'

const FINNHUB_KEY = process.env.FINNHUB_KEY!

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker')
  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 })

  try {
    const sym = ticker.endsWith('.IS') ? 'BORSA:' + ticker.replace('.IS', '') : ticker
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_KEY}`
    )
    if (!res.ok) return NextResponse.json({ error: 'fetch failed' }, { status: 500 })
    const q = await res.json()
    if (!q.c || q.c === 0) return NextResponse.json({ error: 'no data' }, { status: 404 })

    const currency = sym.startsWith('BORSA:') ? 'TRY' : 'USD'
    return NextResponse.json({
      current: q.c,
      close: q.pc,
      prevClose: q.pc,
      currency,
      change: q.pc ? (q.c - q.pc) / q.pc * 100 : null,
      resolvedSymbol: ticker
    })
  } catch {
    return NextResponse.json({ error: 'server error' }, { status: 500 })
  }
}