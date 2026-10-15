// Fetches PAGASA's current Tropical Cyclone Bulletin(s), parses the wind
// signal for Naga City / Camarines Sur and stores it in `pagasa_bulletins`.
// Runs on a Supabase cron (every 15-30 min). The flood model backend is not
// involved. The web app only ever reads the table.
//
// Manual test (any known bulletin PDF, e.g. a past storm):
//   POST { "pdf_url": "https://pubfiles.pagasa.dost.gov.ph/tamss/weather/bulletin/TCB%237_maymay.pdf", "dry_run": true }
// dry_run returns the parsed result without writing to the database.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1'
import { findLatestBulletinUrls, parseBulletin, parseBulletinUrl } from '../_shared/pagasa-parse.ts'

const BULLETIN_PAGES = [
  'https://www.pagasa.dost.gov.ph/tropical-cyclone-bulletin-iframe/',
  'https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin',
]
const PDF_HOST = 'pubfiles.pagasa.dost.gov.ph'
const UA = 'AGOS-FloodMonitor/1.0 (barangay flood early warning; low-frequency polling)'

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return await res.text()
}

async function pdfToText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`PDF ${res.status} ${url}`)
  const pdf = await getDocumentProxy(new Uint8Array(await res.arrayBuffer()))
  const { text } = await extractText(pdf, { mergePages: true })
  return text
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  let body: { pdf_url?: string; dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* cron calls send no body */ }

  // 1. Which bulletin PDFs are current?
  let urls: string[] = []
  if (body.pdf_url) {
    if (new URL(body.pdf_url).hostname !== PDF_HOST) return json({ error: `pdf_url must be on ${PDF_HOST}` }, 400)
    urls = [body.pdf_url]
  } else {
    let reached = 0
    for (const page of BULLETIN_PAGES) {
      try {
        urls.push(...findLatestBulletinUrls(await fetchText(page)))
        reached++
      } catch (err) {
        console.error('bulletin page failed:', (err as Error).message)
      }
    }
    // If PAGASA was unreachable we know nothing: leave existing rows alone.
    if (reached === 0) return json({ error: 'PAGASA bulletin pages unreachable' }, 502)
    urls = [...new Set(urls)]
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // 2. Nothing listed = no active cyclone. Retire old rows.
  if (urls.length === 0) {
    if (!body.dry_run) await supabase.from('pagasa_bulletins').update({ is_active: false }).eq('is_active', true)
    return json({ active: 0 })
  }

  // 3. Parse and store each current bulletin.
  const results: unknown[] = []
  const activeKeys: string[] = []
  for (const url of urls) {
    const id = parseBulletinUrl(url)
    if (!id) { results.push({ url, error: 'unrecognised bulletin URL' }); continue }
    try {
      const text = await pdfToText(url)
      const p = parseBulletin(text)
      const row = {
        cyclone_name: id.name, bulletin_no: id.no, pdf_url: url,
        issued_at: p.issuedAt, category: p.category,
        max_winds_kph: p.maxWindsKph, gust_kph: p.gustKph, pressure_hpa: p.pressureHpa,
        movement: p.movement,
        center_lat: p.center?.lat ?? null, center_lon: p.center?.lon ?? null,
        track: p.track, signals: p.signals, signals_found: p.signalsFound,
        naga_signal: p.nagaSignal, naga_match: p.nagaMatch, naga_partial: p.nagaPartial,
        parse_ok: p.parseOk, is_active: true, fetched_at: new Date().toISOString(),
      }
      if (body.dry_run) { results.push({ row, text_length: text.length, full_text: text.slice(0, 40000) }); continue }
      const { error } = await supabase.from('pagasa_bulletins').upsert(row, { onConflict: 'cyclone_name,bulletin_no' })
      if (error) throw new Error(error.message)
      activeKeys.push(`${id.name}:${id.no}`)
      results.push({ name: id.name, no: id.no, parse_ok: p.parseOk, naga_signal: p.nagaSignal })
    } catch (err) {
      console.error('bulletin failed:', url, (err as Error).message)
      results.push({ url, error: (err as Error).message })
    }
  }

  // 4. Retire rows that are no longer the current bulletin. Only when at
  // least one bulletin was stored this run, so a parse failure never wipes
  // the last good data.
  if (!body.dry_run && activeKeys.length > 0) {
    const { data: rows } = await supabase.from('pagasa_bulletins').select('id, cyclone_name, bulletin_no').eq('is_active', true)
    const stale = (rows ?? []).filter((r: any) => !activeKeys.includes(`${r.cyclone_name}:${r.bulletin_no}`)).map((r: any) => r.id)
    if (stale.length) await supabase.from('pagasa_bulletins').update({ is_active: false }).in('id', stale)
  }

  return json({ active: urls.length, results })
})
