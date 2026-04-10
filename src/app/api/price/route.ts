import { NextRequest, NextResponse } from 'next/server'

const FINNHUB_KEY = process.env.FINNHUB_KEY!

async function tryFetch(sym: string) {
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_KEY}`)
  const q = await res.json()
  if (q.c && q.c !== 0) return { q, sym }
  return null
}

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker')
  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 })

  try {
    const clean = ticker.replace('.IS', '').toUpperCase()
    
    // BIST için farklı formatları dene
    const formats = [
      clean,           // THYAO
      `BORSA:${clean}`, // BORSA:THYAO  
      `${clean}.IS`,   // THYAO.IS
      `IST:${clean}`,  // IST:THYAO
    ]

    let result = null
    for (const fmt of formats) {
      result = await tryFetch(fmt)
      if (result) break
    }

    if (!result) return NextResponse.json({ error: 'no data' }, { status: 404 })

    const { q, sym } = result
    const isBIST = ticker.includes('.IS') || ticker.toUpperCase() === clean
    // Eğer US hissesi değilse TRY kabul et
    const isUS = ['AAPL','TSLA','MSFT','GOOGL','AMZN','META','NVDA'].includes(clean)
    const currency = (!isUS && isBIST) ? 'TRY' : (q.c > 100 && !ticker.includes('.IS') ? 'USD' : 'TRY')

    return NextResponse.json({
      current: q.c, close: q.pc, prevClose: q.pc, currency,
      change: q.pc ? (q.c - q.pc) / q.pc * 100 : null,
      resolvedSymbol: sym
    })
  } catch(e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}