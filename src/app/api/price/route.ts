import { NextRequest, NextResponse } from 'next/server'

const FINNHUB_KEY = process.env.FINNHUB_KEY!

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker')
  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 })

  try {
    const sym = ticker.endsWith('.IS') ? 'BORSA:' + ticker.replace('.IS', '') : ticker
    const url = `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_KEY}`
    const res = await fetch(url)
    const q = await res.json()
    // Debug: ham veriyi döndür
    return NextResponse.json({ sym, q, key_exists: !!FINNHUB_KEY })
  } catch(e) {
    return NextResponse.json({ error: String(e) })
  }
}